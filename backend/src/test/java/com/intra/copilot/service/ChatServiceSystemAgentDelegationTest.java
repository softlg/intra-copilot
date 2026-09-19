package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.model.Conversation;
import com.intra.copilot.repo.ActionProposalRepository;
import com.intra.copilot.repo.AgentInvocationRepository;
import com.intra.copilot.repo.AgentPlanRepository;
import com.intra.copilot.repo.AgentPlanStepRepository;
import com.intra.copilot.repo.ConversationRepository;
import com.intra.copilot.repo.MessageRepository;
import com.intra.copilot.service.stream.SseExecutionService;
import com.intra.copilot.service.stream.RuntimeLockService;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import reactor.core.publisher.Flux;

class ChatServiceSystemAgentDelegationTest {

    @Test
    void outerAgentCanDelegateAndContinueAfterSystemAgentReturns() {
        ConversationRepository conversations = mock(ConversationRepository.class);
        AgentInvocationRepository invocations = mock(AgentInvocationRepository.class);
        LlmClient llm = mock(LlmClient.class);
        TraceRecorder trace = mock(TraceRecorder.class, RETURNS_DEEP_STUBS);
        AgentRegistry registry = mock(AgentRegistry.class);
        when(registry.findPublished(SystemAgentCatalog.BROWSER_OPERATOR))
                .thenReturn(Optional.of(browserOperator()));
        SystemAgentBroker broker =
                new SystemAgentBroker(
                        new SystemAgentCatalog(), registry, new ObjectMapper());
        ChatService service =
                new ChatService(
                        conversations,
                        mock(MessageRepository.class),
                        mock(ActionProposalRepository.class),
                        invocations,
                        mock(AgentOrchestrator.class),
                        mock(HookService.class),
                        llm,
                        mock(KnowledgeRetriever.class),
                        mock(AttachmentService.class),
                        trace,
                        mock(ToolExecutor.class),
                        mock(BrowserCapabilityTools.class),
                        broker,
                        mock(SkillPromptAssembler.class),
                        mock(PlanningService.class),
                        mock(SseExecutionService.class),
                        mock(RuntimeLockService.class),
                        mock(ChatPersistenceService.class),
                        mock(BrowserActionCoordinator.class),
                        mock(AgentPlanRepository.class),
                        mock(AgentPlanStepRepository.class),
                        5,
                        5,
                        6000,
                        40,
                        180,
                        600,
                        300);
        AgentDefinition caller = agent("general-1", "GENERAL");
        ToolCallback delegation = broker.callbackFor(caller);
        when(llm.streamWithTools(
                        anyString(),
                        anyList(),
                        anyString(),
                        anyList(),
                        any(ToolCallback[].class)))
                .thenReturn(
                        Flux.just(
                                toolCall(
                                        """
                                        {
                                          "capability":"browser.operate",
                                          "goal":"执行子任务",
                                          "mode":"DELEGATE"
                                        }
                                        """)),
                        Flux.just(text("外层最终回答")));
        when(llm.streamResponses(anyString(), anyList(), anyString(), anyList()))
                .thenReturn(Flux.just(text("系统 Agent 子任务完成")));
        Conversation conversation = new Conversation();

        ChatService.ReActResult result =
                service.executeReAct(
                        new SseEmitter(60000L),
                        new AtomicBoolean(false),
                        conversation,
                        "outer system",
                        new ArrayList<>(),
                        "请调用系统 Agent",
                        List.of(),
                        List.of(),
                        List.of(delegation),
                        "IV1",
                        "TR1",
                        null,
                        null,
                        false,
                        caller,
                        0,
                        List.of(caller.getId()),
                        3,
                        null);

        assertEquals("外层最终回答", result.content());
        verify(invocations, org.mockito.Mockito.atLeast(2))
                .save(any(com.intra.copilot.model.AgentInvocation.class));
    }

    private ChatResponse toolCall(String arguments) {
        AssistantMessage.ToolCall call =
                new AssistantMessage.ToolCall(
                        "call-1", "function", SystemAgentCatalog.DELEGATION_TOOL_NAME, arguments);
        return new ChatResponse(
                List.of(
                        new Generation(
                                new AssistantMessage("", Map.of(), List.of(call)))));
    }

    private ChatResponse text(String content) {
        return new ChatResponse(List.of(new Generation(new AssistantMessage(content))));
    }

    private AgentDefinition browserOperator() {
        AgentDefinition definition = agent(SystemAgentCatalog.BROWSER_OPERATOR, "GENERAL");
        definition.setDisplayName("浏览器操作助手");
        definition.setMaxPlanSteps(10);
        definition.setSystemAgent(true);
        definition.setOwnerType(SystemAgentGuard.SYSTEM_OWNER);
        definition.setManagementMode(SystemAgentGuard.SYSTEM_LOCKED);
        return definition;
    }

    private AgentDefinition agent(String id, String role) {
        AgentDefinition definition = new AgentDefinition();
        definition.setId(id);
        definition.setRole(role);
        definition.setDisplayName(id);
        definition.setSystemPrompt("prompt");
        definition.setEnabled(true);
        definition.setPublished(true);
        definition.setPublishedVersion(1);
        return definition;
    }
}
