package com.intra.copilot.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.agent.Agent;
import com.intra.copilot.agent.ConfigurableAgent;
import com.intra.copilot.model.AgentChildBinding;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.model.AttachmentView;
import com.intra.copilot.model.KnowledgeBase;
import com.intra.copilot.model.McpServer;
import com.intra.copilot.model.ToolDefinition;
import com.intra.copilot.repo.KnowledgeBaseRepository;
import com.intra.copilot.repo.McpServerRepository;
import com.intra.copilot.service.AgentOrchestrator;
import com.intra.copilot.service.AgentRegistry;
import com.intra.copilot.service.AttachmentService;
import com.intra.copilot.service.HookService;
import com.intra.copilot.service.LlmClient;
import com.intra.copilot.service.PlanningService;
import com.intra.copilot.service.SkillPromptAssembler;
import com.intra.copilot.service.ToolExecutor;
import com.intra.copilot.service.auth.AdminRole;
import com.intra.copilot.service.auth.RequestContext;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockMultipartFile;

class RouterAdminControllerTest {

    @BeforeEach
    void bindAdminIdentity() {
        RequestContext.set("admin", "admin-1", "operator", AdminRole.ADMIN);
    }

    @AfterEach
    void clearAdminIdentity() {
        RequestContext.clear();
    }

    @Test
    void supportsImageOnlyRoutingAndForwardsSidePanelPermissions() {
        AgentOrchestrator orchestrator = mock(AgentOrchestrator.class);
        AgentRegistry registry = mock(AgentRegistry.class);
        HookService hooks = mock(HookService.class);
        AttachmentService attachments = mock(AttachmentService.class);
        RouterAdminController controller =
                controller(orchestrator, registry, hooks, mock(LlmClient.class), attachments);
        Agent assistant = mock(Agent.class);
        when(assistant.id()).thenReturn("assistant");
        when(assistant.displayName()).thenReturn("页面助手");
        String image = "data:image/png;base64,aW1hZ2U=";
        when(attachments.imageDataUrls("admin", "admin-1", List.of("attachment-1")))
                .thenReturn(List.of(image));
        when(orchestrator.route(eq(""), eq(""), eq(List.of()), eq(List.of(image)), any()))
                .thenReturn(
                        new AgentOrchestrator.RoutingResult(
                                assistant, "assistant", 0.92, "根据图片内容选择", "llm", false, null));
        when(hooks.checks(any())).thenReturn(List.of());
        when(registry.enabledDefinitions()).thenReturn(List.of());

        Map<String, Object> response =
                controller.test(
                        new RouterAdminController.RouterTestRequest(
                                "", "", List.of("attachment-1"), Map.of("readPage", true)));

        assertEquals("assistant", response.get("agentId"));
        assertEquals(1, response.get("attachmentCount"));
        assertEquals(1, response.get("imageCount"));
        ArgumentCaptor<HookService.Context> contextCaptor =
                ArgumentCaptor.forClass(HookService.Context.class);
        verify(hooks, times(2)).checks(contextCaptor.capture());
        HookService.Context agentContext = contextCaptor.getValue();
        assertTrue(agentContext.pageContextConsent());
        assertTrue(Boolean.TRUE.equals(agentContext.permissions().get("readPage")));
        assertEquals(
                List.of(HookService.PHASE_PRE_ROUTE, HookService.PHASE_PRE_AGENT),
                contextCaptor.getAllValues().stream().map(HookService.Context::phase).toList());
        verify(orchestrator).route(eq(""), eq(""), eq(List.of()), eq(List.of(image)), any());
    }

