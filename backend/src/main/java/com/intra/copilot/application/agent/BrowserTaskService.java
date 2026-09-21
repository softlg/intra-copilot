package com.intra.copilot.application.agent;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.domain.agent.BrowserActionValidator;
import com.intra.copilot.domain.agent.BrowserInteractionMode;
import com.intra.copilot.domain.agent.BrowserRuntimeKind;
import com.intra.copilot.domain.agent.BrowserTask;
import com.intra.copilot.domain.agent.BrowserTaskEvent;
import com.intra.copilot.domain.agent.BrowserTaskStatus;
import com.intra.copilot.infrastructure.agent.BrowserCapabilityTools;
import com.intra.copilot.infrastructure.ai.LlmClient;
import com.intra.copilot.infrastructure.persistence.agent.BrowserTaskEventRepository;
import com.intra.copilot.infrastructure.persistence.agent.BrowserTaskRepository;
import com.intra.copilot.shared.identity.RequestContext;
import jakarta.annotation.PreDestroy;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.RejectedExecutionException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Queues and runs unattended browser tasks on a server-side browser runtime. */
@Service
public class BrowserTaskService {
    private static final Logger log = LoggerFactory.getLogger(BrowserTaskService.class);
    private static final Duration MODEL_TIMEOUT = Duration.ofSeconds(180);
    private final BrowserTaskRepository tasks;
    private final BrowserTaskEventRepository events;
    private final BrowserTaskCommandService commands;
    private final BrowserRuntimeRegistry runtimes;
    private final BrowserCapabilityTools browserTools;
    private final SystemAgentCatalog catalog;
    private final LlmClient llm;
    private final ObjectMapper json;
    private final ExecutorService workers;

    public BrowserTaskService(
            BrowserTaskRepository tasks,
            BrowserTaskEventRepository events,
            BrowserTaskCommandService commands,
            BrowserRuntimeRegistry runtimes,
            BrowserCapabilityTools browserTools,
            SystemAgentCatalog catalog,
            LlmClient llm,
            ObjectMapper json,
            @Value("${browser.runtime.worker-threads:4}") int workerThreads) {
        this.tasks = tasks;
        this.events = events;
        this.commands = commands;
        this.runtimes = runtimes;
        this.browserTools = browserTools;
        this.catalog = catalog;
        this.llm = llm;
        this.json = json;
        int threads = Math.max(1, Math.min(16, workerThreads));
        this.workers =
                Executors.newFixedThreadPool(
                        threads,
                        runnable -> {
                            Thread thread = new Thread(runnable, "browser-task-worker");
                            thread.setDaemon(true);
                            return thread;
                        });
    }

    public BrowserTask create(CreateRequest request) {
        RequestContext.Identity identity = RequestContext.currentOrNull();
        if (identity != null
                && request != null
                && request.idempotencyKey() != null
                && !request.idempotencyKey().isBlank()) {
            BrowserTask existing =
                    tasks.findByIdempotencyKey(identity.userId(), request.idempotencyKey())
                            .orElse(null);
            if (existing != null) {
                resumeIfNeeded(existing);
                return tasks.findById(existing.getTaskId()).orElse(existing);
            }
        }
        BrowserTask task = newTask(request);
        BrowserTask saved = tasks.save(task);
        event(saved, "TASK_CREATED", saved.getStatus(), Map.of("capability", task.getCapability()));
        schedule(saved, identity);
        return saved;
    }

    public BrowserTask createAndWait(CreateRequest request, Duration timeout) {
        BrowserTask task = create(request);
        return await(task.getTaskId(), timeout);
    }

    public BrowserTask await(String taskId, Duration timeout) {
        long deadline = System.nanoTime() + Math.max(1L, timeout.toMillis()) * 1_000_000L;
        for (;;) {
            BrowserTask current =
                    tasks.findById(taskId)
                            .orElseThrow(() -> new NoSuchElementException("浏览器任务不存在"));
            if (current.statusValue().terminal()) return current;
            if (System.nanoTime() >= deadline) {
                throw new IllegalStateException("浏览器任务等待超时");
            }
            try {
                TimeUnit.MILLISECONDS.sleep(160L);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("浏览器任务等待被中断", error);
            }
        }
    }

