package com.intra.copilot.interfaces.rest.conversation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.intra.copilot.application.agent.AgentRegistry;
import com.intra.copilot.domain.agent.AgentDefinition;
import com.intra.copilot.domain.conversation.AgentFeedback;
import com.intra.copilot.domain.conversation.Conversation;
import com.intra.copilot.domain.conversation.Message;
import com.intra.copilot.infrastructure.persistence.conversation.AgentFeedbackRepository;
import com.intra.copilot.infrastructure.persistence.conversation.ConversationRepository;
import com.intra.copilot.infrastructure.persistence.conversation.MessageRepository;
import com.intra.copilot.shared.identity.RequestContext;
import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class FeedbackControllerTest {
    private AgentFeedbackRepository feedback;
    private ConversationRepository conversations;
    private MessageRepository messages;
    private AgentRegistry agents;
    private FeedbackController controller;
    private Conversation conversation;
    private Message userMessage;
    private Message assistantMessage;

    @BeforeEach
    void setUp() {
        feedback = mock(AgentFeedbackRepository.class);
        conversations = mock(ConversationRepository.class);
        messages = mock(MessageRepository.class);
        agents = mock(AgentRegistry.class);
        controller = new FeedbackController(feedback, conversations, messages, agents);

        conversation = mock(Conversation.class);
        when(conversation.getId()).thenReturn("session-1");
        when(conversation.getSource()).thenReturn("extension");
        when(conversation.getUserId()).thenReturn("user-1");
        when(conversations.findById("session-1")).thenReturn(Optional.of(conversation));

        userMessage = new Message("session-1", "user", "请检查这个页面", null, null);
        assistantMessage = new Message("session-1", "assistant", "页面检查结果", "agent-1", null);
        when(messages.findById(assistantMessage.getId())).thenReturn(Optional.of(assistantMessage));
        when(messages.findByConversationIdOrderByCreatedAtAsc("session-1"))
                .thenReturn(List.of(userMessage, assistantMessage));

        AgentDefinition agent = mock(AgentDefinition.class);
        when(agent.getId()).thenReturn("agent-1");
        when(agent.getDisplayName()).thenReturn("页面诊断 Agent");
        when(agents.allDefinitions()).thenReturn(List.of(agent));

        RequestContext.set("extension", "user-1");
    }

    @AfterEach
    void tearDown() {
        RequestContext.clear();
    }

    @Test
    void repeatedVoteUpdatesOneRecordAndRatingSwitchClearsReason() {
        AtomicReference<AgentFeedback> stored = new AtomicReference<>();
        when(feedback.findBySourceAndUserIdAndMessageId(
                        "extension", "user-1", assistantMessage.getId()))
                .thenAnswer(ignored -> Optional.ofNullable(stored.get()));
        when(feedback.save(any(AgentFeedback.class)))
                .thenAnswer(
                        invocation -> {
                            AgentFeedback value = invocation.getArgument(0);
                            stored.set(value);
                            return value;
                        });

        FeedbackController.FeedbackView down =
                controller.update(
                        new FeedbackController.FeedbackRequest(
                                "session-1",
                                assistantMessage.getId(),
                                99,
                                "spoofed-agent",
                                "down",
                                null,
                                "INACCURATE",
                                "回答与页面事实不一致",
                                "spoofed answer",
                                "spoofed question"));
        FeedbackController.FeedbackView enriched =
                controller.update(
                        new FeedbackController.FeedbackRequest(
                                "session-1",
                                assistantMessage.getId(),
                                null,
                                null,
                                "down",
                                null,
                                "IRRELEVANT",
                                "没有回答用户问题",
                                null,
                                null));
        FeedbackController.FeedbackView up =
                controller.update(
                        new FeedbackController.FeedbackRequest(
                                "session-1",
                                assistantMessage.getId(),
                                null,
                                null,
                                "up",
                                "这条旧评论不应保留",
                                null,
                                null,
                                null,
                                null));

        assertEquals(down.id(), enriched.id());
        assertEquals(down.id(), up.id());
        assertEquals("agent-1", up.agentId());
        assertEquals("页面诊断 Agent", up.agentName());
        assertEquals(1, up.messageIndex());
        assertEquals("请检查这个页面", up.userMessage());
        assertEquals("页面检查结果", up.messageContent());
        assertEquals("up", up.rating());
        assertNull(up.reasonCode());
        assertNull(up.reasonText());
    }

    @Test
    void deleteRetractsTheCurrentUsersVote() {
        AgentFeedback existing = new AgentFeedback();
        existing.setSource("extension");
        existing.setUserId("user-1");
        existing.setMessageId(assistantMessage.getId());
        when(feedback.findBySourceAndUserIdAndMessageId(
                        "extension", "user-1", assistantMessage.getId()))
                .thenReturn(Optional.of(existing));

        controller.delete(assistantMessage.getId(), "session-1");

        verify(feedback).deleteById(existing.getId());
    }

    @Test
    void rejectsConversationOwnedByAnotherUser() {
        when(conversation.getUserId()).thenReturn("user-2");

        assertThrows(
                NoSuchElementException.class,
                () ->
                        controller.update(
                                new FeedbackController.FeedbackRequest(
                                        "session-1",
                                        assistantMessage.getId(),
                                        null,
                                        null,
                                        "up",
                                        null,
                                        null,
                                        null,
                                        null,
                                        null)));
    }

    @Test
    void rejectsUserMessageFeedback() {
        when(messages.findById(userMessage.getId())).thenReturn(Optional.of(userMessage));

        assertThrows(
                NoSuchElementException.class,
                () ->
                        controller.update(
                                new FeedbackController.FeedbackRequest(
                                        "session-1",
                                        userMessage.getId(),
                                        null,
                                        null,
                                        "up",
                                        null,
                                        null,
                                        null,
                                        null,
                                        null)));
    }

    @Test
    void summaryBuildsAgentInspectionAndLocalizableSuggestions() {
        AgentFeedback first = feedback("agent-1", "down", "INACCURATE");
        AgentFeedback second = feedback("agent-1", "down", null);
        AgentFeedback third = feedback("agent-1", "up", null);
        AgentFeedback fourth = feedback("agent-2", "down", "IRRELEVANT");
        when(feedback.find(any())).thenReturn(List.of(first, second, third, fourth));

        FeedbackController.FeedbackSummary summary =
                controller.summary(null, null, null, null, null, null);

        assertEquals(4, summary.total());
        assertEquals(1, summary.up());
        assertEquals(3, summary.down());
        assertEquals(1, summary.noReason());
        assertEquals(30, summary.trend().size());
        assertEquals(30, summary.trendDays());
        assertTrue(summary.suggestionCodes().contains("MISSING_REASON"));
        assertTrue(summary.suggestionCodes().contains("INACCURATE"));
        assertEquals("agent-1", summary.agentBreakdown().get(0).agentId());
        assertEquals(2, summary.agentBreakdown().get(0).down());
        assertEquals("MISSING", summary.agentBreakdown().get(0).topReasonCode());
    }

    @Test
    void rejectsUnknownReasonFilter() {
        assertThrows(
                IllegalArgumentException.class,
                () -> controller.list(null, null, "UNKNOWN", null, null, null, 1, 20));
    }

    private static AgentFeedback feedback(String agentId, String rating, String reasonCode) {
        AgentFeedback item = new AgentFeedback();
        item.setAgentId(agentId);
        item.setRating(rating);
        item.setReasonCode(reasonCode);
        item.setStatus("ACTIVE");
        item.setCreatedAt(Instant.now());
        item.setRatedAt(Instant.now());
        item.setUpdatedAt(Instant.now());
        return item;
    }
}
