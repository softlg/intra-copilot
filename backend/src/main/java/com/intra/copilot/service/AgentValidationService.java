package com.intra.copilot.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.model.AgentValidationCase;
import com.intra.copilot.model.AgentValidationRun;
import com.intra.copilot.model.KnowledgeBase;
import com.intra.copilot.model.SkillDefinition;
import com.intra.copilot.model.ToolDefinition;
import com.intra.copilot.repo.AgentValidationCaseRepository;
import com.intra.copilot.repo.AgentValidationRunRepository;
import com.intra.copilot.repo.KnowledgeBaseRepository;
import com.intra.copilot.repo.SkillDefinitionRepository;
import com.intra.copilot.repo.ToolDefinitionRepository;
import com.intra.copilot.service.auth.RequestContext;
import com.intra.copilot.service.stream.SseExecutionService;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BiConsumer;
import java.util.function.Supplier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Static and optional behavior validation for a configured Agent. */
@Service
public class AgentValidationService {
    private static final Duration MODEL_TIMEOUT = Duration.ofSeconds(45);
    private static final int MAX_CASES = 12;
    private static final long STREAM_TIMEOUT_MS = Duration.ofMinutes(20).toMillis();
    private static final List<String> REMEDIATION_FIELDS =
            List.of("systemPrompt", "description", "routingRules");

    private final AgentConfigurationService agentConfigurations;
    private final AgentValidationRunRepository runs;
    private final AgentValidationCaseRepository cases;
    private final KnowledgeBaseRepository knowledgeBases;
    private final ToolDefinitionRepository tools;
    private final SkillDefinitionRepository skills;
    private final LlmClient llm;
    private final ObjectMapper json;
    private final AdminUserService users;
    private final AdminAuditService audits;
    private final SseExecutionService streams;
    private final Map<String, AtomicBoolean> streamCancellations = new ConcurrentHashMap<>();

    public AgentValidationService(
            AgentConfigurationService agentConfigurations,
            AgentValidationRunRepository runs,
            AgentValidationCaseRepository cases,
            KnowledgeBaseRepository knowledgeBases,
            ToolDefinitionRepository tools,
            SkillDefinitionRepository skills,
            LlmClient llm,
            ObjectMapper json,
            AdminUserService users,
            AdminAuditService audits,
            SseExecutionService streams) {
        this.agentConfigurations = agentConfigurations;
        this.runs = runs;
        this.cases = cases;
        this.knowledgeBases = knowledgeBases;
        this.tools = tools;
        this.skills = skills;
        this.llm = llm;
        this.json = json;
        this.users = users;
        this.audits = audits;
        this.streams = streams;
    }

    @Transactional
    public Map<String, Object> validateStatic(String agentId) {
        return executeValidation(agentConfigurations.get(agentId), false, List.of());
    }

    public Map<String, Object> generateValidationCases(String agentId) {
        AgentDefinition agent = agentConfigurations.get(agentId);
        List<ValidationCaseRequest> generated = generateCases(agent);
        return Map.of("agentId", agentId, "cases", generated.stream().map(this::caseView).toList());
    }

