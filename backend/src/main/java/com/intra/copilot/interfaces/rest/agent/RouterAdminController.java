package com.intra.copilot.interfaces.rest.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.domain.agent.Agent;
import com.intra.copilot.domain.agent.ConfigurableAgent;
import com.intra.copilot.domain.agent.AgentChildBinding;
import com.intra.copilot.domain.agent.AgentDefinition;
import com.intra.copilot.domain.conversation.AttachmentView;
import com.intra.copilot.domain.knowledge.KnowledgeBase;
import com.intra.copilot.domain.capability.McpServer;
import com.intra.copilot.domain.capability.ToolDefinition;
import com.intra.copilot.infrastructure.persistence.knowledge.KnowledgeBaseRepository;
import com.intra.copilot.infrastructure.persistence.capability.McpServerRepository;
import com.intra.copilot.application.agent.AgentOrchestrator;
import com.intra.copilot.application.agent.AgentRegistry;
import com.intra.copilot.application.conversation.AttachmentService;
import com.intra.copilot.application.capability.HookService;
import com.intra.copilot.infrastructure.ai.LlmClient;
import com.intra.copilot.application.agent.PlanningService;
import com.intra.copilot.application.capability.SkillPromptAssembler;
import com.intra.copilot.infrastructure.capability.ToolExecutor;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import com.intra.copilot.shared.identity.RequestContext;

@RestController
@RequestMapping("/api/v1/admin/router")
public class RouterAdminController {
    private final AgentOrchestrator orchestrator;
    private final AgentRegistry registry;
    private final HookService hooks;
    private final LlmClient llm;
    private final AttachmentService attachments;
    private final PlanningService planning;
    private final SkillPromptAssembler skillAssembler;
    private final ToolExecutor toolExecutor;
    private final KnowledgeBaseRepository knowledgeBases;
    private final McpServerRepository mcpServers;
    private final ObjectMapper json;

    public RouterAdminController(
            AgentOrchestrator orchestrator,
            AgentRegistry registry,
            HookService hooks,
            LlmClient llm,
            AttachmentService attachments,
            PlanningService planning,
            SkillPromptAssembler skillAssembler,
            ToolExecutor toolExecutor,
            KnowledgeBaseRepository knowledgeBases,
            McpServerRepository mcpServers,
            ObjectMapper json) {
        this.orchestrator = orchestrator;
        this.registry = registry;
        this.hooks = hooks;
        this.llm = llm;
        this.attachments = attachments;
        this.planning = planning;
        this.skillAssembler = skillAssembler;
        this.toolExecutor = toolExecutor;
        this.knowledgeBases = knowledgeBases;
        this.mcpServers = mcpServers;
        this.json = json;
    }

    public record RouterTestRequest(
            String message,
            String pageContext,
            List<String> attachmentIds,
            Map<String, Boolean> permissions) {}