    public void resume(String taskId) {
        BrowserTask task = tasks.findById(taskId).orElse(null);
        if (task == null) return;
        resumeIfNeeded(task);
    }

    @PreDestroy
    public void shutdown() {
        workers.shutdownNow();
    }

    BrowserTask newTask(CreateRequest request) {
        if (request == null || request.goal() == null || request.goal().isBlank()) {
            throw new IllegalArgumentException("浏览器任务目标不能为空");
        }
        String capability =
                request.capability() == null || request.capability().isBlank()
                        ? SystemAgentCatalog.BROWSER_OPERATE
                        : request.capability().trim().toLowerCase(Locale.ROOT);
        if (!List.of(SystemAgentCatalog.BROWSER_OPERATE, SystemAgentCatalog.BROWSER_EXTRACT)
                .contains(capability)) {
            throw new IllegalArgumentException("不支持的浏览器能力：" + capability);
        }
        BrowserTask task = new BrowserTask();
        task.setOwnerUserId(RequestContext.current().userId());
        task.setConversationId(trim(request.conversationId()));
        task.setCapability(capability);
        task.setProtocolVersion(
                request.protocolVersion() == null ? 1 : request.protocolVersion());
        task.setIdempotencyKey(trim(request.idempotencyKey()));
        task.setInteractionMode(
                request.interactionMode() == null
                        ? BrowserInteractionMode.VISIBLE_VIRTUAL.name()
                        : BrowserInteractionMode.from(request.interactionMode()).name());
        task.setRuntimeKind(
                request.runtimeKind() == null || request.runtimeKind().isBlank()
                        ? BrowserRuntimeKind.SERVER.name()
                        : BrowserRuntimeKind.from(request.runtimeKind()).name());
        task.setStatus(BrowserTaskStatus.CREATED.name());
        task.setGoal(request.goal().trim());
        String startUrl = validateStartUrl(request.startUrl());
        task.setStartUrl(startUrl);
        List<String> allowedOrigins = normalizeAllowedOrigins(request.allowedOrigins());
        if (allowedOrigins.isEmpty() && startUrl != null) {
            URI uri = URI.create(startUrl);
            allowedOrigins = List.of(uri.getScheme().toLowerCase(Locale.ROOT) + "://" + uri.getHost());
        }
        task.setAllowedOrigins(
                writeJson(allowedOrigins));
        task.setBusinessContext(writeJson(request.businessContext() == null ? Map.of() : request.businessContext()));
        task.setConstraints(writeJson(request.constraints() == null ? Map.of() : request.constraints()));
        task.setSuccessCriteria(
                writeJson(
                        request.successCriteria() == null
                                ? List.of()
                                : request.successCriteria().stream()
                                        .filter(value -> value != null && !value.isBlank())
                                        .limit(10)
                                        .toList()));
        task.setMaxSteps(request.maxSteps() == null ? 10 : request.maxSteps());
        task.setExpiresAt(Instant.now().plus(Duration.ofMinutes(30)));
        return task;
    }

    public BrowserTask get(String taskId) {
        BrowserTask task =
                tasks.findById(taskId)
                        .orElseThrow(() -> new NoSuchElementException("浏览器任务不存在"));
        if (!RequestContext.current().userId().equals(task.getOwnerUserId())) {
            throw new NoSuchElementException("浏览器任务不存在");
        }
        return task;
    }

    public List<BrowserTask> list(int limit) {
        return tasks.findByOwner(RequestContext.current().userId(), limit);
    }

    public List<BrowserTaskEvent> events(String taskId) {
        get(taskId);
        return events.findByTask(taskId);
    }