    @Test
    void followsPluginDelegationAndRunsChildHooks() {
        AgentOrchestrator orchestrator = mock(AgentOrchestrator.class);
        AgentRegistry registry = mock(AgentRegistry.class);
        HookService hooks = mock(HookService.class);
        RouterAdminController controller =
                controller(
                        orchestrator,
                        registry,
                        hooks,
                        mock(LlmClient.class),
                        mock(AttachmentService.class));

        AgentDefinition domainDefinition = new AgentDefinition();
        domainDefinition.setId("finance-agent");
        domainDefinition.setDisplayName("财务领域 Agent");
        domainDefinition.setRole("DOMAIN");
        domainDefinition.setHandlingMode("AUTO");
        ConfigurableAgent domainAgent = new ConfigurableAgent(domainDefinition);
        Agent childAgent = mock(Agent.class);
        when(childAgent.id()).thenReturn("expense-agent");
        when(childAgent.displayName()).thenReturn("报销助手");
        when(orchestrator.route(eq("提交报销单"), eq("/expense"), eq(List.of()), eq(List.of()), any()))
                .thenReturn(
                        new AgentOrchestrator.RoutingResult(
                                domainAgent, "finance-agent", 0.91, "命中财务领域", "llm", false, null));
        when(orchestrator.decideDomain(
                        eq(domainDefinition), eq("提交报销单"), eq("/expense"), eq(List.of()), any()))
                .thenAnswer(
                        invocation -> {
                            AgentOrchestrator.DelegationTraceListener listener =
                                    invocation.getArgument(4);
                            listener.onDispatchStart("finance-agent", "分发提示词", "提交报销单", "/expense");
                            listener.onDispatchEnd(
                                    "finance-agent", null, "{\"mode\":\"DELEGATE\"}", 17, true);
                            return new AgentOrchestrator.DelegationResult(
                                    true,
                                    childAgent,
                                    "DELEGATE",
                                    "子 Agent 更匹配报销任务",
                                    0.88,
                                    List.of(),
                                    null);
                        });
        when(hooks.checks(any())).thenReturn(List.of());
        when(registry.enabledDefinitions()).thenReturn(List.of());

        Map<String, Object> response =
                controller.test(
                        new RouterAdminController.RouterTestRequest(
                                "提交报销单", "/expense", List.of(), Map.of("readPage", true)));

        assertEquals("expense-agent", response.get("agentId"));
        assertEquals("finance-agent", response.get("routeAgentId"));
        assertEquals(true, response.get("delegated"));
        @SuppressWarnings("unchecked")
        Map<String, Object> delegation = (Map<String, Object>) response.get("delegation");
        assertEquals("分发提示词", delegation.get("dispatchPrompt"));
        assertTrue(String.valueOf(delegation.get("dispatchInput")).contains("/expense"));
        assertEquals(17L, delegation.get("durationMs"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> steps = (List<Map<String, Object>>) response.get("steps");
        assertEquals(
                List.of(
                        "input",
                        "intent",
                        "dispatch",
                        "delegation",
                        "hooks",
                        "resources",
                        "planning"),
                steps.stream().map(step -> step.get("type")).toList());
        ArgumentCaptor<HookService.Context> contextCaptor =
                ArgumentCaptor.forClass(HookService.Context.class);
        verify(hooks, times(2)).checks(contextCaptor.capture());
        assertEquals(
                List.of("finance-agent", "expense-agent"),
                contextCaptor.getAllValues().stream().map(HookService.Context::agentId).toList());
    }

    @Test
    void doesNotForwardPageContextWhenReadPageIsDisabled() {
        AgentOrchestrator orchestrator = mock(AgentOrchestrator.class);
        AgentRegistry registry = mock(AgentRegistry.class);
        HookService hooks = mock(HookService.class);
        RouterAdminController controller =
                controller(
                        orchestrator,
                        registry,
                        hooks,
                        mock(LlmClient.class),
                        mock(AttachmentService.class));
        Agent assistant = mock(Agent.class);
        when(assistant.id()).thenReturn("assistant");
        when(assistant.displayName()).thenReturn("页面助手");
        when(orchestrator.route(eq("你好"), eq(""), eq(List.of()), eq(List.of()), any()))
                .thenReturn(
                        new AgentOrchestrator.RoutingResult(
                                assistant, "assistant", 0.8, "普通问候", "llm", false, null));
        when(hooks.checks(any())).thenReturn(List.of());
        when(registry.enabledDefinitions()).thenReturn(List.of());

        controller.test(
                new RouterAdminController.RouterTestRequest(
                        "你好", "不应发送给模型", List.of(), Map.of("readPage", false)));

        verify(orchestrator).route(eq("你好"), eq(""), eq(List.of()), eq(List.of()), any());
    }

    @Test
    void reportsPlanningAndChildAgentResources() {
        AgentOrchestrator orchestrator = mock(AgentOrchestrator.class);
        AgentRegistry registry = mock(AgentRegistry.class);
        HookService hooks = mock(HookService.class);
        PlanningService planning = mock(PlanningService.class);
        SkillPromptAssembler skillAssembler = mock(SkillPromptAssembler.class);
        ToolExecutor toolExecutor = mock(ToolExecutor.class);
        KnowledgeBaseRepository knowledgeBases = mock(KnowledgeBaseRepository.class);
        McpServerRepository mcpServers = mock(McpServerRepository.class);
        RouterAdminController controller =
                new RouterAdminController(
                        orchestrator,
                        registry,
                        hooks,
                        mock(LlmClient.class),
                        mock(AttachmentService.class),
                        planning,
                        skillAssembler,
                        toolExecutor,
                        knowledgeBases,
                        mcpServers,
                        new ObjectMapper());

        AgentDefinition parent = new AgentDefinition();
        parent.setId("finance-agent");
        parent.setDisplayName("财务领域 Agent");
        parent.setRole("DOMAIN");
        parent.setHandlingMode("AUTO");
        ConfigurableAgent parentAgent = new ConfigurableAgent(parent);
        AgentDefinition child = new AgentDefinition();
        child.setId("expense-agent");
        child.setDisplayName("报销助手");
        child.setRole("SUB");
        child.setSystemPrompt("处理报销");
        child.setSkillIds("[\"SK1\"]");
        child.setToolIds("[\"TL1\"]");
        child.setKnowledgeBaseIds("[\"KB1\"]");
        child.setPlanningMode("ALWAYS");
        child.setMaxPlanSteps(4);
        ConfigurableAgent childAgent = new ConfigurableAgent(child);
        AgentChildBinding binding = new AgentChildBinding();
        binding.setParentAgentId("finance-agent");
        binding.setChildAgentId("expense-agent");
        binding.setPriority(10);
        binding.setRoutingRule("报销");
        AgentOrchestrator.ChildCandidate candidate =
                new AgentOrchestrator.ChildCandidate(binding, child);

        when(orchestrator.route(eq("提交报销单"), eq("页面内容"), eq(List.of()), eq(List.of()), any()))
                .thenReturn(
                        new AgentOrchestrator.RoutingResult(
                                parentAgent, "finance-agent", 0.91, "命中财务领域", "llm", false, null));
        when(orchestrator.decideDomain(eq(parent), eq("提交报销单"), eq("页面内容"), eq(List.of()), any()))
                .thenReturn(
                        new AgentOrchestrator.DelegationResult(
                                true,
                                childAgent,
                                "DELEGATE",
                                "子 Agent 更匹配报销任务",
                                0.88,
                                List.of(candidate),
                                "报销"));

        ToolDefinition httpTool = new ToolDefinition();
        httpTool.setId("TL1");
        httpTool.setName("expense.submit");
        httpTool.setType("HTTP");
        ToolDefinition mcpTool = new ToolDefinition();
        mcpTool.setId("TL2");
        mcpTool.setName("expense.lookup");
        mcpTool.setType("MCP");
        mcpTool.setMcpServerId("MC1");
        when(toolExecutor.resolveById("TL1")).thenReturn(httpTool);
        when(toolExecutor.resolveById("TL2")).thenReturn(mcpTool);
        when(skillAssembler.assembleForAgent(
                        eq("expense-agent"),
                        eq(List.of("SK1")),
                        eq("处理报销"),
                        anyString(),
                        eq(false)))
                .thenReturn(
                        new SkillPromptAssembler.Assembly(
                                "处理报销\nSkill",
                                List.of("TL2"),
                                List.of(
                                        new SkillPromptAssembler.AppliedSkill(
                                                "SK1", "报销规范", 3, "3.0.0", 12, 8)),
                                List.of()));
        KnowledgeBase base = new KnowledgeBase();
        base.setId("KB1");
        base.setName("财务制度");
        base.setStatus("READY");
        when(knowledgeBases.findById("KB1")).thenReturn(Optional.of(base));
        McpServer server = new McpServer();
        server.setId("MC1");
        server.setName("财务 MCP");
        server.setStatus("HEALTHY");
        server.setTransport("STREAMABLE_HTTP");
        server.setInterfaceCount(1);
        when(mcpServers.findById("MC1")).thenReturn(Optional.of(server));
        when(planning.shouldPlan(eq(child), eq("提交报销单"), any())).thenReturn(true);
        when(planning.previewPlan(eq(child), eq("提交报销单"), eq("页面内容"), eq(List.of()), any()))
                .thenReturn(
                        Optional.of(
                                new PlanningService.PlanPreview(
                                        "ALWAYS",
                                        "完成报销",
                                        "查询后提交",
                                        List.of(
                                                new PlanningService.StepDraft(
                                                        "查询制度",
                                                        "读取知识库",
                                                        "expense-agent",
                                                        List.of("expense.lookup"),
                                                        List.of(),
                                                        "找到制度")),
                                        "planner request",
                                        "{\"goal\":\"完成报销\"}",
                                        18,
                                        false,
                                        120,
                                        80)));
        when(hooks.checks(any())).thenReturn(List.of());
        when(registry.enabledDefinitions()).thenReturn(List.of());

        Map<String, Object> response =
                controller.test(
                        new RouterAdminController.RouterTestRequest(
                                "提交报销单", "页面内容", List.of(), Map.of("readPage", true)));

        @SuppressWarnings("unchecked")
        Map<String, Object> resources = (Map<String, Object>) response.get("resources");
        assertEquals("expense-agent", resources.get("agentId"));
        assertEquals(1, ((List<?>) resources.get("skills")).size());
        assertEquals(2, ((List<?>) resources.get("tools")).size());
        assertEquals(1, ((List<?>) resources.get("mcpServers")).size());
        assertEquals(1, ((List<?>) resources.get("knowledgeBases")).size());
        @SuppressWarnings("unchecked")
        Map<String, Object> planningDetails = (Map<String, Object>) response.get("planning");
        assertEquals(true, planningDetails.get("enabled"));
        assertEquals(true, planningDetails.get("triggered"));
        assertEquals("完成报销", planningDetails.get("goal"));
    }

    @Test
    void stopsResourceAssemblyAndPlanningWhenHookRejects() {
        AgentOrchestrator orchestrator = mock(AgentOrchestrator.class);
        AgentRegistry registry = mock(AgentRegistry.class);
        HookService hooks = mock(HookService.class);
        PlanningService planning = mock(PlanningService.class);
        SkillPromptAssembler skillAssembler = mock(SkillPromptAssembler.class);
        ToolExecutor toolExecutor = mock(ToolExecutor.class);
        RouterAdminController controller =
                new RouterAdminController(
                        orchestrator,
                        registry,
                        hooks,
                        mock(LlmClient.class),
                        mock(AttachmentService.class),
                        planning,
                        skillAssembler,
                        toolExecutor,
                        mock(KnowledgeBaseRepository.class),
                        mock(McpServerRepository.class),
                        new ObjectMapper());

        AgentDefinition definition = new AgentDefinition();
        definition.setId("finance-agent");
        definition.setDisplayName("财务领域 Agent");
        definition.setRole("DOMAIN");
        definition.setHandlingMode("DIRECT");
        ConfigurableAgent agent = new ConfigurableAgent(definition);
        when(orchestrator.route(eq("提交报销单"), eq(""), eq(List.of()), eq(List.of()), any()))
                .thenReturn(
                        new AgentOrchestrator.RoutingResult(
                                agent, "finance-agent", 0.91, "命中财务领域", "llm", false, null));
        when(orchestrator.decideDomain(eq(definition), eq("提交报销单"), eq(""), eq(List.of()), any()))
                .thenReturn(
                        new AgentOrchestrator.DelegationResult(
                                false, agent, "DIRECT", "领域 Agent 直接处理", 1.0, List.of(), null));
        when(hooks.checks(any()))
                .thenReturn(
                        List.of(
                                new HookService.HookCheck(
                                        "hook-1",
                                        "禁止提交",
                                        "KEYWORD_BLOCK",
                                        HookService.PHASE_PRE_ROUTE,
                                        1,
                                        "{}",
                                        "BLOCK",
                                        false,
                                        "命中阻断规则",
                                        null,
                                        1)));
        when(registry.enabledDefinitions()).thenReturn(List.of());

        Map<String, Object> response =
                controller.test(
                        new RouterAdminController.RouterTestRequest(
                                "提交报销单", "", List.of(), Map.of()));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> steps = (List<Map<String, Object>>) response.get("steps");
        assertEquals(
                List.of("input", "intent", "dispatch", "hooks"),
                steps.stream().map(step -> step.get("type")).toList());
        assertTrue(!response.containsKey("resources"));
        assertTrue(!response.containsKey("planning"));
        verify(hooks, times(1)).checks(any());
        verify(skillAssembler, times(0)).assembleForAgent(any(), any(), any(), any(), eq(false));
        verify(planning, times(0)).shouldPlan(any(), any(), any());
    }

    @Test
    void returnsAdminPreviewUrlForUploadedAttachment() throws Exception {
        AttachmentService attachments = mock(AttachmentService.class);
        RouterAdminController controller =
                controller(
                        mock(AgentOrchestrator.class),
                        mock(AgentRegistry.class),
                        mock(HookService.class),
                        mock(LlmClient.class),
                        attachments);
        MockMultipartFile file =
                new MockMultipartFile("files", "screen.png", "image/png", new byte[] {1, 2, 3});
        when(attachments.upload("admin", "admin-1", List.of(file)))
                .thenReturn(
                        List.of(
                                new AttachmentView(
                                        "attachment-1",
                                        "screen.png",
                                        "image/png",
                                        3,
                                        true,
                                        "http://127.0.0.1:8080/api/v1/attachments/attachment-1")));

        List<AttachmentView> uploaded = controller.uploadAttachments(List.of(file));

        assertEquals("/admin/router/attachments/attachment-1", uploaded.get(0).url());
    }

    private static RouterAdminController controller(
            AgentOrchestrator orchestrator,
            AgentRegistry registry,
            HookService hooks,
            LlmClient llm,
            AttachmentService attachments) {
        PlanningService planning = mock(PlanningService.class);
        when(planning.shouldPlan(any(), any(), any())).thenReturn(false);
        return new RouterAdminController(
                orchestrator,
                registry,
                hooks,
                llm,
                attachments,
                planning,
                mock(SkillPromptAssembler.class),
                mock(ToolExecutor.class),
                mock(KnowledgeBaseRepository.class),
                mock(McpServerRepository.class),
                new ObjectMapper());
    }
}