    @PostMapping("/test")
    public Map<String, Object> test(@RequestBody RouterTestRequest request) {
        String message = request == null || request.message() == null ? "" : request.message().trim();
        String pageContext =
                request == null || request.pageContext() == null ? "" : request.pageContext().trim();
        List<String> attachmentIds = cleanAttachmentIds(request);
        if (message.isBlank() && attachmentIds.isEmpty()) {
            throw new IllegalArgumentException("测试消息或图片附件不能为空");
        }
        Map<String, Boolean> permissions =
                request == null || request.permissions() == null
                        ? Map.of()
                        : new LinkedHashMap<>(request.permissions());
        boolean readPage =
                permissions.containsKey("readPage")
                        ? Boolean.TRUE.equals(permissions.get("readPage"))
                        : !pageContext.isBlank();
        String effectivePageContext = readPage ? pageContext : "";
        List<String> images = routeImages(attachmentIds);
        RouteTrace routeTrace = new RouteTrace();
        AgentOrchestrator.RoutingResult result =
                orchestrator.route(
                        message,
                        effectivePageContext,
                        List.of(),
                        images,
                        routeTraceListener(routeTrace));
        DelegationTrace delegationTrace = new DelegationTrace();
        AgentOrchestrator.DelegationResult delegation =
                result.agent() instanceof ConfigurableAgent configurable
                        ? orchestrator.decideDomain(
                                configurable.definition(),
                                message,
                                effectivePageContext,
                                List.of(),
                                delegationTraceListener(delegationTrace))
                        : new AgentOrchestrator.DelegationResult(
                                false, result.agent(), "DIRECT", "系统 Agent 直接处理", 1.0, List.of(), null);
        Agent finalAgent = delegation.agent();
        String enrichedInput = enrichInput(message, effectivePageContext);
        if (delegationTrace.dispatchInput == null || delegationTrace.dispatchInput.isBlank()) {
            delegationTrace.dispatchInput = enrichedInput;
        }
        List<HookService.HookCheck> checks =
                hooks.checks(
                        new HookService.Context(
                                message,
                                effectivePageContext,
                                result.selectedAgentId(),
                                agentRole(result.agent()),
                                HookService.PHASE_PRE_ROUTE,
                                readPage,
                                permissions,
                                attachmentIds.size()));
        boolean routeHooksPassed = checks.stream().allMatch(HookService.HookCheck::passed);
        if (routeHooksPassed) {
            List<HookService.HookCheck> agentChecks =
                    hooks.checks(
                            new HookService.Context(
                                    message,
                                    effectivePageContext,
                                    finalAgent.id(),
                                    agentRole(finalAgent),
                                    HookService.PHASE_PRE_AGENT,
                                    readPage,
                                    permissions,
                                    attachmentIds.size()));
            if (!agentChecks.isEmpty()) {
                checks = new ArrayList<>(checks);
                checks.addAll(agentChecks);
            }
        }
        boolean hooksPassed = checks.stream().allMatch(HookService.HookCheck::passed);

        ExecutionSnapshot executionResources = null;
        Map<String, Object> planningDetails = Map.of();
        if (hooksPassed) {
            executionResources = executionSnapshot(finalAgent, enrichedInput);
            boolean planningEnabled =
                    executionResources.definition() != null
                            && planning.shouldPlan(
                                    executionResources.definition(),
                                    message,
                                    executionResources.tools());
            PlanningService.PlanPreview planPreview = null;
            boolean planningFailed = false;
            if (planningEnabled) {
                try {
                    planPreview =
                            planning.previewPlan(
                                            executionResources.definition(),
                                            message,
                                            effectivePageContext,
                                            List.of(),
                                            executionResources.tools())
                                    .orElse(null);
                    planningFailed = planPreview == null;
                } catch (Exception error) {
                    planningFailed = true;
                }
            }
            planningDetails =
                    planningDetails(
                            planningEnabled,
                            planningFailed,
                            planPreview,
                            executionResources.definition() == null
                                    ? "N/A"
                                    : executionResources.definition().getPlanningMode());
        }

        var steps = new ArrayList<Map<String, Object>>();
        steps.add(
                step(
                        "input",
                        "接收用户请求",
                        Map.of(
                                "message",
                                message,
                                "pageContextIncluded",
                                !effectivePageContext.isBlank(),
                                "pageContext",
                                effectivePageContext,
                                "pageContextLength",
                                effectivePageContext.length(),
                                "attachmentCount",
                                attachmentIds.size(),
                                "imageCount",
                                images.size(),
                                "attachmentIds",
                                attachmentIds,
                                "permissions",
                                permissions)));
        Map<String, Object> intentDetails = new LinkedHashMap<>();
        intentDetails.put("intent", result.reason());
        intentDetails.put("confidence", result.confidence());
        intentDetails.put("routeSource", result.routeSource());
        intentDetails.put("agentId", result.selectedAgentId());
        intentDetails.put("displayName", result.agent().displayName());
        intentDetails.put("modelOutput", routeTrace.rawModelOutput);
        intentDetails.put("systemPrompt", routeTrace.systemPrompt);
        intentDetails.put("modelInput", routeTrace.userInput);
        intentDetails.put("durationMs", routeTrace.durationMs);
        steps.add(step("intent", "系统 Agent 意图识别", intentDetails));
        steps.add(
                step(
                        "dispatch",
                        "路由分发",
                        Map.of(
                                "agentId",
                                finalAgent.id(),
                                "displayName",
                                finalAgent.displayName(),
                                "routeAgentId",
                                result.selectedAgentId(),
                                "delegated",
                                delegation.delegated())));
        if (delegation.delegated()) {
            steps.add(
                    step(
                            "delegation",
                            "领域 Agent 委派",
                            Map.of(
                                    "parentAgentId",
                                    result.selectedAgentId(),
                                    "agentId",
                                    finalAgent.id(),
                                    "displayName",
                                    finalAgent.displayName(),
                                    "mode",
                                    delegation.mode(),
                                    "reason",
                                    delegation.reason(),
                                    "confidence",
                                    delegation.confidence(),
                                    "dispatchPrompt",
                                    delegationTrace.dispatchPrompt,
                                    "dispatchInput",
                                    delegationTrace.dispatchInput,
                                    "modelOutput",
                                    delegationTrace.rawOutput,
                                    "durationMs",
                                    delegationTrace.durationMs)));
        }
        steps.add(
                step(
                        "hooks",
                        "Agent 执行前 Hook 校验",
                        Map.of(
                                "passed",
                                checks.stream().allMatch(HookService.HookCheck::passed),
                                "checks",
                                checks)));
        if (executionResources != null) {
            steps.add(step("resources", "执行 Agent 资源装配", executionResources.details()));
            steps.add(step("planning", "执行规划", planningDetails));
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("agentId", finalAgent.id());
        response.put("displayName", finalAgent.displayName());
        response.put("routeAgentId", result.selectedAgentId());
        response.put("routeDisplayName", result.agent().displayName());
        response.put("confidence", result.confidence());
        response.put("reason", result.reason());
        response.put("routeSource", result.routeSource());
        response.put("needsClarification", result.needsClarification());
        response.put("delegated", delegation.delegated());
        response.put("delegationReason", delegation.reason());
        Map<String, Object> routeTraceDetails = new LinkedHashMap<>();
        routeTraceDetails.put("modelOutput", routeTrace.rawModelOutput);
        routeTraceDetails.put("systemPrompt", routeTrace.systemPrompt);
        routeTraceDetails.put("modelInput", routeTrace.userInput);
        routeTraceDetails.put("durationMs", routeTrace.durationMs);
        response.put("routeTrace", routeTraceDetails);
        Map<String, Object> delegationDetails = new LinkedHashMap<>();
        delegationDetails.put("mode", delegation.mode());
        delegationDetails.put("reason", delegation.reason());
        delegationDetails.put("confidence", delegation.confidence());
        delegationDetails.put(
                "matchedRule", Objects.toString(delegationTrace.matchedRule, ""));
        delegationDetails.put("candidates", candidateDetails(delegation.candidates()));
        delegationDetails.put("modelOutput", delegationTrace.rawOutput);
        delegationDetails.put("durationMs", delegationTrace.durationMs);
        delegationDetails.put("dispatchPrompt", delegationTrace.dispatchPrompt);
        delegationDetails.put("dispatchInput", delegationTrace.dispatchInput);
        response.put("delegation", delegationDetails);
        if (executionResources != null) {
            response.put("planning", planningDetails);
            response.put("resources", executionResources.details());
        }
        response.put("attachmentCount", attachmentIds.size());
        response.put("imageCount", images.size());
        response.put(
                "availableAgents",
                registry
                        .enabledDefinitions()
                        .stream()
                        .filter(
                                item ->
                                        List.of("GENERAL", "DOMAIN").contains(item.getRole()))
                        .map(
                                item ->
                                        Map.of(
                                                "id",
                                                item.getId(),
                                                "displayName",
                                                item.getDisplayName(),
                                                "priority",
                                                item.getPriority()))
                        .toList());
        response.put("steps", steps);
        return response;
    }

    private AgentOrchestrator.RouteTraceListener routeTraceListener(RouteTrace trace) {
        return new AgentOrchestrator.RouteTraceListener() {
            @Override
            public void onRouteStart(
                    String systemPrompt,
                    String userInput,
                    List<Map<String, String>> history,
                    String pageContext) {
                trace.systemPrompt = systemPrompt;
                trace.userInput = userInput;
            }

            @Override
            public void onRouteEnd(
                    AgentOrchestrator.RoutingResult result,
                    String rawModelOutput,
                    String systemPrompt,
                    String userInput,
                    long durationMs,
                    String routeSource) {
                trace.rawModelOutput = rawModelOutput;
                trace.systemPrompt = systemPrompt;
                trace.userInput = userInput;
                trace.durationMs = durationMs;
            }

            @Override
            public void onRouteError(
                    String systemPrompt, String userInput, Throwable error) {
                trace.systemPrompt = systemPrompt;
                trace.userInput = userInput;
                trace.error = error;
            }
        };
    }

    private AgentOrchestrator.DelegationTraceListener delegationTraceListener(
            DelegationTrace trace) {
        return new AgentOrchestrator.DelegationTraceListener() {
            @Override
            public void onCandidates(
                    String domainId, List<AgentOrchestrator.ChildCandidate> candidates) {
                trace.candidates = candidateDetails(candidates);
            }

            @Override
            public void onRuleMatch(
                    String domainId, AgentChildBinding binding, AgentDefinition child) {
                trace.matchedRule = binding.getRoutingRule();
            }

            @Override
            public void onFallback(String domainId, AgentDefinition child) {
                trace.matchedRule = "PRIORITY_FALLBACK";
            }

            @Override
            public void onDispatchStart(
                    String domainId, String prompt, String userMessage, String pageContext) {
                trace.dispatchPrompt = prompt;
                trace.dispatchInput = enrichInput(userMessage, pageContext);
            }

            @Override
            public void onDispatchEnd(
                    String domainId,
                    AgentDefinition selected,
                    String rawOutput,
                    long durationMs,
                    boolean delegated) {
                trace.rawOutput = rawOutput;
                trace.durationMs = durationMs;
            }

            @Override
            public void onDispatchError(String domainId, Throwable error) {
                trace.error = error;
            }
        };
    }

    private ExecutionSnapshot executionSnapshot(Agent agent, String userInput) {
        if (!(agent instanceof ConfigurableAgent configurable)) {
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("agentId", agent.id());
            details.put("displayName", agent.displayName());
            details.put("role", "MAIN");
            details.put("skills", List.of());
            details.put("tools", List.of());
            details.put("mcpServers", List.of());
            details.put("knowledgeBases", List.of());
            details.put("warnings", List.of());
            details.put("effectiveSystemPrompt", agent.systemPrompt());
            return new ExecutionSnapshot(null, details, List.of());
        }

        AgentDefinition definition = configurable.definition();
        SkillPromptAssembler.Assembly assembly =
                skillAssembler.assembleForAgent(
                        agent.id(),
                        parseIds(definition.getSkillIds()),
                        definition.getSystemPrompt(),
                        userInput,
                        false);
        if (assembly == null) {
            assembly =
                    new SkillPromptAssembler.Assembly(
                            definition.getSystemPrompt(), List.of(), List.of(), List.of());
        }
        LinkedHashSet<String> toolIds = new LinkedHashSet<>(assembly.toolIds());
        toolIds.addAll(parseIds(definition.getToolIds()));
        List<ToolDefinition> tools =
                toolIds.stream()
                        .map(toolExecutor::resolveById)
                        .filter(Objects::nonNull)
                        .toList();
        List<Map<String, Object>> knowledgeBaseDetails =
                parseIds(definition.getKnowledgeBaseIds()).stream()
                        .map(this::findKnowledgeBase)
                        .flatMap(Optional::stream)
                        .map(this::knowledgeBaseDetails)
                        .toList();
        LinkedHashMap<String, McpServer> resolvedServers = new LinkedHashMap<>();
        for (ToolDefinition tool : tools) {
            if (!"MCP".equalsIgnoreCase(tool.getType())
                    || tool.getMcpServerId() == null
                    || tool.getMcpServerId().isBlank()) {
                continue;
            }
            findMcpServer(tool.getMcpServerId())
                    .ifPresent(server -> resolvedServers.putIfAbsent(server.getId(), server));
        }
        List<Map<String, Object>> toolDetails =
                tools.stream()
                        .map(
                                tool -> {
                                    Map<String, Object> item = new LinkedHashMap<>();
                                    item.put("id", tool.getId());
                                    item.put("name", tool.getName());
                                    item.put("type", tool.getType());
                                    item.put("description", tool.getDescription());
                                    item.put("mcpServerId", tool.getMcpServerId());
                                    McpServer server = resolvedServers.get(tool.getMcpServerId());
                                    item.put(
                                            "mcpServerName",
                                            server == null ? null : server.getName());
                                    return item;
                                })
                        .toList();

        Map<String, Object> details = new LinkedHashMap<>();
        details.put("agentId", definition.getId());
        details.put("displayName", definition.getDisplayName());
        details.put("role", definition.getRole());
        details.put("model", definition.getModel());
        details.put("temperature", definition.getTemperature());
        details.put(
                "skills",
                assembly.appliedSkills().stream()
                        .map(
                                skill -> {
                                    Map<String, Object> item = new LinkedHashMap<>();
                                    item.put("id", skill.id());
                                    item.put("name", skill.name());
                                    item.put("version", skill.version());
                                    item.put("versionLabel", skill.versionLabel());
                                    item.put("promptChars", skill.promptChars());
                                    item.put("promptTokenEstimate", skill.promptTokenEstimate());
                                    return item;
                                })
                        .toList());
        details.put("tools", toolDetails);
        details.put(
                "mcpServers",
                resolvedServers.values().stream()
                        .map(this::mcpServerDetails)
                        .toList());
        details.put("knowledgeBases", knowledgeBaseDetails);
        details.put("warnings", assembly.warnings());
        details.put("effectiveSystemPrompt", assembly.systemPrompt());
        return new ExecutionSnapshot(definition, details, tools);
    }

    private Map<String, Object> planningDetails(
            boolean enabled,
            boolean failed,
            PlanningService.PlanPreview preview,
            String configuredMode) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("enabled", enabled);
        details.put("triggered", preview != null);
        details.put("failed", failed);
        details.put("mode", configuredMode == null ? "N/A" : configuredMode);
        if (preview != null) {
            details.put("goal", preview.goal());
            details.put("summary", preview.summary());
            details.put(
                    "steps",
                    preview.steps().stream()
                            .map(
                                    item -> {
                                        Map<String, Object> step = new LinkedHashMap<>();
                                        step.put("title", item.title());
                                        step.put("description", item.description());
                                        step.put("agentId", item.agentId());
                                        step.put("toolNames", item.toolNames());
                                        step.put("dependsOn", item.dependsOn());
                                        step.put("successCriteria", item.successCriteria());
                                        return step;
                                    })
                            .toList());
            details.put("plannerRequest", preview.plannerRequest());
            details.put("modelOutput", preview.plannerRawOutput());
            details.put("durationMs", preview.plannerDurationMs());
            details.put("repaired", preview.repaired());
            details.put("inputTokens", preview.inputTokens());
            details.put("outputTokens", preview.outputTokens());
        }
        return details;
    }