    public BrowserTask cancel(String taskId) {
        BrowserTask task = get(taskId);
        if (task.statusValue().terminal()) return task;
        task.setStatus(BrowserTaskStatus.CANCELED.name());
        task.setCompletedAt(Instant.now());
        clearLease(task);
        clearExecution(task);
        task.touch();
        BrowserTask saved = tasks.save(task);
        tasks.clearExecution(saved.getTaskId());
        commands.cancelActive(saved.getTaskId(), "用户取消了浏览器任务");
        event(saved, "TASK_CANCELED", saved.getStatus(), Map.of());
        return saved;
    }

    private void resumeIfNeeded(BrowserTask task) {
        if (task == null || task.statusValue().terminal()) return;
        if (task.getExecutionAttempts() >= 3) {
            fail(task, "浏览器任务连续启动失败，已停止自动恢复", task.getStepsUsed());
            return;
        }
        if (task.statusValue() != BrowserTaskStatus.CREATED) {
            Instant heartbeat = task.getWorkerHeartbeatAt();
            if (heartbeat != null && heartbeat.isAfter(Instant.now().minus(Duration.ofMinutes(10)))) {
                return;
            }
            if (tasks.requeue(task.getTaskId(), task.getStatus(), Instant.now()) != 1) {
                return;
            }
            task.setStatus(BrowserTaskStatus.CREATED.name());
            task.setExecutionToken(null);
            task.setWorkerHeartbeatAt(null);
        }
        schedule(task, systemIdentity(task.getOwnerUserId()));
    }

    private void schedule(BrowserTask task, RequestContext.Identity identity) {
        String executionToken = UUID.randomUUID().toString();
        Instant now = Instant.now();
        if (tasks.markQueued(task.getTaskId(), executionToken, now) != 1) {
            BrowserTask current = tasks.findById(task.getTaskId()).orElse(null);
            if (current == null || current.statusValue().terminal()) return;
            log.debug(
                    "Browser task already queued or running taskId={} status={}",
                    task.getTaskId(),
                    current.getStatus());
            return;
        }
        task.setStatus(BrowserTaskStatus.QUEUED.name());
        task.setExecutionToken(executionToken);
        task.setWorkerHeartbeatAt(now);
        event(task, "TASK_QUEUED", task.getStatus(), Map.of("attempt", executionToken));
        try {
            workers.execute(
                    () -> runScheduledTask(task.getTaskId(), executionToken, identity));
        } catch (RejectedExecutionException error) {
            fail(task, "浏览器任务执行线程池不可用", 0);
        }
    }

    private void runScheduledTask(
            String taskId, String executionToken, RequestContext.Identity identity) {
        try {
            RequestContext.runWith(identity, () -> executeTask(taskId, executionToken));
        } catch (Throwable error) {
            log.error(
                    "Browser task worker crashed taskId={} executionToken={}",
                    taskId,
                    executionToken,
                    error);
            BrowserTask task = tasks.findById(taskId).orElse(null);
            if (task != null && !task.statusValue().terminal()) {
                fail(
                        task,
                        error.getMessage() == null
                                ? error.getClass().getSimpleName()
                                : error.getMessage(),
                        task.getStepsUsed());
            }
        }
    }

    private RequestContext.Identity systemIdentity(String ownerUserId) {
        return new RequestContext.Identity(
                "system", ownerUserId, "browser-task-worker");
    }

