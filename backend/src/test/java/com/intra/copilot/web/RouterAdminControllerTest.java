package com.intra.copilot.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.intra.copilot.agent.Agent;
import com.intra.copilot.agent.ConfigurableAgent;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.model.AttachmentView;
import com.intra.copilot.service.AgentOrchestrator;
import com.intra.copilot.service.AgentRegistry;
import com.intra.copilot.service.AttachmentService;
import com.intra.copilot.service.HookService;
import com.intra.copilot.service.LlmClient;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockMultipartFile;

class RouterAdminControllerTest {

    @Test
    void supportsImageOnlyRoutingAndForwardsSidePanelPermissions() {
        AgentOrchestrator orchestrator = mock(AgentOrchestrator.class);
        AgentRegistry registry = mock(AgentRegistry.class);
        HookService hooks = mock(HookService.class);
        AttachmentService attachments = mock(AttachmentService.class);
        RouterAdminController controller =
                new RouterAdminController(
                        orchestrator, registry, hooks, mock(LlmClient.class), attachments);
        Agent assistant = mock(Agent.class);
        when(assistant.id()).thenReturn("assistant");
        when(assistant.displayName()).thenReturn("页面助手");
        String image = "data:image/png;base64,aW1hZ2U=";
        when(attachments.imageDataUrls(List.of("attachment-1"))).thenReturn(List.of(image));
        when(orchestrator.route("", "", List.of(), List.of(image)))
                .thenReturn(
                        new AgentOrchestrator.RoutingResult(
                                assistant, "assistant", 0.92, "根据图片内容选择", "llm", false, null));
        when(hooks.checks(any())).thenReturn(List.of());
        when(registry.enabledDefinitions()).thenReturn(List.of());

        Map<String, Object> response =
                controller.test(
                        new RouterAdminController.RouterTestRequest(
                                "",
                                "",
                                List.of("attachment-1"),
                                Map.of("readPage", true)));

        assertEquals("assistant", response.get("agentId"));
        assertEquals(1, response.get("attachmentCount"));
        assertEquals(1, response.get("imageCount"));
        ArgumentCaptor<HookService.Context> contextCaptor =
                ArgumentCaptor.forClass(HookService.Context.class);
        verify(hooks).checks(contextCaptor.capture());
        assertTrue(Boolean.TRUE.equals(contextCaptor.getValue().permissions().get("readPage")));
        verify(orchestrator).route("", "", List.of(), List.of(image));
    }

    @Test
    void followsPluginDelegationAndRunsChildHooks() {
        AgentOrchestrator orchestrator = mock(AgentOrchestrator.class);
        AgentRegistry registry = mock(AgentRegistry.class);
        HookService hooks = mock(HookService.class);
        RouterAdminController controller =
                new RouterAdminController(
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
        when(orchestrator.route("提交报销单", "/expense", List.of(), List.of()))
                .thenReturn(
                        new AgentOrchestrator.RoutingResult(
                                domainAgent, "finance-agent", 0.91, "命中财务领域", "llm", false, null));
        when(orchestrator.decideDomain(domainDefinition, "提交报销单", "/expense", List.of()))
                .thenReturn(
                        new AgentOrchestrator.DelegationResult(
                                true,
                                childAgent,
                                "DELEGATE",
                                "子 Agent 更匹配报销任务",
                                0.88,
                                List.of(),
                                null));
        when(hooks.checks(any())).thenReturn(List.of());
        when(registry.enabledDefinitions()).thenReturn(List.of());

        Map<String, Object> response =
                controller.test(
                        new RouterAdminController.RouterTestRequest(
                                "提交报销单",
                                "/expense",
                                List.of(),
                                Map.of("readPage", true)));

        assertEquals("expense-agent", response.get("agentId"));
        assertEquals("finance-agent", response.get("routeAgentId"));
        assertEquals(true, response.get("delegated"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> steps = (List<Map<String, Object>>) response.get("steps");
        assertEquals(
                List.of("input", "intent", "dispatch", "delegation", "hooks"),
                steps.stream().map(step -> step.get("type")).toList());
        ArgumentCaptor<HookService.Context> contextCaptor =
                ArgumentCaptor.forClass(HookService.Context.class);
        verify(hooks, times(2)).checks(contextCaptor.capture());
        assertEquals(
                List.of("finance-agent", "expense-agent"),
                contextCaptor.getAllValues().stream()
                        .map(HookService.Context::agentId)
                        .toList());
    }

    @Test
    void doesNotForwardPageContextWhenReadPageIsDisabled() {
        AgentOrchestrator orchestrator = mock(AgentOrchestrator.class);
        AgentRegistry registry = mock(AgentRegistry.class);
        HookService hooks = mock(HookService.class);
        RouterAdminController controller =
                new RouterAdminController(
                        orchestrator,
                        registry,
                        hooks,
                        mock(LlmClient.class),
                        mock(AttachmentService.class));
        Agent assistant = mock(Agent.class);
        when(assistant.id()).thenReturn("assistant");
        when(assistant.displayName()).thenReturn("页面助手");
        when(orchestrator.route("你好", "", List.of(), List.of()))
                .thenReturn(
                        new AgentOrchestrator.RoutingResult(
                                assistant, "assistant", 0.8, "普通问候", "llm", false, null));
        when(hooks.checks(any())).thenReturn(List.of());
        when(registry.enabledDefinitions()).thenReturn(List.of());

        controller.test(
                new RouterAdminController.RouterTestRequest(
                        "你好",
                        "不应发送给模型",
                        List.of(),
                        Map.of("readPage", false)));

        verify(orchestrator).route("你好", "", List.of(), List.of());
    }

    @Test
    void returnsAdminPreviewUrlForUploadedAttachment() throws Exception {
        AttachmentService attachments = mock(AttachmentService.class);
        RouterAdminController controller =
                new RouterAdminController(
                        mock(AgentOrchestrator.class),
                        mock(AgentRegistry.class),
                        mock(HookService.class),
                        mock(LlmClient.class),
                        attachments);
        MockMultipartFile file =
                new MockMultipartFile("files", "screen.png", "image/png", new byte[] {1, 2, 3});
        when(attachments.upload(List.of(file)))
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

        assertEquals(
                "/admin/router/attachments/attachment-1", uploaded.get(0).url());
    }
}