    private List<Map<String, Object>> candidateDetails(
            List<AgentOrchestrator.ChildCandidate> candidates) {
        if (candidates == null) return List.of();
        return candidates.stream()
                .map(
                        candidate -> {
                            Map<String, Object> item = new LinkedHashMap<>();
                            item.put("agentId", candidate.definition().getId());
                            item.put("displayName", candidate.definition().getDisplayName());
                            item.put("description", candidate.definition().getDescription());
                            item.put("priority", candidate.binding().getPriority());
                            item.put("routingRule", candidate.binding().getRoutingRule());
                            return item;
                        })
                .toList();
    }

    private Map<String, Object> knowledgeBaseDetails(KnowledgeBase base) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", base.getId());
        item.put("name", base.getName());
        item.put("status", base.getStatus());
        item.put("enabled", base.isEnabled());
        return item;
    }

    private Map<String, Object> mcpServerDetails(McpServer server) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", server.getId());
        item.put("name", server.getName());
        item.put("status", server.getStatus());
        item.put("transport", server.getTransport());
        item.put("interfaceCount", server.getInterfaceCount());
        return item;
    }

    private Optional<KnowledgeBase> findKnowledgeBase(String id) {
        return Optional.ofNullable(knowledgeBases.findById(id)).flatMap(value -> value);
    }

    private Optional<McpServer> findMcpServer(String id) {
        return Optional.ofNullable(mcpServers.findById(id)).flatMap(value -> value);
    }

    private List<String> parseIds(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        try {
            List<String> values =
                    json.readValue(
                            raw,
                            json.getTypeFactory()
                                    .constructCollectionType(List.class, String.class));
            return values == null
                    ? List.of()
                    : values.stream()
                            .filter(value -> value != null && !value.isBlank())
                            .distinct()
                            .toList();
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private static String enrichInput(String message, String pageContext) {
        return pageContext == null || pageContext.isBlank()
                ? message
                : message + "\n\n浏览器上下文（仅供分析）：\n" + pageContext;
    }

    private static final class RouteTrace {
        String systemPrompt;
        String userInput;
        String rawModelOutput = "";
        long durationMs;
        Throwable error;
    }

    private static final class DelegationTrace {
        List<Map<String, Object>> candidates = List.of();
        String matchedRule;
        String dispatchPrompt = "";
        String dispatchInput = "";
        String rawOutput = "";
        long durationMs;
        Throwable error;
    }

    private record ExecutionSnapshot(
            AgentDefinition definition, Map<String, Object> details, List<ToolDefinition> tools) {}

    @PostMapping(value = "/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public List<AttachmentView> uploadAttachments(@RequestParam("files") List<MultipartFile> files)
            throws Exception {
        var identity = com.intra.copilot.shared.identity.RequestContext.current();
        return attachments.upload(identity.source(), identity.userId(), files).stream()
                .map(
                        attachment ->
                                new AttachmentView(
                                        attachment.id(),
                                        attachment.filename(),
                                        attachment.contentType(),
                                        attachment.size(),
                                        attachment.isImage(),
                                        "/admin/router/attachments/" + attachment.id()))
                .toList();
    }

    @GetMapping("/attachments/{id}")
    public ResponseEntity<ByteArrayResource> serveAttachment(@PathVariable String id)
            throws Exception {
        var identity = com.intra.copilot.shared.identity.RequestContext.current();
        AttachmentService.StoredBytes stored =
                attachments.serve(identity.source(), identity.userId(), id);
        byte[] bytes = stored.bytes();
        String contentType =
                stored.contentType() == null ? "application/octet-stream" : stored.contentType();
        String disposition = "inline; filename=\"" + stored.filename().replace("\"", "") + "\"";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, contentType)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .contentLength(bytes.length)
                .body(new ByteArrayResource(bytes));
    }

    public record RouterAnalysisRequest(
            String message, String pageContext, Map<String, Object> route) {}

    @PostMapping("/analyze")
    public Map<String, String> analyze(@RequestBody RouterAnalysisRequest request) {
        String message = request == null || request.message() == null ? "" : request.message().trim();
        if (request == null || request.route() == null) {
            throw new IllegalArgumentException("路由结果不能为空");
        }
        String input =
                "请分析以下路由测试的完整调用链，检查输入采集、意图识别、规划与计划、路由分发、子 Agent、资源装配和 Hook 校验是否合理，并给出改进建议。\n用户消息："
                        + (message.isBlank() ? "（仅图片附件）" : message)
                        + "\n路由结果："
                        + String.valueOf(request.route());
        String analysis;
        try {
            analysis =
                    llm.complete("你是 Agent 路由巡检助手，只输出简洁、可执行的中文分析。", List.of(), input)
                            .blockOptional(Duration.ofSeconds(20))
                            .orElse("模型暂不可用。请根据调用链路检查输入、意图、规划、分发、资源装配及 Hook 校验结果。");
        } catch (Exception error) {
            String reason = error.getMessage() == null || error.getMessage().isBlank()
                    ? error.getClass().getSimpleName()
                    : error.getMessage();
            analysis =
                    "模型调用失败："
                            + reason
                            + "。请根据调用链路检查输入、意图、规划、分发、资源装配及 Hook 校验结果。";
        }
        return Map.of("analysis", analysis);
    }

    private Map<String, Object> step(String type, String title, Map<String, Object> details) {
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("type", type);
        step.put("title", title);
        step.put("details", details);
        return step;
    }

    private List<String> cleanAttachmentIds(RouterTestRequest request) {
        if (request == null || request.attachmentIds() == null) return List.of();
        return request.attachmentIds().stream()
                .filter(id -> id != null && !id.isBlank())
                .map(String::trim)
                .distinct()
                .toList();
    }

    private List<String> routeImages(List<String> attachmentIds) {
        var identity = com.intra.copilot.shared.identity.RequestContext.current();
        return attachments
                .imageDataUrls(identity.source(), identity.userId(), attachmentIds).stream()
                .filter(value -> value != null && value.startsWith("data:image/"))
                .filter(value -> value.length() <= 8_000_000)
                .limit(8)
                .toList();
    }

    private static String agentRole(Agent agent) {
        return agent instanceof ConfigurableAgent configurable
                ? configurable.definition().getRole()
                : "MAIN";
    }
}
