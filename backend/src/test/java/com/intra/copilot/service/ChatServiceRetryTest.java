package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.intra.copilot.model.Message;
import java.util.List;
import org.junit.jupiter.api.Test;

class ChatServiceRetryTest {

    @Test
    void reusesLatestUserMessageAndReplacesAssistantReply() {
        Message earlierUser = message("user", "earlier");
        Message earlierAssistant = message("assistant", "earlier answer");
        Message retryUser = message("user", "retry this");
        Message retryAssistant = message("assistant", "old answer");

        ChatService.RetryContext context =
                ChatService.resolveRetryContext(
                        List.of(earlierUser, earlierAssistant, retryUser, retryAssistant),
                        "retry this");

        assertTrue(context.reuseUserMessage());
        assertEquals(List.of(earlierUser, earlierAssistant), context.history());
        assertEquals(retryAssistant.getId(), context.replacedAssistantId());
    }

    @Test
    void reusesUserMessageWhenAssistantWasNotSaved() {
        Message earlierUser = message("user", "earlier");
        Message earlierAssistant = message("assistant", "earlier answer");
        Message retryUser = message("user", "retry this");

        ChatService.RetryContext context =
                ChatService.resolveRetryContext(
                        List.of(earlierUser, earlierAssistant, retryUser), "retry this");

        assertTrue(context.reuseUserMessage());
        assertEquals(List.of(earlierUser, earlierAssistant), context.history());
        assertNull(context.replacedAssistantId());
    }

    @Test
    void keepsHistoryWhenRetryWasNotPersisted() {
        Message earlierUser = message("user", "earlier");
        Message earlierAssistant = message("assistant", "earlier answer");
        List<Message> history = List.of(earlierUser, earlierAssistant);

        ChatService.RetryContext context =
                ChatService.resolveRetryContext(history, "request never reached backend");

        assertFalse(context.reuseUserMessage());
        assertEquals(history, context.history());
        assertNull(context.replacedAssistantId());
    }

    private Message message(String role, String content) {
        return new Message("conversation", role, content, "assistant", null);
    }
}
