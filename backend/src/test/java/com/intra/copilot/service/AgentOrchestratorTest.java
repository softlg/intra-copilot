package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.intra.copilot.agent.GeneralAgent;
import com.intra.copilot.agent.RouteCopilotAgent;
import com.intra.copilot.agent.RouterAgent;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.repo.AgentChildBindingRepository;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;

class AgentOrchestratorTest {

    @Test
    void keepsPreviousAgentForClarificationReplyWhenRouterReturnsEmpty() {
        AgentRegistry registry = mock(AgentRegistry.class);
        RouterAgent rules = mock(RouterAgent.class);
        LlmClient llm = mock(LlmClient.class);
        AgentChildBindingRepository childBindings = mock(AgentChildBindingRepository.class);
        TraceRecorder trace = mock(TraceRecorder.class);
        GeneralAgent general = new GeneralAgent();

        AgentDefinition routeConfig = new AgentDefinition();
        routeConfig.setId("route-copilot");
        routeConfig.setRole("MAIN");
        routeConfig.setSystemPrompt("自定义路由提示词");
        routeConfig.setEnabled(true);
        routeConfig.setPublished(true);

        AgentDefinition finance = new AgentDefinition();
        finance.setId("finance-agent");
        finance.setRole("GENERAL");
        finance.setDescription("处理财务问题");
        finance.setEnabled(true);
        finance.setPublished(true);

        when(registry.allDefinitions()).thenReturn(List.of(routeConfig, finance));
        when(registry.enabledDefinitions()).thenReturn(List.of(finance));
        when(registry.findPublished("finance-agent")).thenReturn(Optional.of(finance));
        when(llm.complete(anyString(), anyList(), anyString())).thenReturn(Mono.empty());

        AgentOrchestrator orchestrator =
                new AgentOrchestrator(
                        registry, rules, general, new RouteCopilotAgent(), llm, childBindings, trace);
        List<Map<String, String>> history =
                List.of(
                        Map.of("role", "user", "content", "我要报销"),
                        Map.of(
                                "role",
                                "assistant",
                                "content",
                                "请选择：1 差旅报销，2 日常报销",
                                "agentId",
                                "finance-agent"));

        AgentOrchestrator.RoutingResult result = orchestrator.route("1", "", history);

        assertEquals("finance-agent", result.selectedAgentId());
        assertEquals("context", result.routeSource());
        assertTrue(result.reason().contains("模型未返回结果"));
        assertTrue(result.reason().contains("沿用上一轮 Agent finance-agent"));
    }

    @Test
    void keepsPreviousAgentWhenRouterReturnsAssistantClarification() {
        AgentRegistry registry = mock(AgentRegistry.class);
        RouterAgent rules = mock(RouterAgent.class);
        LlmClient llm = mock(LlmClient.class);
        AgentChildBindingRepository childBindings = mock(AgentChildBindingRepository.class);
        TraceRecorder trace = mock(TraceRecorder.class);
        GeneralAgent general = new GeneralAgent();

        AgentDefinition finance = new AgentDefinition();
        finance.setId("finance-agent");
        finance.setRole("GENERAL");
        finance.setEnabled(true);
        finance.setPublished(true);

        AgentDefinition assistant = new AgentDefinition();
        assistant.setId("assistant");
        assistant.setRole("GENERAL");
        assistant.setEnabled(true);
        assistant.setPublished(true);

        when(registry.allDefinitions()).thenReturn(List.of(finance));
        when(registry.enabledDefinitions()).thenReturn(List.of(finance, assistant));
        when(registry.findPublished("finance-agent")).thenReturn(Optional.of(finance));
        when(registry.findPublished("assistant")).thenReturn(Optional.of(assistant));
        when(llm.complete(anyString(), anyList(), anyString()))
                .thenReturn(
                        Mono.just(
                                "{\"targetAgentId\":\"assistant\",\"confidence\":0.9,"
                                        + "\"reason\":\"信息不足\",\"needsClarification\":true}"));

        AgentOrchestrator orchestrator =
                new AgentOrchestrator(
                        registry, rules, general, new RouteCopilotAgent(), llm, childBindings, trace);
        List<Map<String, String>> history =
                List.of(
                        Map.of("role", "user", "content", "我要报销"),
                        Map.of(
                                "role",
                                "assistant",
                                "content",
                                "请选择：1 差旅报销，2 日常报销",
                                "agentId",
                                "finance-agent"));

        AgentOrchestrator.RoutingResult result = orchestrator.route("1", "", history);

        assertEquals("finance-agent", result.selectedAgentId());
        assertEquals("context", result.routeSource());
        assertTrue(result.reason().contains("模型返回 assistant 澄清路由"));
    }

    @Test
    void doesNotApplyContextStickinessToUnrelatedFullQuestion() {
        AgentRegistry registry = mock(AgentRegistry.class);
        RouterAgent rules = mock(RouterAgent.class);
        LlmClient llm = mock(LlmClient.class);
        AgentChildBindingRepository childBindings = mock(AgentChildBindingRepository.class);
        TraceRecorder trace = mock(TraceRecorder.class);
        GeneralAgent general = new GeneralAgent();

        when(registry.allDefinitions()).thenReturn(List.of());
        when(registry.enabledDefinitions()).thenReturn(List.of());
        when(llm.complete(anyString(), anyList(), anyString())).thenReturn(Mono.empty());
        when(rules.route("帮我查一下新的财务制度")).thenReturn(general);

        AgentOrchestrator orchestrator =
                new AgentOrchestrator(
                        registry, rules, general, new RouteCopilotAgent(), llm, childBindings, trace);
        List<Map<String, String>> history =
                List.of(
                        Map.of(
                                "role",
                                "assistant",
                                "content",
                                "请选择：1 差旅报销，2 日常报销",
                                "agentId",
                                "finance-agent"));

        AgentOrchestrator.RoutingResult result = orchestrator.route("帮我查一下新的财务制度", "", history);

        assertEquals("assistant", result.selectedAgentId());
        assertEquals("rules", result.routeSource());
        assertTrue(result.reason().contains("规则兜底路由"));
    }
}