    private void executeTask(String taskId, String executionToken) {
        BrowserTask task = tasks.findById(taskId).orElse(null);
        if (task == null || task.statusValue().terminal()) return;
        if (!BrowserTaskStatus.QUEUED.name().equals(task.getStatus())
                || !Objects.equals(executionToken, task.getExecutionToken())) {
            return;
        }
        BrowserRuntime runtime = awaitRuntime(task);
        if (runtime == null) {
            fail(task, "没有可用的浏览器 Runtime：" + task.getRuntimeKind(), 0);
            return;
        }
        if (tasks.startExecution(taskId, executionToken, Instant.now()) != 1) {
            log.info(
                    "Browser task execution ownership changed taskId={} token={}",
                    taskId,
                    executionToken);
            return;
        }
        task = tasks.findById(taskId).orElse(task);
        event(task, "TASK_STARTED", task.getStatus(), Map.of("runtime", runtime.kind().name()));
        try {
            String answer = runAgentLoop(task, runtime);
            if (tasks.findById(taskId).map(item -> item.statusValue().terminal()).orElse(false)) {
                runtime.close(task);
                return;
            }
            task.setStatus(BrowserTaskStatus.COMPLETED.name());
            task.setResult(writeJson(Map.of("summary", answer, "stepsUsed", task.getStepsUsed())));
            task.setCompletedAt(Instant.now());
            task.setError(null);
            clearLease(task);
            task.touch();
            tasks.save(task);
            tasks.clearExecution(task.getTaskId());
            task.setExecutionToken(null);
            task.setWorkerHeartbeatAt(null);
            event(task, "TASK_COMPLETED", task.getStatus(), Map.of("summary", answer));
        } catch (Exception error) {
            fail(task, safeMessage(error), task.getStepsUsed());
        } finally {
            runtime.close(task);
        }
    }

    private BrowserRuntime awaitRuntime(BrowserTask task) {
        boolean remote =
                task.runtimeKind() == BrowserRuntimeKind.EXTENSION
                        || task.runtimeKind() == BrowserRuntimeKind.EMBEDDED;
        long deadline =
                System.nanoTime()
                        + (remote ? Duration.ofSeconds(60).toNanos() : 0L);
        long nextHeartbeatAt = 0L;
        do {
            if (System.nanoTime() >= nextHeartbeatAt) {
                heartbeat(task);
                nextHeartbeatAt = System.nanoTime() + Duration.ofSeconds(2).toNanos();
            }
            BrowserRuntime runtime =
                    runtimes.findForTask(task, task.interactionMode()).orElse(null);
            if (runtime != null) return runtime;
            if (!remote || System.nanoTime() >= deadline) {
                return allowRuntimeFallback(task)
                                ? runtimes.defaultRuntimeForTask(
                                                task,
                                                task.interactionMode(),
                                                task.runtimeKind())
                                        .orElse(null)
                                : null;
            }
            try {
                TimeUnit.MILLISECONDS.sleep(250L);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                return null;
            }
            BrowserTask current = tasks.findById(task.getTaskId()).orElse(null);
            if (current == null || current.statusValue().terminal()) return null;
        } while (true);
    }

    private boolean allowRuntimeFallback(BrowserTask task) {
        try {
            return json.readTree(task.getConstraints()).path("allowFallback").asBoolean(false);
        } catch (Exception ignored) {
            return false;
        }
    }