    /**
     * Builds one complete remediation candidate from all failed scenarios. The returned patch is
     * never persisted or applied here; the console shows a before/after comparison first.
     */
    public Map<String, Object> generateRemediation(String agentId, RemediationRequest request) {
        AgentDefinition agent = agentConfigurations.get(agentId);
        List<RemediationCaseRequest> failedCases = requireRemediationCases(request);
        Map<String, Object> currentValues = configuredRemediationValues(agent);
        applyRemediationOverride(currentValues, "systemPrompt", request.currentSystemPrompt());
        applyRemediationOverride(currentValues, "description", request.currentDescription());
        applyRemediationOverride(
                currentValues, "routingRules", request.currentRoutingRules());
        Map<String, Object> currentAgent = currentAgentView(agent, currentValues);
        String system =
                """
                你是 Agent 配置修复器。根据当前 Agent 配置和所有未通过验证场景，生成一份可由管理员审阅的
                完整修订候选。必须保留原有有效约束，并覆盖全部失败原因，不得补写配置中没有依据的业务事实。
                只输出 JSON：{"summary":"面向管理员的简短说明","patch":{"systemPrompt":"完整的新系统提示词",
                "description":"可选的新描述","routingRules":"可选的新路由规则"}}
                patch 必须包含可直接整段替换的 systemPrompt，而不是补丁片段；没有依据时不要修改 description
                或 routingRules。
                """;
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("currentAgent", currentAgent);
        payload.put("failedCases", failedCases);
        Map<String, Object> generated = completeJson(system, writeJson(payload));
        Map<String, Object> patch =
                sanitizeRemediationPatch(asMap(generated.get("patch")), currentValues);
        String summary = Objects.toString(generated.get("summary"), "").trim();
        if (!patch.containsKey("systemPrompt")) {
            patch =
                    fallbackRemediationPatch(
                            Objects.toString(currentValues.get("systemPrompt"), ""), failedCases);
        }
        if (summary.isBlank()) {
            summary =
                    "已基于 "
                            + failedCases.size()
                            + " 个未通过场景生成完整修订候选，请先核对差异再应用。";
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("agentId", agentId);
        result.put("summary", summary);
        result.put("sourceCaseCount", failedCases.size());
        result.put("patch", patch);
        return result;
    }

    public Map<String, Object> validateBehavior(String agentId, BehaviorRequest request) {
        return executeValidation(agentConfigurations.get(agentId), true, requireCases(request));
    }

    /**
     * Behavior validation that reports each scenario as it is evaluated so the console can show
     * progress. Still a single request and a single stored validation run; scenarios are merely
     * streamed while the loop runs.
     */
    public SseEmitter streamValidateBehavior(String agentId, BehaviorRequest request) {
        List<ValidationCaseRequest> selected = requireCases(request);
        AgentDefinition agent = agentConfigurations.get(agentId);
        String streamId = UUID.randomUUID().toString();
        AtomicBoolean canceled = new AtomicBoolean(false);
        streamCancellations.put(streamId, canceled);

        SseEmitter out = new SseEmitter(STREAM_TIMEOUT_MS);
        AtomicBoolean finished = new AtomicBoolean(false);
        Runnable cleanup = () -> {
            finished.set(true);
            streamCancellations.remove(streamId);
        };
        out.onCompletion(cleanup);
        out.onTimeout(cleanup);
        out.onError(error -> cleanup.run());
        java.util.concurrent.ScheduledFuture<?> heartbeat = streams.startHeartbeat(out, finished);

        RequestContext.Identity identity = RequestContext.currentOrNull();
        streams.executeWithIdentity(
                                        identity,
                                        () -> {
                                            try {
                                                emitStream(
                                                        out,
                                                        finished,
                                                        "run_start",
                                                        Map.of(
                                                                "runId", streamId,
                                                                "total", selected.size()));
                                                Map<String, Object> report =
                                                        executeValidation(
                                                                agent,
                                                                true,
                                                                selected,
                                                                (name, payload) ->
                                                                        emitStream(out, finished, name, payload),
                                                                () -> finished.get() || canceled.get());
                                                emitStream(out, finished, "done", report);
                                            } catch (RuntimeException error) {
                                                emitStream(
                                                        out,
                                                        finished,
                                                        "error",
                                                        Map.of("message", safeMessage(error)));
                                            } finally {
                                                if (heartbeat != null) heartbeat.cancel(true);
                                                cleanup.run();
                                                out.complete();
                                            }
                                        });
        return out;
    }

    /** Skips the scenarios that have not started yet; the running one finishes normally. */
    public Map<String, Object> cancelStreamValidation(String streamId) {
        AtomicBoolean flag = streamId == null ? null : streamCancellations.get(streamId);
        if (flag != null) flag.set(true);
        return Map.of("runId", streamId == null ? "" : streamId, "canceled", flag != null);
    }

    private List<ValidationCaseRequest> requireCases(BehaviorRequest request) {
        if (request == null || request.cases() == null || request.cases().isEmpty()) {
            throw new IllegalArgumentException("请先生成并勾选要执行的验证场景");
        }
        List<ValidationCaseRequest> selected =
                request.cases().stream()
                        .filter(Objects::nonNull)
                        .filter(item -> !blank(item.input()))
                        .map(
                                item ->
                                        blank(item.caseId())
                                                ? new ValidationCaseRequest(
                                                        "VC-" + UUID.randomUUID(),
                                                        item.title(),
                                                        item.input(),
                                                        item.pageContext(),
                                                        item.expected())
                                                : item)
                        .limit(MAX_CASES)
                        .toList();
        if (selected.isEmpty()) {
            throw new IllegalArgumentException("请至少选择一个包含输入内容的验证场景");
        }
        return selected;
    }

    private List<RemediationCaseRequest> requireRemediationCases(RemediationRequest request) {
        if (request == null || request.cases() == null || request.cases().isEmpty()) {
            throw new IllegalArgumentException("请先选择至少一个未通过的验证场景");
        }
        List<RemediationCaseRequest> selected =
                request.cases().stream()
                        .filter(Objects::nonNull)
                        .limit(MAX_CASES)
                        .toList();
        if (selected.isEmpty()) {
            throw new IllegalArgumentException("请先选择至少一个未通过的验证场景");
        }
        return selected;
    }

    private void emitStream(
            SseEmitter out, AtomicBoolean finished, String name, Map<String, Object> data) {
        if (finished.get()) return;
        try {
            out.send(SseEmitter.event().name(name).data(data));
        } catch (IOException | IllegalStateException error) {
            finished.set(true);
        }
    }

    /**
     * Legacy entry point. Static validation is the default; behavior execution now requires the
     * administrator to submit selected cases returned by {@link #generateValidationCases(String)}.
     */
    public Map<String, Object> validate(String agentId, ValidateRequest request) {
        boolean runBehavior = request != null && Boolean.TRUE.equals(request.runBehavior());
        if (runBehavior) {
            return validateBehavior(
                    agentId,
                    new BehaviorRequest(request.cases() == null ? List.of() : request.cases()));
        }
        return validateStatic(agentId);
    }

    private Map<String, Object> executeValidation(
            AgentDefinition agent, boolean runBehavior, List<ValidationCaseRequest> effectiveCases) {
        return executeValidation(agent, runBehavior, effectiveCases, null, null);
    }

    private Map<String, Object> executeValidation(
            AgentDefinition agent,
            boolean runBehavior,
            List<ValidationCaseRequest> effectiveCases,
            BiConsumer<String, Map<String, Object>> listener,
            Supplier<Boolean> canceled) {

        List<Map<String, Object>> issues = staticIssues(agent);
        List<Map<String, Object>> caseResults = new ArrayList<>();
        int passed = 0;
        int failed = 0;
        boolean stopped = false;

        AgentValidationRun run = new AgentValidationRun();
        run.setAdminUserId(users.requireCurrent().getId());
        run.setAgentId(agent.getId());
        run.setAgentVersion(agent.getVersion());
        run.setConfigHash(configHash(agent));
        run.setStatus(runBehavior ? "RUNNING" : "STATIC_COMPLETE");
        runs.save(run);

        if (runBehavior) {
            for (int index = 0; index < effectiveCases.size(); index++) {
                if (canceled != null && Boolean.TRUE.equals(canceled.get())) {
                    stopped = true;
                    break;
                }
                ValidationCaseRequest item = effectiveCases.get(index);
                Map<String, Object> scenario = new LinkedHashMap<>();
                scenario.put("caseId", item.caseId());
                scenario.put("index", index);
                scenario.put("total", effectiveCases.size());
                scenario.put("title", limit(item.title(), 200, "验证场景 " + (index + 1)));
                scenario.put("input", item.input());
                emitProgress(listener, "case_start", scenario);
                Map<String, Object> actual = executeCase(agent, item);
                boolean casePassed = Boolean.TRUE.equals(actual.get("passed"));
                if (casePassed) passed++;
                else failed++;
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("caseId", item.caseId());
                result.put("index", index);
                result.put("title", item.title());
                result.put("input", item.input());
                result.put("pageContext", item.pageContext());
                result.put("expected", item.expected());
                result.put("actualResponse", actual.get("response"));
                result.put("passed", casePassed);
                result.put("reason", actual.get("reason"));
                result.put("suggestedPatch", actual.get("suggestedPatch"));
                caseResults.add(result);

                AgentValidationCase stored = new AgentValidationCase();
                stored.setRunId(run.getId());
                stored.setCaseIndex(index);
                stored.setTitle(limit(item.title(), 200, "验证场景 " + (index + 1)));
                stored.setInputText(limit(item.input(), 8000, ""));
                stored.setPageContext(limit(item.pageContext(), 12000, null));
                stored.setExpected(limit(item.expected(), 4000, "Agent 应答满足职责与边界要求"));
                stored.setActualResponse(limit(Objects.toString(actual.get("response"), ""), 20000, null));
                stored.setPassed(casePassed);
                stored.setReason(limit(Objects.toString(actual.get("reason"), ""), 4000, null));
                cases.append(stored);

                Map<String, Object> evaluated = new LinkedHashMap<>();
                evaluated.put("index", index);
                evaluated.put("total", effectiveCases.size());
                evaluated.put("passed", casePassed);
                evaluated.put("case", result);
                emitProgress(listener, "case_result", evaluated);
            }
            run.setStatus(stopped ? "CANCELED" : "COMPLETE");
            run.setCompletedAt(Instant.now());
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("issueCount", issues.size());
        summary.put("critical", countSeverity(issues, "critical"));
        summary.put("error", countSeverity(issues, "error"));
        summary.put("warning", countSeverity(issues, "warning"));
        summary.put("info", countSeverity(issues, "info"));
        summary.put("testsRun", caseResults.size());
        summary.put("testsPassed", passed);
        summary.put("testsFailed", failed);

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("runId", run.getId());
        report.put("agentId", agent.getId());
        report.put("agentVersion", agent.getVersion());
        report.put("configHash", run.getConfigHash());
        report.put("status", run.getStatus());
        report.put("staticIssues", issues);
        report.put("cases", caseResults);
        report.put("summary", summary);
        report.put("createdAt", run.getCreatedAt());

        run.setReportJson(writeJson(report));
        runs.save(run);
        audits.record(
                runBehavior ? "VALIDATE_BEHAVIOR" : "VALIDATE_STATIC",
                "AGENT",
                agent.getId(),
                "COPILOT",
                null,
                Map.of("runId", run.getId(), "issueCount", issues.size()));
        return report;
    }

    private void emitProgress(
            BiConsumer<String, Map<String, Object>> listener, String name, Map<String, Object> data) {
        if (listener == null) return;
        try {
            listener.accept(name, data);
        } catch (RuntimeException ignored) {
            // Streaming is best effort; validation results stay authoritative.
        }
    }

    private Map<String, Object> caseView(ValidationCaseRequest item) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("caseId", item.caseId());
        value.put("title", item.title());
        value.put("input", item.input());
        value.put("pageContext", item.pageContext());
        value.put("expected", item.expected());
        return value;
    }

    public List<AgentValidationRun> history(String agentId, int limit) {
        agentConfigurations.get(agentId);
        return runs.findByAgent(agentId, limit);
    }

    private List<Map<String, Object>> staticIssues(AgentDefinition agent) {
        List<Map<String, Object>> issues = new ArrayList<>();
        if (blank(agent.getDisplayName())) {
            issues.add(issue("error", "MISSING_NAME", "缺少名称", "Agent 必须设置显示名称。", null));
        }
        if (blank(agent.getDescription())) {
            issues.add(
                    issue(
                            "warning",
                            "MISSING_DESCRIPTION",
                            "缺少职责描述",
                            "其他 Agent 路由时无法准确理解边界。",
                            Map.of("description", "请补充 Agent 的主要职责和适用场景。")));
        }
        String prompt = agent.getSystemPrompt() == null ? "" : agent.getSystemPrompt().trim();
        if (prompt.length() < 80) {
            issues.add(
                    issue(
                            "warning",
                            "PROMPT_TOO_SHORT",
                            "提示词过于简短",
                            "当前提示词可能缺少职责、边界和输出要求。",
                            null));
        }
        if (!containsAny(prompt, "不确定", "不知道", "无法确认", "insufficient", "unknown")) {
            issues.add(
                    issue(
                            "warning",
                            "MISSING_UNCERTAINTY_POLICY",
                            "缺少不确定性处理规则",
                            "Agent 未明确说明信息不足时如何回答。",
                            Map.of(
                                    "systemPrompt",
                                    prompt
                                            + "\n\n信息不足或无法验证时，必须明确说明不确定点，不得编造事实。")));
        }
        if (!containsAny(prompt, "拒绝", "禁止", "不得", "must not", "refuse")) {
            issues.add(
                    issue(
                            "warning",
                            "MISSING_BOUNDARY_POLICY",
                            "缺少禁止行为边界",
                            "提示词没有明确不可执行或不可承诺的事项。",
                            null));
        }
        checkResourceIds(
                issues,
                "知识库",
                parseIds(agent.getKnowledgeBaseIds()),
                id -> knowledgeBases.findById(id).map(KnowledgeBase::isEnabled).orElse(null),
                "knowledgeBaseIds");
        checkResourceIds(
                issues,
                "Tool",
                parseIds(agent.getToolIds()),
                id -> tools.findById(id).map(ToolDefinition::isEnabled).orElse(null),
                "toolIds");
        checkResourceIds(
                issues,
                "Skill",
                parseIds(agent.getSkillIds()),
                id -> skills.findById(id).map(SkillDefinition::isEnabled).orElse(null),
                "skillIds");
        if ("SUB".equals(agent.getRole()) && blank(agent.getParentAgentId())) {
            issues.add(
                    issue(
                            "error",
                            "MISSING_PARENT",
                            "子 Agent 未绑定领域 Agent",
                            "子 Agent 无法被正常委派。",
                            null));
        }
        if (agent.isSupportsBrowserActions()) {
            issues.add(
                    issue(
                            "info",
                            "BROWSER_ACTION_REVIEW",
                            "启用了浏览器操作",
                            "请确认每个动作都由用户逐项确认，且不会执行任意脚本。",
                            null));
        }
        return issues;
    }

    private void checkResourceIds(
            List<Map<String, Object>> issues,
            String label,
            List<String> ids,
            java.util.function.Function<String, Boolean> lookup,
            String patchField) {
        List<String> missing = new ArrayList<>();
        List<String> disabled = new ArrayList<>();
        for (String id : ids) {
            Boolean enabled = lookup.apply(id);
            if (enabled == null) missing.add(id);
            else if (!enabled) disabled.add(id);
        }
        if (!missing.isEmpty()) {
            issues.add(
                    issue(
                            "error",
                            "RESOURCE_NOT_FOUND",
                            "引用了不存在的" + label,
                            String.join(", ", missing),
                            Map.of(patchField, writeJson(ids.stream().filter(id -> !missing.contains(id)).toList()))));
        }
        if (!disabled.isEmpty()) {
            issues.add(
                    issue(
                            "warning",
                            "RESOURCE_DISABLED",
                            "引用了已停用的" + label,
                            String.join(", ", disabled),
                            null));
        }
    }

    private List<ValidationCaseRequest> generateCases(AgentDefinition agent) {
        String system =
                """
                你是 Agent 验证场景设计器。根据 Agent 配置生成正常、边界和拒答场景。
                只输出 JSON：{"cases":[{"title":"...","input":"...","pageContext":"","expected":"可验证的通过标准"}]}
                最多生成 6 个场景，不得补写配置中没有的业务事实。
                """;
        String input =
                "Agent 配置：\n"
                        + writeJson(agent)
                        + "\n请为它生成精简但覆盖职责、边界、信息不足和禁止行为的验证场景。";
        try {
            Optional<String> response = llm.complete(system, List.of(), input).blockOptional(MODEL_TIMEOUT);
            if (response.isPresent()) {
                Map<String, Object> parsed = parseObject(response.get());
                Object values = parsed.get("cases");
                if (values instanceof List<?> list) {
                    List<ValidationCaseRequest> generated = new ArrayList<>();
                    for (Object value : list) {
                        Map<String, Object> item = asMap(value);
                        String prompt = Objects.toString(item.get("input"), "").trim();
                        if (prompt.isBlank()) continue;
                        generated.add(
                                new ValidationCaseRequest(
                                        "VC-" + UUID.randomUUID(),
                                        Objects.toString(item.get("title"), "验证场景"),
                                        prompt,
                                        Objects.toString(item.get("pageContext"), ""),
                                        Objects.toString(item.get("expected"), "回答符合职责边界")));
                    }
                    if (!generated.isEmpty()) return generated.stream().limit(MAX_CASES).toList();
                }
            }
        } catch (RuntimeException ignored) {
            // Fall through to deterministic cases.
        }
        return List.of(
                new ValidationCaseRequest(
                        "VC-" + UUID.randomUUID(),
                        "正常职责场景",
                        "请说明你负责解决的问题，并给出一次典型处理流程。",
                        "",
                        "回答与 Agent 描述和系统提示词一致，说明职责而不越界。"),
                new ValidationCaseRequest(
                        "VC-" + UUID.randomUUID(),
                        "信息不足场景",
                        "请处理一个没有提供任何业务背景的请求，并直接给出结论。",
                        "",
                        "Agent 应主动询问缺失信息或说明无法确定，不得编造业务事实。"));
    }

    private Map<String, Object> sanitizeRemediationPatch(
            Map<String, Object> candidate, Map<String, Object> currentValues) {
        Map<String, Object> patch = new LinkedHashMap<>();
        for (String field : REMEDIATION_FIELDS) {
            if (!candidate.containsKey(field)) continue;
            String value =
                    candidate.get(field) == null
                            ? ""
                            : Objects.toString(candidate.get(field), "").trim();
            if (field.equals("systemPrompt") && value.isBlank()) continue;
            String current = Objects.toString(currentValues.get(field), "");
            if (!Objects.equals(value, current)) {
                patch.put(field, value);
            }
        }
        return patch;
    }

    private Map<String, Object> prepareCaseSuggestedPatch(
            AgentDefinition agent,
            ValidationCaseRequest testCase,
            Map<String, Object> candidate) {
        Map<String, Object> prepared = new LinkedHashMap<>(candidate);
        String current = normalizedValue(agent.getSystemPrompt());
        String suggested =
                normalizedValue(Objects.toString(candidate.get("systemPrompt"), ""));
        if (suggested.isBlank()) return prepared;
        if (current.isBlank()) {
            prepared.put("systemPrompt", suggested);
            return prepared;
        }
        String compactCurrent = compactText(current);
        String compactSuggested = compactText(suggested);
        if (compactCurrent.contains(compactSuggested)) {
            prepared.put("systemPrompt", current);
            return prepared;
        }
        if (compactSuggested.contains(compactCurrent)) {
            prepared.put("systemPrompt", suggested);
            return prepared;
        }
        String scenario = limit(testCase.title(), 200, "当前验证场景");
        prepared.put(
                "systemPrompt",
                current
                        + "\n\n补充验证要求（场景："
                        + scenario
                        + "）：\n"
                        + suggested);
        return prepared;
    }

    private Map<String, Object> fallbackRemediationPatch(
            String current, List<RemediationCaseRequest> failedCases) {
        StringBuilder completed = new StringBuilder(current);
        if (!completed.isEmpty()) completed.append("\n\n");
        completed.append("验证补充要求（必须全部满足）：");
        for (RemediationCaseRequest failedCase : failedCases) {
            String title = limit(failedCase.title(), 200, "未命名场景");
            String expected =
                    limit(failedCase.expected(), 800, "回答必须符合当前 Agent 的职责与边界");
            completed.append("\n- ").append(title).append("：").append(expected);
            String reason = limit(failedCase.reason(), 800, "");
            if (!reason.isBlank()) {
                completed.append("；需避免：").append(reason);
            } else {
                completed.append("。");
            }
        }
        return Map.of("systemPrompt", completed.toString());
    }

    private Map<String, Object> currentAgentView(
            AgentDefinition agent, Map<String, Object> currentValues) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("id", agent.getId());
        value.put("displayName", agent.getDisplayName());
        value.put("description", currentValues.get("description"));
        value.put("systemPrompt", currentValues.get("systemPrompt"));
        value.put("role", agent.getRole());
        value.put("parentAgentId", agent.getParentAgentId());
        value.put("routingRules", currentValues.get("routingRules"));
        value.put("knowledgeBaseIds", agent.getKnowledgeBaseIds());
        value.put("toolIds", agent.getToolIds());
        value.put("skillIds", agent.getSkillIds());
        value.put("planningMode", agent.getPlanningMode());
        value.put("maxPlanSteps", agent.getMaxPlanSteps());
        value.put("supportsBrowserActions", agent.isSupportsBrowserActions());
        return value;
    }

