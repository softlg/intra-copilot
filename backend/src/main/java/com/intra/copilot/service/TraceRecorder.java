package com.intra.copilot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.intra.copilot.model.AgentInvocationEvent;
import com.intra.copilot.repo.AgentInvocationEventRepository;
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
  private final Map<String, AtomicInteger> sequences = new ConcurrentHashMap<>();

  public TraceRecorder(AgentInvocationEventRepository events, ObjectMapper json) {
    this.events = events;
    this.json = json;
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

  private int nextSequence(String invocationId) {
    return sequences
        .computeIfAbsent(invocationId, key -> new AtomicInteger(0))
        .incrementAndGet();
  }

  private AgentInvocationEvent persist(AgentInvocationEvent event) {
    if (event.getSequence() == null) {
      event.setSequence(nextSequence(event.getInvocationId()));
    }
    if (event.getCreatedAt() == null) {
      event.setCreatedAt(Instant.now());
    }
    events.save(event);
    return event;
  }

  public static class EventBuilder {
    private final TraceRecorder recorder;
    private final AgentInvocationEvent event;
    private final ObjectNode payload;

    EventBuilder(TraceRecorder recorder, String invocationId, String correlationId, String eventType) {
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
    public static final String DELEGATION_DECIDED = "DELEGATION_DECIDED";
    public static final String CONTEXT_FORWARDED = "CONTEXT_FORWARDED";
    public static final String HOOK_CHECK = "HOOK_CHECK";
    public static final String RAG_RETRIEVE = "RAG_RETRIEVE";
    // 预留类型：当前 tool_ids / skill_ids 仅作为 Agent 配置项存在，ChatService 的执行链路
    // 尚未真正调用工具或 Skill（ToolDefinition / SkillDefinition 只有后台 CRUD）。
    // 待工具执行链路打通后，用这两种类型记录调用入参、耗时与返回。
    public static final String TOOL_CALL = "TOOL_CALL";
    public static final String TOOL_RESULT = "TOOL_RESULT";
    public static final String SKILL_CALL = "SKILL_CALL";
    public static final String SKILL_RESULT = "SKILL_RESULT";
    public static final String LLM_REQUEST = "LLM_REQUEST";
    public static final String LLM_RESPONSE = "LLM_RESPONSE";
    public static final String TOKEN_STREAM = "TOKEN_STREAM";
    public static final String ACTION_PROPOSED = "ACTION_PROPOSED";
    public static final String ACTION_RESOLVED = "ACTION_RESOLVED";
    public static final String ERROR = "ERROR";
    public static final String COMPLETED = "COMPLETED";
    public static final String REJECTED = "REJECTED";
    public static final String FAILED = "FAILED";

    private Type() {}
  }
}
