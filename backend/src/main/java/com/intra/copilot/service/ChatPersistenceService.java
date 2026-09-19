package com.intra.copilot.service;

import com.intra.copilot.model.Conversation;
import com.intra.copilot.model.Message;
import com.intra.copilot.repo.ConversationRepository;
import com.intra.copilot.repo.MessageRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Short transactional operations for conversation writes. */
@Service
public class ChatPersistenceService {
    private final ConversationRepository conversations;
    private final MessageRepository messages;
    private final AttachmentService attachments;

    public ChatPersistenceService(
            ConversationRepository conversations,
            MessageRepository messages,
            AttachmentService attachments) {
        this.conversations = conversations;
        this.messages = messages;
        this.attachments = attachments;
    }

    @Transactional
    public void persistUserMessage(
            Conversation conversation,
            Message message,
            String source,
            String userId,
            List<String> attachmentIds) {
        messages.save(message);
        attachments.linkToMessage(source, userId, attachmentIds, message.getId());
        touchConversation(conversation);
    }

    @Transactional
    public void persistMessage(Conversation conversation, Message message) {
        messages.save(message);
        touchConversation(conversation);
    }

    private void touchConversation(Conversation conversation) {
        conversation.touch();
        conversations.save(conversation);
    }
}
