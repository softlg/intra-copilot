package com.intra.copilot.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.intra.copilot.model.AttachmentView;
import com.intra.copilot.model.Conversation;
import com.intra.copilot.model.Message;
import com.intra.copilot.repo.ActionProposalRepository;
import com.intra.copilot.repo.AgentInvocationRepository;
import com.intra.copilot.repo.ConversationRepository;
import com.intra.copilot.repo.MessageRepository;
import com.intra.copilot.service.AttachmentService;
import com.intra.copilot.service.TraceRecorder;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class ConversationLogAdminControllerTest {

    @Test
    void detailIncludesMessageAttachmentMetadata() {
        ConversationRepository conversations = mock(ConversationRepository.class);
        MessageRepository messages = mock(MessageRepository.class);
        AgentInvocationRepository invocations = mock(AgentInvocationRepository.class);
        ActionProposalRepository actions = mock(ActionProposalRepository.class);
        AttachmentService attachments = mock(AttachmentService.class);
        TraceRecorder trace = mock(TraceRecorder.class);
        ConversationLogAdminController controller =
                new ConversationLogAdminController(conversations, messages, invocations, actions, attachments, trace);

        Conversation conversation = mock(Conversation.class);
        when(conversation.getId()).thenReturn("conversation-1");
        when(conversation.getTitle()).thenReturn("附件会话");
        when(conversation.getCreatedAt()).thenReturn(Instant.parse("2026-09-10T00:00:00Z"));
        when(conversation.getUpdatedAt()).thenReturn(Instant.parse("2026-09-10T00:01:00Z"));
        when(conversations.findById("conversation-1")).thenReturn(Optional.of(conversation));

        Message message = new Message("conversation-1", "user", "请查看图片", null, null);
        when(messages.findByConversationIdOrderByCreatedAtAsc("conversation-1"))
                .thenReturn(List.of(message));
        when(invocations.findByConversationIdOrderByCreatedAtAsc("conversation-1"))
                .thenReturn(List.of());
        when(actions.findByConversationIdOrderByExpiresAtAsc("conversation-1"))
                .thenReturn(List.of());
        AttachmentView attachment =
                new AttachmentView("attachment-1", "screen.png", "image/png", 128, true, "/attachments/attachment-1");
        when(attachments.listForMessage(message.getId())).thenReturn(List.of(attachment));

        ConversationLogAdminController.ConversationLog detail = controller.detail("conversation-1");

        assertEquals(1, detail.messages().size());
        assertEquals(1, detail.messages().get(0).attachments().size());
        assertEquals("screen.png", detail.messages().get(0).attachments().get(0).filename());
        assertEquals("image/png", detail.messages().get(0).attachments().get(0).contentType());
        assertEquals(128, detail.messages().get(0).attachments().get(0).size());
    }
}
