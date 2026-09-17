package com.intra.copilot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.intra.copilot.model.AgentInvocationEvent;
import com.intra.copilot.repo.AgentInvocationEventRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.stereotype.Service;

/**
 * 记录 Agent 调用链路中的关键事件，用于管理后台还原完整执行流程。
 *
 * <p>每个 invocation 的事件按 sequence 排序， correlationId 用于串联父子 invocation。
 */
@Service
public class TraceRecorder {
    private final AgentInvocationEventRepository events;
    private final ObjectMapper json;
    private final MeterRegistry meterRegistry;
    private final Map<String, AtomicInteger> sequences = new ConcurrentHashMap<>();

    public TraceRecorder(
            AgentInvocationEventRepository events, ObjectMapper json, MeterRegistry meterRegistry) {
        this.events = events;
        this.json = json;
        this.meterRegistry = meterRegistry;
    }

    public EventBuilder event(String invocationId, String correlationId, String eventType) {
        return new EventBuilder(this, invocationId, correlationId, eventType);
    }

    public List<AgentInvocationEvent> listByInvocation(String invocationId) {
        return events.findByInvocationIdOrderBySequenceAsc(invocationId);
    }

    public List<AgentInvocationEvent> listByCorrelation(String correlationId) {
        return events.findByCorrelationIdOrderByCreatedAtAsc(correlationId);
    }

    public List<AgentInvocationEvent> listByTrace(String traceId) {
        return events.findByTraceIdOrderBySequenceGlobalAsc(traceId);
    }

    private int nextSequence(String invocationId) {
        return sequences
                .computeIfAbsent(
                        invocationId,
                        key -> new AtomicInteger(Math.max(0, events.nextSequence(key) - 1)))
                .incrementAndGet();
    }

    private AgentInvocationEvent persist(AgentInvocationEvent event) {
        TraceContext.Values context = TraceContext.current();
        if (context != null) {
            if (event.getTraceId() == null) event.setTraceId(context.traceId());
            if (event.getTurnId() == null) event.setTurnId(context.turnId());
            if (event.getAttemptNo() == null) event.setAttemptNo(context.attemptNo());
        }
        if (event.getSpanId() == null) {
            event.setSpanId(event.getInvocationId());
        }
        if (event.getSequence() == null) {
            event.setSequence(nextSequence(event.getInvocationId()));
        }
        if (event.getSequenceGlobal() == null && event.getTraceId() != null) {
            event.setSequenceGlobal(events.nextGlobalSequence(event.getTraceId()));
        }
        if (event.getCreatedAt() == null) {
            event.setCreatedAt(Instant.now());
        }
        if (event.getPayload() != null) {
            event.setPayload(SensitiveDataRedactor.redact(event.getPayload()));
        }
        try {
            events.save(event);
            recordMetrics(event);
        } catch (RuntimeException error) {
            // Tracing is observability infrastructure and must not become a chat failure mode.
            org.slf4j.LoggerFactory.getLogger(TraceRecorder.class)
                    .error(
                            "Failed to persist trace event type={} invocation={} trace={}",
                            event.getEventType(),
                            event.getInvocationId(),
                            event.getTraceId(),
                            error);
        }
        return event;
    }

    private void recordMetrics(AgentInvocationEvent event) {
        if (meterRegistry == null) {
            return;
        }
        String type = event.getEventType() == null ? "UNKNOWN" : event.getEventType();
        String status = event.getStatus() == null ? "UNKNOWN" : event.getStatus();
        Counter.builder("intra.copilot.trace.events")
                .description("Persisted agent trace events")
                .tag("type", type)
                .tag("status", status)
                .register(meterRegistry)
                .increment();
        if (event.getDurationMs() != null && event.getDurationMs() >= 0) {
            Timer.builder("intra.copilot.trace.event.duration")
                    .description("Duration attached to an agent trace event")
                    .tag("type", type)
                    .publishPercentiles(0.5, 0.95, 0.99)
                    .register(meterRegistry)
                    .record(event.getDurationMs(), java.util.concurrent.TimeUnit.MILLISECONDS);
        }
        if (event.getPayload() != null && event.getPayload().isObject()) {
            JsonNode inputTokens = event.getPayload().path("inputTokens");
            JsonNode outputTokens = event.getPayload().path("outputTokens");
            if (inputTokens.isNumber() || outputTokens.isNumber()) {
                double total =
                        (inputTokens.isNumber() ? inputTokens.asDouble() : 0)
                                + (outputTokens.isNumber() ? outputTokens.asDouble() : 0);
                Counter.builder("intra.copilot.trace.tokens")
                        .description("Token usage observed in trace events")
                        .tag("type", type)
                        .register(meterRegistry)
                        .increment(total);
            }
        }
    }