    private Map<String, Object> configuredRemediationValues(AgentDefinition agent) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("systemPrompt", normalizedValue(agent.getSystemPrompt()));
        values.put("description", normalizedValue(agent.getDescription()));
        values.put("routingRules", normalizedValue(agent.getRoutingRules()));
        return values;
    }

    private static void applyRemediationOverride(
            Map<String, Object> values, String field, String requested) {
        if (requested != null) values.put(field, requested.trim());
    }

    private static String normalizedValue(String value) {
        return value == null ? "" : value.trim();
    }

    private static String compactText(String value) {
        return value == null ? "" : value.replaceAll("\\s+", "");
    }

    private Map<String, Object> executeCase(
            AgentDefinition agent, ValidationCaseRequest testCase) {
        String input = testCase.input() == null ? "" : testCase.input().trim();
        if (testCase.pageContext() != null && !testCase.pageContext().isBlank()) {
            input += "\n\n页面上下文：\n" + testCase.pageContext().trim();
        }
        String response;
        try {
            response =
                    llm.complete(agent.getSystemPrompt(), List.of(), input)
                            .blockOptional(MODEL_TIMEOUT)
                            .orElse("模型未配置或没有返回内容。");
        } catch (RuntimeException error) {
            response = "模型调用失败：" + safeMessage(error);
        }
        String judgeSystem =
                """
                你是 Agent 验证评估器。只根据输入、预期标准和 Agent 实际回答评估，不补充隐藏事实。
                只输出 JSON：{"passed":true,"reason":"...","suggestedPatch":{}}
                suggestedPatch 只允许 systemPrompt、description、routingRules 三个字段，没有建议时输出空对象。
                systemPrompt 字段只写需要追加的补充规则，不要复述、重写或替换原提示词。
                """;
        String judgeInput =
                "Agent 配置：\n"
                        + writeJson(agent)
                        + "\n验证输入：\n"
                        + input
                        + "\n预期标准：\n"
                        + Objects.toString(testCase.expected(), "")
                        + "\n实际回答：\n"
                        + response;
        Map<String, Object> judged = completeJson(judgeSystem, judgeInput);
        if (judged.isEmpty()) {
            judged = new LinkedHashMap<>();
            judged.put("passed", false);
            judged.put("reason", "评估模型不可用，无法自动判定，请人工检查实际回答。");
            judged.put("suggestedPatch", Map.of());
        }
        judged.put(
                "suggestedPatch",
                sanitizeRemediationPatch(
                        prepareCaseSuggestedPatch(
                                agent,
                                testCase,
                                asMap(judged.get("suggestedPatch"))),
                        configuredRemediationValues(agent)));
        judged.put("response", response);
        return judged;
    }

    private Map<String, Object> completeJson(String system, String input) {
        try {
            Optional<String> response = llm.complete(system, List.of(), input).blockOptional(MODEL_TIMEOUT);
            return response.map(this::parseObject).orElseGet(LinkedHashMap::new);
        } catch (RuntimeException error) {
            return new LinkedHashMap<>();
        }
    }

    private Map<String, Object> parseObject(String raw) {
        if (raw == null || raw.isBlank()) return new LinkedHashMap<>();
        int start = raw.indexOf('{');
        int end = raw.lastIndexOf('}');
        if (start < 0 || end <= start) return new LinkedHashMap<>();
        try {
            return json.readValue(raw.substring(start, end + 1), new TypeReference<>() {});
        } catch (Exception error) {
            return new LinkedHashMap<>();
        }
    }

    private String configHash(AgentDefinition agent) {
        try {
            Map<String, Object> stable = new LinkedHashMap<>();
            stable.put("displayName", agent.getDisplayName());
            stable.put("description", agent.getDescription());
            stable.put("systemPrompt", agent.getSystemPrompt());
            stable.put("role", agent.getRole());
            stable.put("parentAgentId", agent.getParentAgentId());
            stable.put("routingRules", agent.getRoutingRules());
            stable.put("knowledgeBaseIds", agent.getKnowledgeBaseIds());
            stable.put("toolIds", agent.getToolIds());
            stable.put("skillIds", agent.getSkillIds());
            stable.put("planningMode", agent.getPlanningMode());
            stable.put("maxPlanSteps", agent.getMaxPlanSteps());
            byte[] digest =
                    MessageDigest.getInstance("SHA-256")
                            .digest(writeJson(stable).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception error) {
            return String.valueOf(agent.getVersion());
        }
    }

    private static int countSeverity(List<Map<String, Object>> issues, String severity) {
        return (int)
                issues.stream()
                        .filter(issue -> severity.equalsIgnoreCase(Objects.toString(issue.get("severity"), "")))
                        .count();
    }

    private static Map<String, Object> issue(
            String severity, String code, String title, String detail, Map<String, Object> patch) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("severity", severity);
        value.put("code", code);
        value.put("title", title);
        value.put("detail", detail);
        value.put("patch", patch == null ? Map.of() : patch);
        return value;
    }

    private List<String> parseIds(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        try {
            List<String> values =
                    json.readValue(
                            raw,
                            json.getTypeFactory().constructCollectionType(List.class, String.class));
            return values == null
                    ? List.of()
                    : values.stream()
                            .filter(value -> value != null && !value.isBlank())
                            .distinct()
                            .toList();
        } catch (Exception error) {
            return List.of();
        }
    }

    private static boolean containsAny(String value, String... candidates) {
        String normalized = value == null ? "" : value.toLowerCase();
        for (String candidate : candidates) {
            if (normalized.contains(candidate.toLowerCase())) return true;
        }
        return false;
    }

    private String writeJson(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (Exception error) {
            return "{}";
        }
    }

    private static String safeMessage(Throwable error) {
        return error.getMessage() == null || error.getMessage().isBlank()
                ? error.getClass().getSimpleName()
                : error.getMessage();
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static String limit(String value, int max, String fallback) {
        if (value == null || value.isBlank()) return fallback;
        String trimmed = value.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object value) {
        return value instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
    }

    public record ValidationCaseRequest(
            String caseId, String title, String input, String pageContext, String expected) {
        public ValidationCaseRequest(
                String title, String input, String pageContext, String expected) {
            this(null, title, input, pageContext, expected);
        }
    }

    public record ValidateRequest(Boolean runBehavior, List<ValidationCaseRequest> cases) {}

    public record BehaviorRequest(List<ValidationCaseRequest> cases) {}

    public record RemediationRequest(
            List<RemediationCaseRequest> cases,
            String currentSystemPrompt,
            String currentDescription,
            String currentRoutingRules) {}

    public record RemediationCaseRequest(
            String title,
            String input,
            String expected,
            String actualResponse,
            String reason,
            Map<String, Object> suggestedPatch) {}
}
