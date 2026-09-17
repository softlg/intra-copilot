package com.intra.copilot.web;

import com.intra.copilot.model.ActionProposal;
import com.intra.copilot.model.AgentInvocation;
import com.intra.copilot.model.AgentInvocationEvent;
import com.intra.copilot.model.AgentPlan;
import com.intra.copilot.model.AgentPlanStep;
import com.intra.copilot.model.AttachmentView;
import com.intra.copilot.model.Conversation;
import com.intra.copilot.repo.ActionProposalRepository;
import com.intra.copilot.repo.AgentInvocationRepository;
import com.intra.copilot.repo.AgentPlanRepository;
import com.intra.copilot.repo.AgentPlanStepRepository;
import com.intra.copilot.repo.ConversationRepository;
import com.intra.copilot.repo.MessageRepository;
import com.intra.copilot.service.AttachmentService;
import com.intra.copilot.service.TraceRecorder;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
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
        private final AgentPlanRepository plans;
        private final AgentPlanStepRepository planSteps;
        private final AttachmentService attachments;
        private final TraceRecorder trace;
        private final ObjectMapper json;

        public ConversationLogAdminController(
                        ConversationRepository conversations,
                        MessageRepository messages,
                        AgentInvocationRepository invocations,
                        ActionProposalRepository actions,
                        AgentPlanRepository plans,
                        AgentPlanStepRepository planSteps,
                        AttachmentService attachments,
                        TraceRecorder trace,
                        ObjectMapper json) {
                this.conversations = conversations;
                this.messages = messages;
                this.invocations = invocations;
                this.actions = actions;
                this.plans = plans;
                this.planSteps = planSteps;
                this.attachments = attachments;
                this.trace = trace;
                this.json = json;
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
                List<AgentInvocation> invocationValues = sortedInvocations(id);
                List<InvocationTrace> values = invocationValues.stream()
                                .map(item -> new InvocationTrace(
                                                item, trace.listByInvocation(item.getId())))
                                .toList();
                List<TraceTree> trees = buildTraceTrees(values);
                return new Trace(
                                conversation.getId(),
                                values,
                                trees,
                                globalEvents(values),
                                totalDuration(trees),
                                loadPlans(conversation.getId()));
        }

        /** 后台日志图片取回入口，避免依赖需要 JWT 的插件附件接口。 */
        @GetMapping("/attachments/{attachmentId}")
        public ResponseEntity<ByteArrayResource> attachment(@PathVariable String attachmentId)
                        throws Exception {
                AttachmentService.StoredBytes stored = attachments.serve(attachmentId);
                byte[] bytes = stored.bytes();
                String contentType = stored.contentType() == null
                                ? "application/octet-stream"
                                : stored.contentType();
                String filename = stored.filename().replace("\"", "");
                return ResponseEntity.ok()
                                .header(HttpHeaders.CONTENT_TYPE, contentType)
                                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + filename + "\"")
                                .contentLength(bytes.length)
                                .body(new ByteArrayResource(bytes));
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
                List<AgentInvocation> invocationViews = sortedInvocations(conversation.getId());
                List<InvocationTrace> invocationTraces = invocationViews.stream()
                                .map(item -> new InvocationTrace(item, trace.listByInvocation(item.getId())))
                                .toList();
                List<TraceTree> trees = buildTraceTrees(invocationTraces);
                return new ConversationLog(
                                conversation,
                                messageViews,
                                invocationViews,
                                invocationTraces,
                                trees,
                                globalEvents(invocationTraces),
                                totalDuration(trees),
                                loadPlans(conversation.getId()),
                                actions.findByConversationIdOrderByExpiresAtAsc(conversation.getId()));
        }

        private List<TraceTree> buildTraceTrees(List<InvocationTrace> traces) {
                Map<String, InvocationTrace> byId = new LinkedHashMap<>();
                traces.stream()
                        .sorted(
                                Comparator.comparing(
                                                (InvocationTrace value) ->
                                                        value.invocation().getSequence(),
                                                Comparator.nullsLast(Integer::compareTo))
                                        .thenComparing(
                                                value ->
                                                        value.invocation().getCreatedAt(),
                                                Comparator.nullsLast(Instant::compareTo)))
                        .forEach(value -> byId.put(value.invocation().getId(), value));
                Map<String, List<InvocationTrace>> children = new LinkedHashMap<>();
                List<InvocationTrace> roots = new ArrayList<>();
                for (InvocationTrace value : byId.values()) {
                        String parentId = value.invocation().getParentInvocationId();
                        if (parentId == null || parentId.isBlank() || !byId.containsKey(parentId)) {
                                roots.add(value);
                        } else {
                                children.computeIfAbsent(parentId, ignored -> new ArrayList<>()).add(value);
                        }
                }

                Map<String, List<InvocationTrace>> grouped = new LinkedHashMap<>();
                for (InvocationTrace root : roots) {
                        grouped.computeIfAbsent(traceKey(root.invocation()), ignored -> new ArrayList<>())
                                .add(root);
                }
                return grouped.entrySet().stream()
                        .map(entry -> toTraceTree(entry.getKey(), entry.getValue(), children))
                        .toList();
        }

        private TraceTree toTraceTree(
                String traceId,
                List<InvocationTrace> roots,
                Map<String, List<InvocationTrace>> children) {
                List<InvocationNode> nodes = roots.stream()
                        .map(value -> toInvocationNode(value, children))
                        .toList();
                List<AgentInvocationEvent> events = globalEvents(flattenInvocationTraces(roots, children));
                List<AgentInvocation> invocations =
                        flattenInvocations(roots, children);
                AgentInvocation first =
                        invocations.stream()
                                .min(
                                        Comparator.comparing(
                                                AgentInvocation::getStartedAt,
                                                Comparator.nullsLast(Instant::compareTo)))
                                .orElse(null);
                AgentInvocation last =
                        invocations.stream()
                                .max(
                                        Comparator.comparing(
                                                AgentInvocation::getCompletedAt,
                                                Comparator.nullsLast(Instant::compareTo)))
                                .orElse(first);
                long durationMs =
                        nodes.stream()
                                .mapToLong(InvocationNode::durationMs)
                                .max()
                                .orElseGet(
                                        () ->
                                                first == null || first.getDurationMs() == null
                                                        ? 0L
                                                        : first.getDurationMs());
                return new TraceTree(
                                traceId,
                                first == null ? null : first.getTurnId(),
                                first == null ? null : first.getAttemptNo(),
                                first == null ? null : first.getRequestId(),
                                treeStatus(invocations),
                                first == null ? null : first.getStartedAt(),
                                last == null ? null : last.getCompletedAt(),
                                durationMs,
                                invocations.size(),
                                events.size(),
                                first == null ? null : first.getInputTokens(),
                                first == null ? null : first.getOutputTokens(),
                                nodes,
                                planDecisions(events));
        }

        private InvocationNode toInvocationNode(
                InvocationTrace value, Map<String, List<InvocationTrace>> children) {
                AgentInvocation invocation = value.invocation();
                List<InvocationNode> childNodes =
                        children.getOrDefault(invocation.getId(), List.of()).stream()
                                .map(child -> toInvocationNode(child, children))
                                .toList();
                return new InvocationNode(
                                invocation,
                                value.events(),
                                childNodes,
                                invocationDuration(invocation),
                                invocation.getInputTokens(),
                                invocation.getOutputTokens());
        }

        private List<InvocationTrace> flattenInvocationTraces(
                List<InvocationTrace> roots,
                Map<String, List<InvocationTrace>> children) {
                List<InvocationTrace> values = new ArrayList<>();
                for (InvocationTrace root : roots) {
                        values.add(root);
                        values.addAll(
                                flattenInvocationTraces(
                                        children.getOrDefault(root.invocation().getId(), List.of()),
                                        children));
                }
                return values;
        }

        private List<AgentInvocation> flattenInvocations(
                List<InvocationTrace> roots,
                Map<String, List<InvocationTrace>> children) {
                return flattenInvocationTraces(roots, children).stream()
                        .map(InvocationTrace::invocation)
                        .toList();
        }

        private List<AgentInvocationEvent> globalEvents(List<InvocationTrace> traces) {
                return traces.stream()
                        .flatMap(value -> value.events().stream())
                        .distinct()
                        .sorted(
                                Comparator.comparing(
                                                AgentInvocationEvent::getSequenceGlobal,
                                                Comparator.nullsLast(Long::compareTo))
                                        .thenComparing(
                                                AgentInvocationEvent::getCreatedAt,
                                                Comparator.nullsLast(Instant::compareTo)))
                        .toList();
        }

        private List<PlanDecisionView> planDecisions(List<AgentInvocationEvent> events) {
                return events.stream()
                        .filter(event -> "PLAN_DECISION".equals(event.getEventType()))
                        .map(
                                event ->
                                        new PlanDecisionView(
                                                event.getId(),
                                                event.getStatus(),
                                                event.getEventName(),
                                                event.getDurationMs(),
                                                event.getCreatedAt(),
                                                stringValue(event, "mode"),
                                                stringValue(event, "reason"),
                                                booleanValue(event, "required"),
                                                booleanValue(event, "repaired"),
                                                integerValue(event, "inputTokens"),
                                                integerValue(event, "outputTokens")))
                        .toList();
        }

        private String stringValue(AgentInvocationEvent event, String key) {
                if (event.getPayload() == null || !event.getPayload().isObject()) return null;
                var value = event.getPayload().path(key);
                return value.isMissingNode() || value.isNull() ? null : value.asText();
        }

        private Boolean booleanValue(AgentInvocationEvent event, String key) {
                if (event.getPayload() == null || !event.getPayload().isObject()) return null;
                var value = event.getPayload().path(key);
                return value.isBoolean() ? value.asBoolean() : null;
        }

        private Integer integerValue(AgentInvocationEvent event, String key) {
                if (event.getPayload() == null || !event.getPayload().isObject()) return null;
                var value = event.getPayload().path(key);
                return value.isNumber() ? value.asInt() : null;
        }

        private long totalDuration(List<TraceTree> traces) {
                Map<String, Long> perTurn = new LinkedHashMap<>();
                for (TraceTree value : traces) {
                        String key =
                                value.turnId() == null || value.turnId().isBlank()
                                        ? value.traceId()
                                        : value.turnId();
                        perTurn.merge(key, value.durationMs(), Math::max);
                }
                return perTurn.values().stream().mapToLong(Long::longValue).sum();
        }

        private static String traceKey(AgentInvocation invocation) {
                if (invocation == null) return "unknown";
                if (invocation.getTraceId() != null && !invocation.getTraceId().isBlank()) {
                        return invocation.getTraceId();
                }
                if (invocation.getCorrelationId() != null
                        && !invocation.getCorrelationId().isBlank()) {
                        return invocation.getCorrelationId();
                }
                return invocation.getId();
        }

        private static long invocationDuration(AgentInvocation invocation) {
                if (invocation.getStartedAt() != null && invocation.getCompletedAt() != null) {
                        return Math.max(
                                0L,
                                Duration.between(
                                                invocation.getStartedAt(),
                                                invocation.getCompletedAt())
                                        .toMillis());
                }
                return invocation.getDurationMs() == null ? 0L : invocation.getDurationMs();
        }

        private static String treeStatus(List<AgentInvocation> invocations) {
                if (invocations.isEmpty()) return "UNKNOWN";
                if (invocations.stream().anyMatch(value -> "FAILED".equals(value.getStatus()))) {
                        return "FAILED";
                }
                if (invocations.stream().anyMatch(value -> "REJECTED".equals(value.getStatus()))) {
                        return "REJECTED";
                }
                if (invocations.stream().anyMatch(value -> "RUNNING".equals(value.getStatus()))) {
                        return "RUNNING";
                }
                return invocations.stream()
                        .map(AgentInvocation::getStatus)
                        .filter(Objects::nonNull)
                        .findFirst()
                        .orElse("UNKNOWN");
        }

        private List<PlanTrace> loadPlans(String conversationId) {
                return plans.findByConversationIdOrderByCreatedAtAsc(conversationId).stream()
                                .map(plan -> new PlanTrace(
                                                plan,
                                                planSteps.findByPlanIdOrderByStepIndexAsc(plan.getId()).stream()
                                                        .map(this::toPlanStepView)
                                                        .toList()))
                                .toList();
        }

        private PlanStepView toPlanStepView(AgentPlanStep step) {
                return new PlanStepView(
                                step.getId(),
                                step.getStepIndex(),
                                step.getTitle(),
                                step.getDescription(),
                                step.getAgentId(),
                                readStringList(step.getToolNames()),
                                readStringList(step.getDependsOn()),
                                step.getSuccessCriteria(),
                                step.getStatus(),
                                step.getResultSummary(),
                                step.getError(),
                                step.getStartedAt(),
                                step.getCompletedAt(),
                                step.getDurationMs());
        }

        private List<String> readStringList(String raw) {
                if (raw == null || raw.isBlank()) return List.of();
                try {
                        return json.readValue(raw, new TypeReference<List<String>>() {});
                } catch (Exception ignored) {
                        return List.of();
                }
        }

        public record Trace(
                        String conversationId,
                        List<InvocationTrace> invocations,
                        List<TraceTree> traces,
                        List<AgentInvocationEvent> events,
                        long totalDurationMs,
                        List<PlanTrace> plans) {}

        /** One chat attempt, retaining the parent-child Agent tree and its global event stream. */
        public record TraceTree(
                        String traceId,
                        String turnId,
                        Integer attemptNo,
                        String requestId,
                        String status,
                        Instant startedAt,
                        Instant completedAt,
                        long durationMs,
                        int agentCount,
                        int eventCount,
                        Integer inputTokens,
                        Integer outputTokens,
                        List<InvocationNode> roots,
                        List<PlanDecisionView> planDecisions) {}

        public record InvocationNode(
                        AgentInvocation invocation,
                        List<AgentInvocationEvent> events,
                        List<InvocationNode> children,
                        long durationMs,
                        Integer inputTokens,
                        Integer outputTokens) {}

        public record PlanDecisionView(
                        String eventId,
                        String status,
                        String name,
                        Long durationMs,
                        Instant createdAt,
                        String mode,
                        String reason,
                        Boolean required,
                        Boolean repaired,
                        Integer inputTokens,
                        Integer outputTokens) {}

        /** A persisted plan plus its ordered steps. */
        public record PlanTrace(AgentPlan plan, List<PlanStepView> steps) {}

        public record PlanStepView(
                        String id,
                        int stepIndex,
                        String title,
                        String description,
                        String agentId,
                        List<String> toolNames,
                        List<String> dependsOn,
                        String successCriteria,
                        String status,
                        String resultSummary,
                        String error,
                        Instant startedAt,
                        Instant completedAt,
                        Long durationMs) {}

        /** 单次 Agent 调用 + 其事件明细，用于在后台还原完整执行流程。 */
        public record InvocationTrace(
                        AgentInvocation invocation,
                        List<AgentInvocationEvent> events) {}

        public record ConversationSummary(
                        String id,
                        String title,
                        Instant createdAt,
                        Instant updatedAt,
                        long messageCount) {}

        public record ConversationPage(
                        List<ConversationSummary> items, int total, int page, int size) {}

        /** 后台日志附件元数据及仅供管理端使用的读取地址。 */
        public record AttachmentMetadata(
                        String id, String filename, String contentType, long size, boolean isImage, String url) {
                static AttachmentMetadata from(AttachmentView attachment) {
                        return new AttachmentMetadata(
                                        attachment.id(),
                                        attachment.filename(),
                                        attachment.contentType(),
                                        attachment.size(),
                                        attachment.isImage(),
                                        "/admin/conversation-logs/attachments/" + attachment.id());
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
                        List<InvocationTrace> invocationTraces,
                        List<TraceTree> traces,
                        List<AgentInvocationEvent> events,
                        long totalDurationMs,
                        List<PlanTrace> plans,
                        List<ActionProposal> actions) {
                ConversationLog(
                                Conversation conversation,
                                List<ConversationMessage> messages,
                                List<AgentInvocation> invocations,
                                List<InvocationTrace> invocationTraces,
                                List<TraceTree> traces,
                                List<AgentInvocationEvent> events,
                                long totalDurationMs,
                                List<PlanTrace> plans,
                                List<ActionProposal> actions) {
                        this(
                                        conversation.getId(),
                                        conversation.getTitle(),
                                        conversation.getCreatedAt(),
                                        conversation.getUpdatedAt(),
                                        messages,
                                        invocations,
                                        invocationTraces,
                                        traces,
                                        events,
                                        totalDurationMs,
                                        plans,
                                        actions);
                }
        }
}
