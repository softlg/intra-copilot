package com.intra.copilot.web;

import com.intra.copilot.model.ActionProposal;
import com.intra.copilot.model.AgentInvocation;
import com.intra.copilot.model.Conversation;
import com.intra.copilot.model.Message;
import com.intra.copilot.repo.ActionProposalRepository;
import com.intra.copilot.repo.AgentInvocationRepository;
import com.intra.copilot.repo.ConversationRepository;
import com.intra.copilot.repo.MessageRepository;
import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Read-only admin view of the complete per-session assistant execution trail. */
@RestController
@RequestMapping("/api/v1/admin/conversation-logs")
public class ConversationLogAdminController {
        private final ConversationRepository conversations;
        private final MessageRepository messages;
        private final AgentInvocationRepository invocations;
        private final ActionProposalRepository actions;

        public ConversationLogAdminController(
                        ConversationRepository conversations,
                        MessageRepository messages,
                        AgentInvocationRepository invocations,
                        ActionProposalRepository actions) {
                this.conversations = conversations;
                this.messages = messages;
                this.invocations = invocations;
                this.actions = actions;
        }

        /** 分页列出会话摘要，可按会话 ID（模糊）过滤。 */
        @GetMapping
        public ConversationPage list(
                        @RequestParam(defaultValue = "1") int page,
                        @RequestParam(defaultValue = "10") int size,
                        @RequestParam(required = false) String sessionId) {
                int safePage = Math.max(1, page);
                int safeSize = Math.max(1, Math.min(size, 100));
                List<Conversation> all = conversations.findBySessionId(sessionId);
                int total = all.size();
                int from = (safePage - 1) * safeSize;
                List<ConversationSummary> items;
                if (from >= total) {
                        items = List.of();
                } else {
                        int to = Math.min(from + safeSize, total);
                        items = all.subList(from, to).stream().map(this::toSummary).toList();
                }
                return new ConversationPage(items, total, safePage, safeSize);
        }

        /** 单个会话的完整执行轨迹（消息 / 调用 / 动作提案）。 */
        @GetMapping("/{id}")
        public ConversationLog detail(@PathVariable String id) {
                Conversation conversation = conversations.findById(id)
                                .orElseThrow(() -> new NoSuchElementException("会话不存在"));
                return toLog(conversation);
        }

        @GetMapping("/{id}/trace")
        public Trace trace(@PathVariable String id) {
                Conversation conversation = conversations.findById(id)
                                .orElseThrow(() -> new NoSuchElementException("会话不存在"));
                List<AgentInvocation> values = invocations.findByConversationIdOrderByCreatedAtAsc(id).stream()
                                .sorted(java.util.Comparator.comparing(AgentInvocation::getSequence,
                                                java.util.Comparator.nullsLast(Integer::compareTo)))
                                .toList();
                return new Trace(conversation.getId(), values);
        }

        private ConversationSummary toSummary(Conversation conversation) {
                return new ConversationSummary(
                                conversation.getId(),
                                conversation.getTitle(),
                                conversation.getCreatedAt(),
                                conversation.getUpdatedAt(),
                                messages.countByConversationId(conversation.getId()));
        }

        private ConversationLog toLog(Conversation conversation) {
                return new ConversationLog(
                                conversation,
                                messages.findByConversationIdOrderByCreatedAtAsc(conversation.getId()),
                                invocations.findByConversationIdOrderByCreatedAtAsc(conversation.getId()),
                                actions.findByConversationIdOrderByExpiresAtAsc(conversation.getId()));
        }

        public record Trace(String conversationId, List<AgentInvocation> invocations) {}

        public record ConversationSummary(
                        String id,
                        String title,
                        Instant createdAt,
                        Instant updatedAt,
                        long messageCount) {}

        public record ConversationPage(
                        List<ConversationSummary> items, int total, int page, int size) {}

        public record ConversationLog(
                        String id,
                        String title,
                        Instant createdAt,
                        Instant updatedAt,
                        List<Message> messages,
                        List<AgentInvocation> invocations,
                        List<ActionProposal> actions) {
                ConversationLog(
                                Conversation conversation,
                                List<Message> messages,
                                List<AgentInvocation> invocations,
                                List<ActionProposal> actions) {
                        this(
                                        conversation.getId(),
                                        conversation.getTitle(),
                                        conversation.getCreatedAt(),
                                        conversation.getUpdatedAt(),
                                        messages,
                                        invocations,
                                        actions);
                }
        }
}
