package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.intra.copilot.model.Conversation;
import com.intra.copilot.model.Message;
import com.intra.copilot.repo.ActionProposalRepository;
import com.intra.copilot.repo.AgentInvocationRepository;
import com.intra.copilot.repo.AgentPlanRepository;
import com.intra.copilot.repo.AgentPlanStepRepository;
import com.intra.copilot.repo.ConversationRepository;
import com.intra.copilot.repo.MessageRepository;
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
                        mock(SkillPromptAssembler.class),
                        mock(PlanningService.class),
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
