package com.intra.copilot.web;

import com.intra.copilot.service.AgentOrchestrator;
import com.intra.copilot.service.AgentRegistry;
import com.intra.copilot.service.HookService;
import com.intra.copilot.service.LlmClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/router")
public class RouterAdminController {
    private final AgentOrchestrator orchestrator;
    private final AgentRegistry registry;
    private final HookService hooks;
    private final LlmClient llm;

    public RouterAdminController(
            AgentOrchestrator orchestrator, AgentRegistry registry, HookService hooks, LlmClient llm) {
        this.orchestrator = orchestrator;
        this.registry = registry;
        this.hooks = hooks;
        this.llm = llm;
    }

    public record RouterTestRequest(String message, String pageContext) {}

    @PostMapping("/test")
    public Map<String, Object> test(@RequestBody RouterTestRequest request) {
        String message = request == null || request.message() == null ? "" : request.message().trim();
        if (message.isBlank()) throw new IllegalArgumentException("测试消息不能为空");
        String pageContext =
                request == null || request.pageContext() == null ? "" : request.pageContext().trim();
        var result = orchestrator.route(message, pageContext, List.of());
        var steps = new ArrayList<Map<String, Object>>();
        steps.add(
                step(
                        "input",
                        "接收用户请求",
                        Map.of("message", message, "pageContextIncluded", !pageContext.isBlank())));
        steps.add(
                step(
                        "intent",
                        "主 Agent 意图识别",
                        Map.of(
                                "intent",
                                result.reason(),
                                "confidence",
                                result.confidence(),
                                "routeSource",
                                result.routeSource())));
        steps.add(
                step(
                        "dispatch",
                        "路由分发",
                        Map.of(
                                "agentId", result.selectedAgentId(), "displayName", result.agent().displayName())));
        var checks =
                hooks.checks(
                        new HookService.Context(message, pageContext, result.selectedAgentId(), Map.of()));
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
        response.put("agentId", result.selectedAgentId());
        response.put("displayName", result.agent().displayName());
        response.put("confidence", result.confidence());
        response.put("reason", result.reason());
        response.put("routeSource", result.routeSource());
        response.put("needsClarification", result.needsClarification());
        response.put(
                "availableAgents",
                registry
                        .enabledDefinitions()
                        .stream()
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

    public record RouterAnalysisRequest(
            String message, String pageContext, Map<String, Object> route) {}

    @PostMapping("/analyze")
    public Map<String, String> analyze(@RequestBody RouterAnalysisRequest request) {
        String message = request == null || request.message() == null ? "" : request.message().trim();
        if (message.isBlank()) throw new IllegalArgumentException("分析消息不能为空");
        String input =
                "请分析以下路由测试结果，指出意图识别、分发 Agent、置信度和钩子校验是否合理，并给出改进建议。\n用户消息："
                        + message
                        + "\n路由结果："
                        + String.valueOf(request.route());
        String analysis =
                llm.complete("你是 Agent 路由巡检助手，只输出简洁、可执行的中文分析。", List.of(), input)
                        .blockOptional(Duration.ofSeconds(20))
                        .orElse("模型暂不可用。请根据调用链路检查意图、置信度、分发 Agent 及钩子校验结果。");
        return Map.of("analysis", analysis);
    }

    private Map<String, Object> step(String type, String title, Map<String, Object> details) {
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("type", type);
        step.put("title", title);
        step.put("details", details);
        return step;
    }
}
