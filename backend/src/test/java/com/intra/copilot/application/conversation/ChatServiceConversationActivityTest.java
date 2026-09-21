package com.intra.copilot.application.conversation;

import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.intra.copilot.application.agent.AgentOrchestrator;
import com.intra.copilot.application.agent.BrowserRuntimeRegistry;
import com.intra.copilot.application.agent.BrowserTaskService;
import com.intra.copilot.application.agent.PlanningService;
import com.intra.copilot.application.agent.SystemAgentBroker;
import com.intra.copilot.application.capability.HookService;
import com.intra.copilot.application.capability.SkillPromptAssembler;
import com.intra.copilot.application.knowledge.KnowledgeRetriever;
import com.intra.copilot.domain.conversation.Conversation;
import com.intra.copilot.domain.conversation.Message;
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
import java.time.Instant;
import org.junit.jupiter.api.Test;

class ChatServiceConversationActivityTest {

    @Test
    void persistingMessageTouchesConversation() throws InterruptedException {
        ConversationRepository conversations = mock(ConversationRepository.class);
        MessageRepository messages = mock(MessageRepository.class);
        ChatService service =
                new ChatService(
                        conversations,
                        messages,
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
                        mock(RuntimeLockService.class),
                        mock(DistributedCancellationService.class),
                        new ChatPersistenceService(
                                conversations, messages, mock(AttachmentService.class)),
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
        Conversation conversation = new Conversation();
        Instant before = conversation.getUpdatedAt();
        Message message = new Message(conversation.getId(), "user", "hello", null, null);

        Thread.sleep(2);
        service.persistMessage(conversation, message);

        verify(messages).save(message);
        verify(conversations).save(conversation);
        assertNotEquals(before, conversation.getUpdatedAt());
    }
}
