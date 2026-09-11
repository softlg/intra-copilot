package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.intra.copilot.agent.GeneralAgent;
import com.intra.copilot.agent.RouteCopilotAgent;
import com.intra.copilot.agent.RouterAgent;
import com.intra.copilot.model.AgentChildBinding;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.repo.AgentChildBindingRepository;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
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

    @Test
    void formatsRoutingPromptWithReadableSections() {
        AgentRegistry registry = mock(AgentRegistry.class);
        RouterAgent rules = mock(RouterAgent.class);
        LlmClient llm = mock(LlmClient.class);
        AgentChildBindingRepository childBindings = mock(AgentChildBindingRepository.class);
        TraceRecorder trace = mock(TraceRecorder.class);
        GeneralAgent general = new GeneralAgent();

        AgentDefinition routeConfig = new AgentDefinition();
        routeConfig.setId("route-copilot");
        routeConfig.setRole("MAIN");
        routeConfig.setSystemPrompt("你是路由 Agent。");
        routeConfig.setRoutingRules("报销问题优先选择 finance-agent");
        routeConfig.setEnabled(true);
        routeConfig.setPublished(true);

        AgentDefinition finance = new AgentDefinition();
        finance.setId("finance-agent");
        finance.setDisplayName("财务助手");
        finance.setRole("GENERAL");
        finance.setDescription("处理财务问题");
        finance.setEnabled(true);
        finance.setPublished(true);

        when(registry.allDefinitions()).thenReturn(List.of(routeConfig, finance));
        when(registry.enabledDefinitions()).thenReturn(List.of(finance));
        when(llm.complete(anyString(), anyList(), anyString())).thenReturn(Mono.empty());
        when(rules.route("我要报销")).thenReturn(general);

        AgentOrchestrator orchestrator =
                new AgentOrchestrator(
                        registry,
                        rules,
                        general,
                        new RouteCopilotAgent(),
                        llm,
                        childBindings,
                        trace);

        orchestrator.route("我要报销", "/orders", List.of());

        ArgumentCaptor<String> promptCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> inputCaptor = ArgumentCaptor.forClass(String.class);
        verify(llm).complete(promptCaptor.capture(), anyList(), inputCaptor.capture());
        String prompt = promptCaptor.getValue();
        String input = inputCaptor.getValue();

        assertTrue(prompt.contains("你的任务：\n- 识别用户的真实意图。"));
        assertTrue(prompt.contains("管理员配置的意图路由规则（优先遵循）：\n报销问题优先选择 finance-agent"));
        assertTrue(
                prompt.contains("- 财务助手（ID：finance-agent）\n" + "  类型：通用 Agent\n" + "  描述：处理财务问题"));
        assertTrue(prompt.contains("输出要求：\n- 只输出 JSON，不要 Markdown、代码块或额外说明。"));
        assertTrue(input.contains("用户消息：\n我要报销\n\n页面上下文：\n/orders"));
        assertTrue(input.contains("上一轮实际处理 Agent：\n无\n\n判断原则："));
    }

    @Test
    void passesImagesToRoutingModelAndDescribesAttachment() {
        AgentRegistry registry = mock(AgentRegistry.class);
        RouterAgent rules = mock(RouterAgent.class);
        LlmClient llm = mock(LlmClient.class);
        AgentChildBindingRepository childBindings = mock(AgentChildBindingRepository.class);
        TraceRecorder trace = mock(TraceRecorder.class);
        GeneralAgent general = new GeneralAgent();

        AgentDefinition finance = new AgentDefinition();
        finance.setId("finance-agent");
        finance.setDisplayName("财务助手");
        finance.setRole("GENERAL");
        finance.setDescription("处理财务问题");
        finance.setEnabled(true);
        finance.setPublished(true);

        when(registry.allDefinitions()).thenReturn(List.of(finance));
        when(registry.enabledDefinitions()).thenReturn(List.of(finance));
        when(registry.findEnabled("finance-agent"))
                .thenReturn(Optional.of(new com.intra.copilot.agent.ConfigurableAgent(finance)));
        when(registry.findPublished("finance-agent")).thenReturn(Optional.of(finance));
        List<String> images = List.of("data:image/png;base64,aW1hZ2U=");
        when(llm.complete(anyString(), anyList(), anyString(), eq(images)))
                .thenReturn(
                        Mono.just(
                                "{\"targetAgentId\":\"finance-agent\",\"confidence\":0.91,"
                                        + "\"reason\":\"图片是报销凭证\",\"needsClarification\":false}"));

        AgentOrchestrator orchestrator =
                new AgentOrchestrator(
                        registry,
                        rules,
                        general,
                        new RouteCopilotAgent(),
                        llm,
                        childBindings,
                        trace);

        AgentOrchestrator.RoutingResult result =
                orchestrator.route("请看图片", "", List.of(), images);

        assertEquals("finance-agent", result.selectedAgentId());
        ArgumentCaptor<String> inputCaptor = ArgumentCaptor.forClass(String.class);
        verify(llm).complete(anyString(), anyList(), inputCaptor.capture(), eq(images));
        assertTrue(inputCaptor.getValue().contains("图片附件：\n1 张图片"));
    }

    @Test
    void formatsDelegationPromptWithReadableSections() {
        AgentRegistry registry = mock(AgentRegistry.class);
        RouterAgent rules = mock(RouterAgent.class);
        LlmClient llm = mock(LlmClient.class);
        AgentChildBindingRepository childBindings = mock(AgentChildBindingRepository.class);
        TraceRecorder trace = mock(TraceRecorder.class);
        GeneralAgent general = new GeneralAgent();

        AgentDefinition domain = new AgentDefinition();
        domain.setId("finance-agent");
        domain.setDisplayName("财务领域 Agent");
        domain.setRole("DOMAIN");
        domain.setHandlingMode("AUTO");

        AgentDefinition child = new AgentDefinition();
        child.setId("expense-agent");
        child.setDisplayName("报销助手");
        child.setRole("SUB");
        child.setDescription("处理差旅和日常报销");
        child.setEnabled(true);
        child.setPublished(true);

        AgentChildBinding binding = new AgentChildBinding();
        binding.setParentAgentId("finance-agent");
        binding.setChildAgentId("expense-agent");
        binding.setEnabled(true);

        when(childBindings.findByParent("finance-agent")).thenReturn(List.of(binding));
        when(registry.findPublished("expense-agent")).thenReturn(Optional.of(child));
        when(llm.complete(anyString(), anyList(), anyString())).thenReturn(Mono.empty());

        AgentOrchestrator orchestrator =
                new AgentOrchestrator(
                        registry,
                        rules,
                        general,
                        new RouteCopilotAgent(),
                        llm,
                        childBindings,
                        trace);

        orchestrator.decideDomain(domain, "提交报销单", "/expense", List.of());

        ArgumentCaptor<String> promptCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> inputCaptor = ArgumentCaptor.forClass(String.class);
        verify(llm).complete(promptCaptor.capture(), anyList(), inputCaptor.capture());
        String prompt = promptCaptor.getValue();
        String input = inputCaptor.getValue();

        assertTrue(prompt.contains("当前领域 Agent：财务领域 Agent（ID：finance-agent）"));
        assertTrue(prompt.contains("任务：\n- 判断当前请求应由该领域 Agent 直接处理"));
        assertTrue(
                prompt.contains(
                        "- 报销助手（ID：expense-agent）\n" + "  类型：子 Agent\n" + "  描述：处理差旅和日常报销"));
        assertTrue(prompt.contains("输出要求：\n- 只输出 JSON，不要 Markdown、代码块或额外说明。"));
        assertTrue(input.equals("用户消息：\n提交报销单\n\n页面上下文：\n/expense"));
    }
}