    private String runAgentLoop(BrowserTask task, BrowserRuntime runtime) throws Exception {
        SystemAgentCatalog.Spec spec = catalog.find(SystemAgentCatalog.BROWSER_OPERATOR).orElseThrow();
        String system =
                spec.systemPrompt()
                        + "\n\n[浏览器任务]\n"
                        + writeJson(
                                Map.of(
                                        "capability", task.getCapability(),
                                        "goal", task.getGoal(),
                                        "startUrl", Objects.toString(task.getStartUrl(), ""),
                                        "businessContext", readMap(task.getBusinessContext()),
                                        "constraints", readMap(task.getConstraints()),
                                        "successCriteria", readList(task.getSuccessCriteria()),
                                        "interactionMode", task.getInteractionMode()))
                        + "\n只通过 function calling 调用浏览器工具。先观察页面，再执行动作；每个写动作必须验证。";
        List<Map<String, String>> turns = new ArrayList<>();
        List<ToolCallback> callbacks =
                browserTools.toolIds().stream().map(browserTools::callback).toList();
        String lastAnswer = "";
        for (int step = 0; step < task.getMaxSteps(); step++) {
            heartbeat(task);
            BrowserTask current = tasks.findById(task.getTaskId()).orElse(null);
            if (current == null
                    || current.statusValue() == BrowserTaskStatus.CANCELED
                    || current.statusValue() != BrowserTaskStatus.RUNNING
                    || !Objects.equals(task.getExecutionToken(), current.getExecutionToken())) {
                throw new IllegalStateException("浏览器任务执行权已失效");
            }
            ToolCallReply reply =
                    callModel(
                            system,
                            turns,
                            step == 0 ? "开始执行浏览器任务：" + task.getGoal() : "",
                            callbacks);
            if (reply.content() != null && !reply.content().isBlank()) {
                lastAnswer = reply.content().trim();
            }
            if (reply.toolCalls().isEmpty()) {
                return lastAnswer.isBlank() ? "任务已结束。" : lastAnswer;
            }
            for (AssistantMessage.ToolCall call : reply.toolCalls()) {
                ToolCallback callback = resolveToolCallback(callbacks, call.name());
                if (callback == null) {
                    turns.add(
                            Map.of(
                                    "role",
                                    "user",
                                    "content",
                                    "Tool 不允许调用：" + call.name()));
                    continue;
                }
                String output = callback.call(call.arguments());
                if (!output.startsWith("BROWSER_ACTION:")) {
                    turns.add(Map.of("role", "user", "content", output));
                    continue;
                }
                BrowserActionValidator.NormalizedAction action =
                        BrowserActionValidator.normalize(output.substring("BROWSER_ACTION:".length()));
                enforceTaskPolicy(task, action);
                task.setStatus(BrowserTaskStatus.RUNNING.name());
                task.setStepsUsed(task.getStepsUsed() + 1);
                task.touch();
                tasks.save(task);
                event(
                        task,
                        "ACTION_STARTED",
                        task.getStatus(),
                        Map.of(
                                "type", action.type(),
                                "target", action.target(),
                                "reason", action.reason(),
                                "risk", action.risk(),
                                "step", task.getStepsUsed()));
                BrowserRuntime.ActionResult result = runtime.execute(task, action);
                event(
                        task,
                        "ACTION_FINISHED",
                        result.status(),
                        Map.of(
                                "type", action.type(),
                                "ok", result.ok(),
                                "verified", result.verified(),
                                "error", Objects.toString(result.error(), "")));
                Map<String, Object> actionResult = new LinkedHashMap<>();
                actionResult.put("status", result.status());
                actionResult.put("ok", result.ok());
                actionResult.put("verified", result.verified());
                actionResult.put("result", result.result());
                actionResult.put("error", Objects.toString(result.error(), ""));
                actionResult.put("observation", observationMap(result.observation()));
                turns.add(
                        Map.of(
                                "role",
                                "user",
                                "content",
                                "浏览器动作结果：\n" + writeJson(actionResult)));
                if (!result.ok()) {
                    task.setStatus(BrowserTaskStatus.FAILED.name());
                    task.setError(Objects.toString(result.error(), "浏览器动作失败"));
                    task.touch();
                    tasks.save(task);
                    throw new IllegalStateException(Objects.toString(result.error(), "浏览器动作失败"));
                }
                if (action.type().equals("SNAPSHOT")
                        || action.type().equals("VERIFY")
                        || action.type().equals("EXTRACT")) {
                    task.setStatus(BrowserTaskStatus.RUNNING.name());
                    task.touch();
                    tasks.save(task);
                }
            }
        }
        return lastAnswer.isBlank() ? "已达到最大步骤数。" : lastAnswer;
    }

    private ToolCallReply callModel(
            String system,
            List<Map<String, String>> turns,
            String user,
            List<ToolCallback> callbacks)
            throws Exception {
        List<ChatResponse> responses =
                llm.streamWithTools(system, turns, user, List.of(), callbacks.toArray(new ToolCallback[0]))
                        .collectList()
                        .block(MODEL_TIMEOUT);
        if (responses == null) throw new IllegalStateException("模型没有返回结果");
        StringBuilder content = new StringBuilder();
        List<AssistantMessage.ToolCall> toolCalls = List.of();
        for (ChatResponse response : responses) {
            if (response == null || response.getResult() == null || response.getResult().getOutput() == null) {
                continue;
            }
            AssistantMessage output = response.getResult().getOutput();
            if (output.getText() != null) content.append(output.getText());
            if (output.hasToolCalls()) toolCalls = output.getToolCalls();
        }
        return new ToolCallReply(content.toString(), toolCalls);
    }