    public static class EventBuilder {
        private final TraceRecorder recorder;
        private final AgentInvocationEvent event;
        private final ObjectNode payload;

        EventBuilder(
                TraceRecorder recorder,
                String invocationId,
                String correlationId,
                String eventType) {
            this.recorder = recorder;
            this.event = new AgentInvocationEvent();
            this.event.setInvocationId(invocationId);
            this.event.setCorrelationId(correlationId);
            this.event.setEventType(eventType);
            this.payload = recorder.json.createObjectNode();
        }

        public EventBuilder name(String name) {
            event.setEventName(name);
            return this;
        }

        public EventBuilder status(String status) {
            event.setStatus(status);
            return this;
        }

        public EventBuilder duration(long durationMs) {
            event.setDurationMs(durationMs);
            return this;
        }

        public EventBuilder plan(String planId, String planStepId) {
            event.setPlanId(planId);
            event.setPlanStepId(planStepId);
            return this;
        }

        public EventBuilder span(String spanId) {
            event.setSpanId(spanId);
            return this;
        }

        public EventBuilder parentEvent(String parentEventId) {
            event.setParentEventId(parentEventId);
            return this;
        }

        public EventBuilder causedBy(String causationEventId) {
            event.setCausationEventId(causationEventId);
            return this;
        }

        public EventBuilder put(String key, Object value) {
            payload.set(key, recorder.json.valueToTree(value));
            return this;
        }

        public EventBuilder put(String key, JsonNode value) {
            payload.set(key, value);
            return this;
        }

        public EventBuilder remove(String key) {
            payload.remove(key);
            return this;
        }

        public AgentInvocationEvent save() {
            event.setPayload(payload);
            return recorder.persist(event);
        }

        public AgentInvocationEvent save(JsonNode customPayload) {
            event.setPayload(customPayload);
            return recorder.persist(event);
        }
    }

    /** 预定义的事件类型常量。 */
    public static final class Type {
        public static final String ROUTE_START = "ROUTE_START";
        public static final String ROUTE_END = "ROUTE_END";
        public static final String AGENT_START = "AGENT_START";
        public static final String AGENT_END = "AGENT_END";
        public static final String DELEGATION_DECIDED = "DELEGATION_DECIDED";
        public static final String CONTEXT_FORWARDED = "CONTEXT_FORWARDED";
        public static final String PLAN_DECISION = "PLAN_DECISION";
        public static final String PLAN_CREATED = "PLAN_CREATED";
        public static final String PLAN_REVISED = "PLAN_REVISED";
        public static final String PLAN_STEP_STARTED = "PLAN_STEP_STARTED";
        public static final String PLAN_STEP_COMPLETED = "PLAN_STEP_COMPLETED";
        public static final String PLAN_STEP_FAILED = "PLAN_STEP_FAILED";
        public static final String PLAN_COMPLETED = "PLAN_COMPLETED";
        public static final String PLAN_FAILED = "PLAN_FAILED";
        public static final String PLAN_CANCELLED = "PLAN_CANCELLED";
        public static final String HOOK_CHECK = "HOOK_CHECK";
        public static final String RAG_RETRIEVE = "RAG_RETRIEVE";
        // 预留类型：当前 tool_ids / skill_ids 仅作为 Agent 配置项存在，ChatService 的执行链路
        // 尚未真正调用 Tool 或 Skill（ToolDefinition / SkillDefinition 只有后台 CRUD）。
        // 待 Tool 执行链路打通后，用这两种类型记录调用入参、耗时与返回。
        public static final String TOOL_CALL = "TOOL_CALL";
        public static final String TOOL_RESULT = "TOOL_RESULT";
        public static final String SKILL_CALL = "SKILL_CALL";
        public static final String SKILL_RESULT = "SKILL_RESULT";
        public static final String LLM_REQUEST = "LLM_REQUEST";
        public static final String LLM_RESPONSE = "LLM_RESPONSE";
        public static final String TOKEN_STREAM = "TOKEN_STREAM";
        public static final String ACTION_PROPOSED = "ACTION_PROPOSED";
        public static final String ACTION_RESOLVED = "ACTION_RESOLVED";
        public static final String CHILD_RETURN = "CHILD_RETURN";
        public static final String ERROR = "ERROR";
        public static final String COMPLETED = "COMPLETED";
        public static final String REJECTED = "REJECTED";
        public static final String FAILED = "FAILED";

        private Type() {}
    }
}
