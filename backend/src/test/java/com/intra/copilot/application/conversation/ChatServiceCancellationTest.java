package com.intra.copilot.application.conversation;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.intra.copilot.application.agent.AgentOrchestrator;
import com.intra.copilot.application.agent.BrowserRuntimeRegistry;
import com.intra.copilot.application.agent.BrowserTaskService;
import com.intra.copilot.application.agent.PlanningService;
import com.intra.copilot.application.agent.SystemAgentBroker;
import com.intra.copilot.application.capability.HookService;
import com.intra.copilot.application.capability.SkillPromptAssembler;
import com.intra.copilot.application.knowledge.KnowledgeRetriever;
import com.intra.copilot.domain.conversation.Conversation;
import com.intra.copilot.infrastructure.agent.BrowserActionCoordinator;
import com.intra.copilot.infrastructure.agent.BrowserCapabilityTools;
import com.intra.copilot.infrastructure.ai.LlmClient;
import com.intra.copilot.infrastructure.capability.ToolExecutor;
import com.intra.copilot.infrastructure.conversation.DistributedCancellationService;
import com.intra.copilot.infrastructure.conversation.RuntimeLockService;
import com.intra.copilot.infrastructure.conversation.SseExecutionService;
import com.intra.copilot.infrastructure.observability.TraceRecorder;
import com.intra.copilot.infrastructure.persistence.conversation.ActionProposalRepository;
import com.intra.copilot.infrastructure.persistence.conversation.AgentInvocationRepository;
import com.intra.copilot.infrastructure.persistence.conversation.AgentPlanRepository;
import com.intra.copilot.infrastructure.persistence.conversation.AgentPlanStepRepository;
import com.intra.copilot.infrastructure.persistence.conversation.ConversationRepository;
import com.intra.copilot.infrastructure.persistence.conversation.MessageRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class ChatServiceCancellationTest {

    @Test
    void cancelMarksRunAndReleasesConversationLock() {
        ConversationRepository conversations = mock(ConversationRepository.class);
        DistributedCancellationService cancellations = mock(DistributedCancellationService.class);
        RuntimeLockService locks = mock(RuntimeLockService.class);
        Conversation conversation = new Conversation();
        conversation.setSource("extension");
        conversation.setUserId("user-1");
        when(conversations.findById(conversation.getId())).thenReturn(Optional.of(conversation));
        ChatService service = service(conversations, cancellations, locks);

        service.cancel("extension", "user-1", conversation.getId(), "run-1");

        verify(cancellations).request("run-1");
        verify(locks).release("chat-session:" + conversation.getId(), "run-1");
    }

    private ChatService service(
            ConversationRepository conversations,
            DistributedCancellationService cancellations,
            RuntimeLockService locks) {
        return new ChatService(
                conversations,
                mock(MessageRepository.class),
                mock(ActionProposalRepository.class),
                mock(AgentInvocationRepository.class),
                mock(AgentOrchestrator.class),
                mock(HookService.class),
                mock(LlmClient.class),
                mock(KnowledgeRetriever.class),
                mock(AttachmentService.class),
                mock(TraceRecorder.class),
                mock(ToolExecutor.class),
                mock(BrowserCapabilityTools.class),
                mock(SystemAgentBroker.class),
                mock(BrowserRuntimeRegistry.class),
                mock(BrowserTaskService.class),
                mock(SkillPromptAssembler.class),
                mock(PlanningService.class),
                mock(SseExecutionService.class),
                locks,
                cancellations,
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
    }
}