    private ToolCallback resolveToolCallback(List<ToolCallback> callbacks, String name) {
        return callbacks.stream()
                .filter(callback -> callback.getToolDefinition().name().equals(name))
                .findFirst()
                .orElse(null);
    }

    private void enforceTaskPolicy(BrowserTask task, BrowserActionValidator.NormalizedAction action)
            throws Exception {
        JsonNode constraints = json.readTree(task.getConstraints());
        if (constraints.path("allowedActions").isArray()) {
            List<String> allowed = new ArrayList<>();
            constraints.path("allowedActions").forEach(value -> allowed.add(value.asText().toUpperCase(Locale.ROOT)));
            if (!allowed.isEmpty()
                    && !BrowserActionValidator.isReadOnly(action.type())
                    && !allowed.contains(action.type())) {
                throw new IllegalArgumentException("任务策略不允许动作：" + action.type());
            }
        }
        String maxRisk = constraints.path("maxRisk").asText("medium").toLowerCase(Locale.ROOT);
        int allowedRisk = riskRank(maxRisk);
        int actionRisk = riskRank(action.risk());
        if (actionRisk > allowedRisk) {
            throw new IllegalArgumentException("动作风险超过任务限制：" + action.risk());
        }
        if ("NAVIGATE".equals(action.type())) {
            JsonNode arguments = json.readTree(action.argumentsJson());
            enforceOrigin(task, arguments.path("url").asText(""));
        }
    }

    private void fail(BrowserTask task, String message, int steps) {
        BrowserTask current = tasks.findById(task.getTaskId()).orElse(task);
        if (current.statusValue().terminal()) return;
        current.setStatus(BrowserTaskStatus.FAILED.name());
        current.setError(message);
        current.setStepsUsed(steps);
        current.setCompletedAt(Instant.now());
        clearLease(current);
        clearExecution(current);
        current.touch();
        tasks.save(current);
        tasks.clearExecution(current.getTaskId());
        commands.failActive(current.getTaskId(), message);
        event(current, "TASK_FAILED", current.getStatus(), Map.of("error", message));
    }

    private void event(
            BrowserTask task, String type, String status, Map<String, ?> payload) {
        BrowserTaskEvent event = new BrowserTaskEvent();
        event.setTaskId(task.getTaskId());
        event.setSequenceNo(events.nextSequence(task.getTaskId()));
        event.setEventType(type);
        event.setStatus(status);
        event.setPayload(writeJson(payload == null ? Map.of() : payload));
        events.save(event);
    }

    private Map<String, Object> observationMap(BrowserRuntime.Observation observation) {
        if (observation == null) return Map.of();
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("snapshotId", observation.snapshotId());
        value.put("frameId", observation.frameId());
        value.put("url", observation.url());
        value.put("title", observation.title());
        value.put("visibleText", observation.visibleText());
        value.put("domSummary", observation.domSummary());
        value.put("frames", observation.frames());
        return value;
    }

    private Map<String, Object> readMap(String raw) {
        try {
            return json.readValue(raw == null ? "{}" : raw, new TypeReference<Map<String, Object>>() {});
        } catch (Exception ignored) {
            return Map.of();
        }
    }

