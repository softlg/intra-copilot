package com.intra.copilot.web;

import com.intra.copilot.agent.Agent;
import com.intra.copilot.agent.ConfigurableAgent;
import com.intra.copilot.model.AttachmentView;
import com.intra.copilot.service.AgentOrchestrator;
import com.intra.copilot.service.AgentRegistry;
import com.intra.copilot.service.AttachmentService;
import com.intra.copilot.service.HookService;
import com.intra.copilot.service.LlmClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/admin/router")
public class RouterAdminController {
    private final AgentOrchestrator orchestrator;
    private final AgentRegistry registry;
    private final HookService hooks;
    private final LlmClient llm;
    private final AttachmentService attachments;

    public RouterAdminController(
            AgentOrchestrator orchestrator,
            AgentRegistry registry,
            HookService hooks,
            LlmClient llm,
            AttachmentService attachments) {
        this.orchestrator = orchestrator;
        this.registry = registry;
        this.hooks = hooks;
        this.llm = llm;
        this.attachments = attachments;
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
        AgentOrchestrator.RoutingResult result =
                orchestrator.route(message, effectivePageContext, List.of(), images);
        AgentOrchestrator.DelegationResult delegation =
                result.agent() instanceof ConfigurableAgent configurable
                        ? orchestrator.decideDomain(
                                configurable.definition(), message, effectivePageContext, List.of())
                        : new AgentOrchestrator.DelegationResult(
                                false, result.agent(), "DIRECT", "系统 Agent 直接处理", 1.0, List.of(), null);
        Agent finalAgent = delegation.agent();

        List<HookService.HookCheck> checks =
                hooks.checks(
                        new HookService.Context(
                                message, effectivePageContext, result.selectedAgentId(), permissions));
        boolean routeHooksPassed = checks.stream().allMatch(HookService.HookCheck::passed);
        if (routeHooksPassed && delegation.delegated()) {
            checks =
                    hooks.checks(
                            new HookService.Context(
                                    message, effectivePageContext, finalAgent.id(), permissions));
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
                                "attachmentCount",
                                attachmentIds.size(),
                                "imageCount",
                                images.size())));
        steps.add(
                step(
                        "intent",
                        "系统 Agent 意图识别",
                        Map.of(
                                "intent",
                                result.reason(),
                                "confidence",
                                result.confidence(),
                                "routeSource",
                                result.routeSource(),
                                "agentId",
                                result.selectedAgentId())));
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
                                    delegation.confidence())));
        }
        steps.add(
                step(
                        "hooks",
                        "Agent 执行前钩子校验",
                        Map.of(
                                "passed",
                                checks.stream().allMatch(HookService.HookCheck::passed),
                                "checks",
                                checks)));

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

    @PostMapping(value = "/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public List<AttachmentView> uploadAttachments(@RequestParam("files") List<MultipartFile> files)
            throws Exception {
        return attachments.upload(files).stream()
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
        AttachmentService.StoredBytes stored = attachments.serve(id);
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
                "请分析以下路由测试结果，指出意图识别、分发 Agent、置信度和钩子校验是否合理，并给出改进建议。\n用户消息："
                        + (message.isBlank() ? "（仅图片附件）" : message)
                        + "\n路由结果："
                        + String.valueOf(request.route());
        String analysis;
        try {
            analysis =
                    llm.complete("你是 Agent 路由巡检助手，只输出简洁、可执行的中文分析。", List.of(), input)
                            .blockOptional(Duration.ofSeconds(20))
                            .orElse("模型暂不可用。请根据调用链路检查意图、置信度、分发 Agent 及钩子校验结果。");
        } catch (Exception error) {
            String reason = error.getMessage() == null || error.getMessage().isBlank()
                    ? error.getClass().getSimpleName()
                    : error.getMessage();
            analysis = "模型调用失败：" + reason + "。请根据调用链路检查意图、置信度、分发 Agent 及钩子校验结果。";
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
        return attachments.imageDataUrls(attachmentIds).stream()
                .filter(value -> value != null && value.startsWith("data:image/"))
                .filter(value -> value.length() <= 8_000_000)
                .limit(8)
                .toList();
    }
}
