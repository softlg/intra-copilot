package com.intra.copilot.application.conversation;

import com.intra.copilot.domain.conversation.Conversation;
import com.intra.copilot.domain.conversation.Message;
import com.intra.copilot.infrastructure.persistence.conversation.ConversationRepository;
import com.intra.copilot.infrastructure.persistence.conversation.MessageRepository;
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