    private List<Object> readList(String raw) {
        try {
            return json.readValue(raw == null ? "[]" : raw, new TypeReference<List<Object>>() {});
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private String validateStartUrl(String value) {
        if (value == null || value.isBlank()) return null;
        URI uri = URI.create(value.trim());
        if (!List.of("http", "https").contains(uri.getScheme()) || uri.getHost() == null) {
            throw new IllegalArgumentException("startUrl 必须是 http 或 https 地址");
        }
        return uri.toString();
    }

    private void enforceOrigin(BrowserTask task, String url) {
        if (url == null || url.isBlank()) {
            throw new IllegalArgumentException("浏览器导航地址不能为空");
        }
        List<String> allowed = readAllowedOrigins(task.getAllowedOrigins());
        if (allowed.isEmpty()) return;
        String origin = URI.create(url).getScheme() + "://" + URI.create(url).getHost();
        boolean matched =
                allowed.stream()
                        .anyMatch(
                                value ->
                                        value.equals(origin)
                                                || (value.startsWith("*.")
                                                        && origin.endsWith(value.substring(1))));
        if (!matched) {
            throw new IllegalArgumentException("浏览器任务不允许访问该来源：" + origin);
        }
    }

    private List<String> normalizeAllowedOrigins(List<String> values) {
        if (values == null || values.isEmpty()) return List.of();
        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        for (String value : values) {
            if (value == null || value.isBlank() || normalized.size() >= 32) continue;
            String origin = value.trim().toLowerCase(Locale.ROOT).replaceAll("/+$", "");
            if (origin.startsWith("*.")) {
                String suffix = origin.substring(2);
                if (!suffix.contains(".")) {
                    throw new IllegalArgumentException("allowedOrigins 通配域名无效：" + value);
                }
                normalized.add(origin);
                continue;
            }
            URI uri = URI.create(origin);
            if (!List.of("http", "https").contains(uri.getScheme()) || uri.getHost() == null) {
                throw new IllegalArgumentException("allowedOrigins 只允许 http 或 https 来源");
            }
            normalized.add(uri.getScheme().toLowerCase(Locale.ROOT) + "://" + uri.getHost());
        }
        return List.copyOf(normalized);
    }

    private List<String> readAllowedOrigins(String raw) {
        try {
            return json.readValue(
                    raw == null || raw.isBlank() ? "[]" : raw,
                    new TypeReference<List<String>>() {});
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private String writeJson(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (Exception error) {
            throw new IllegalArgumentException("浏览器任务 JSON 无效", error);
        }
    }

    private String safeMessage(Throwable error) {
        String message = error.getMessage();
        return message == null || message.isBlank() ? error.getClass().getSimpleName() : message;
    }

    private void heartbeat(BrowserTask task) {
        if (task.getExecutionToken() == null) return;
        tasks.heartbeat(task.getTaskId(), task.getExecutionToken(), Instant.now());
    }

    private void clearLease(BrowserTask task) {
        task.setLeaseRuntimeInstanceId(null);
        task.setLeaseTokenHash(null);
        task.setLeaseExpiresAt(null);
    }

    private void clearExecution(BrowserTask task) {
        task.setExecutionToken(null);
        task.setWorkerHeartbeatAt(null);
    }

    private static int riskRank(String risk) {
        if ("high".equalsIgnoreCase(risk)) return 3;
        if ("low".equalsIgnoreCase(risk)) return 1;
        return 2;
    }

    private static String trim(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public record CreateRequest(
            String conversationId,
            String capability,
            String interactionMode,
            String runtimeKind,
            String goal,
            String startUrl,
            List<String> allowedOrigins,
            Map<String, Object> businessContext,
            Map<String, Object> constraints,
            List<String> successCriteria,
            Integer maxSteps,
            Integer protocolVersion,
            String idempotencyKey) {
        public CreateRequest(
                String conversationId,
                String capability,
                String interactionMode,
                String goal,
                String startUrl,
                Map<String, Object> businessContext,
                Map<String, Object> constraints,
                List<String> successCriteria,
                Integer maxSteps) {
            this(
                    conversationId,
                    capability,
                    interactionMode,
                    null,
                    goal,
                    startUrl,
                    List.of(),
                    businessContext,
                    constraints,
                    successCriteria,
                    maxSteps,
                    1,
                    null);
        }
    }

    private record ToolCallReply(String content, List<AssistantMessage.ToolCall> toolCalls) {}
}
