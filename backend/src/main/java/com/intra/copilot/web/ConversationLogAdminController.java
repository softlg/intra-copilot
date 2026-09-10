package com.intra.copilot.web;

import com.intra.copilot.model.ActionProposal;
import com.intra.copilot.model.AgentInvocation;
import com.intra.copilot.model.AttachmentView;
import com.intra.copilot.model.Conversation;
import com.intra.copilot.repo.ActionProposalRepository;
import com.intra.copilot.repo.AgentInvocationRepository;
import com.intra.copilot.repo.ConversationRepository;
import com.intra.copilot.repo.MessageRepository;
import com.intra.copilot.service.AttachmentService;
import com.intra.copilot.service.TraceRecorder;
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
        private final AttachmentService attachments;
        private final TraceRecorder trace;

        public ConversationLogAdminController(
                        ConversationRepository conversations,
                        MessageRepository messages,
                        AgentInvocationRepository invocations,
                        ActionProposalRepository actions,
                        AttachmentService attachments,
                        TraceRecorder trace) {
                this.conversations = conversations;
                this.messages = messages;
                this.invocations = invocations;
                this.actions = actions;
                this.attachments = attachments;
                this.trace = trace;
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

        /** 单个会话的完整执行轨迹：消息 / 调用（含每个调用的事件明细）/ 动作提案。 */
        @GetMapping("/{id}")
        public ConversationLog detail(@PathVariable String id) {
                Conversation conversation = conversations.findById(id)
                                .orElseThrow(() -> new NoSuchElementException("会话不存在"));
                return toLog(conversation);
        }

        /** 完整调用链路：每次 invocation 附带其事件明细，按 sequence 排序还原执行流程。 */
        @GetMapping("/{id}/trace")
        public Trace trace(@PathVariable String id) {
                Conversation conversation = conversations.findById(id)
                                .orElseThrow(() -> new NoSuchElementException("会话不存在"));
                List<InvocationTrace> values = sortedInvocations(id).stream()
                                .map(item -> new InvocationTrace(
                                                item, trace.listByInvocation(item.getId())))
                                .toList();
                return new Trace(conversation.getId(), values);
        }

        /** 按调用 ID 查询单个 Agent 调用的事件明细。 */
        @GetMapping("/invocations/{invocationId}/events")
        public List<com.intra.copilot.model.AgentInvocationEvent> events(@PathVariable String invocationId) {
                invocations.findById(invocationId)
                                .orElseThrow(() -> new NoSuchElementException("调用记录不存在"));
                return trace.listByInvocation(invocationId);
        }

        /** 按关联 ID 查询跨父子 Agent 的完整事件流。 */
        @GetMapping("/invocations/by-correlation/{correlationId}")
        public List<com.intra.copilot.model.AgentInvocationEvent> eventsByCorrelation(
                        @PathVariable String correlationId) {
                return trace.listByCorrelation(correlationId);
        }

        private List<AgentInvocation> sortedInvocations(String conversationId) {
                return invocations.findByConversationIdOrderByCreatedAtAsc(conversationId).stream()
                                .sorted(java.util.Comparator.comparing(AgentInvocation::getSequence,
                                                java.util.Comparator.nullsLast(Integer::compareTo)))
                                .toList();
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
                List<ConversationMessage> messageViews =
                                messages.findByConversationIdOrderByCreatedAtAsc(conversation.getId()).stream()
                                                .map(
                                                                message -> new ConversationMessage(
                                                                                message.getId(),
                                                                                message.getConversationId(),
                                                                                message.getRole(),
                                                                                message.getContent(),
                                                                                message.getAgentId(),
                                                                                message.getContextSummary(),
                                                                                message.getCreatedAt(),
                                                                                attachments.listForMessage(message.getId()).stream()
                                                                                                .map(AttachmentMetadata::from)
                                                                                                .toList()))
                                                .toList();
                return new ConversationLog(
                                conversation,
                                messageViews,
                                invocations.findByConversationIdOrderByCreatedAtAsc(conversation.getId()),
                                actions.findByConversationIdOrderByExpiresAtAsc(conversation.getId()));
        }

        public record Trace(String conversationId, List<InvocationTrace> invocations) {}

        /** 单次 Agent 调用 + 其事件明细，用于在后台还原完整执行流程。 */
        public record InvocationTrace(
                        AgentInvocation invocation,
                        List<com.intra.copilot.model.AgentInvocationEvent> events) {}

        public record ConversationSummary(
                        String id,
                        String title,
                        Instant createdAt,
                        Instant updatedAt,
                        long messageCount) {}

        public record ConversationPage(
                        List<ConversationSummary> items, int total, int page, int size) {}

        /** 后台日志只展示附件元数据，不暴露可直接读取附件字节的公开入口。 */
        public record AttachmentMetadata(
                        String id, String filename, String contentType, long size, boolean isImage) {
                static AttachmentMetadata from(AttachmentView attachment) {
                        return new AttachmentMetadata(
                                        attachment.id(),
                                        attachment.filename(),
                                        attachment.contentType(),
                                        attachment.size(),
                                        attachment.isImage());
                }
        }

        public record ConversationMessage(
                        String id,
                        String conversationId,
                        String role,
                        String content,
                        String agentId,
                        String contextSummary,
                        Instant createdAt,
                        List<AttachmentMetadata> attachments) {}

        public record ConversationLog(
                        String id,
                        String title,
                        Instant createdAt,
                        Instant updatedAt,
                        List<ConversationMessage> messages,
                        List<AgentInvocation> invocations,
                        List<ActionProposal> actions) {
                ConversationLog(
                                Conversation conversation,
                                List<ConversationMessage> messages,
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
