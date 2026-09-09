package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.JsonNode;
import com.intra.copilot.persistence.PostgresJsonNodeTypeHandler;
import java.time.Instant;
import java.util.UUID;
import org.apache.ibatis.type.JdbcType;

/** Agent 执行链路中的一个事件节点，用于在管理后台还原完整交互流程。 */
@TableName(value = "agent_invocation_event", autoResultMap = true)
public class AgentInvocationEvent {
  @TableId private String id = UUID.randomUUID().toString();
  private String invocationId;
  private String correlationId;
  private String eventType;
  private String eventName;
  private String status;

  @TableField(typeHandler = PostgresJsonNodeTypeHandler.class, jdbcType = JdbcType.OTHER)
  private JsonNode payload;

  private Long durationMs;
  private Integer sequence;
  private Instant createdAt = Instant.now();

  public String getId() {
    return id;
  }

  public String getInvocationId() {
    return invocationId;
  }

  public void setInvocationId(String invocationId) {
    this.invocationId = invocationId;
  }

  public String getCorrelationId() {
    return correlationId;
  }

  public void setCorrelationId(String correlationId) {
    this.correlationId = correlationId;
  }

  public String getEventType() {
    return eventType;
  }

  public void setEventType(String eventType) {
    this.eventType = eventType;
  }

  public String getEventName() {
    return eventName;
  }

  public void setEventName(String eventName) {
    this.eventName = eventName;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public JsonNode getPayload() {
    return payload;
  }

  public void setPayload(JsonNode payload) {
    this.payload = payload;
  }

  public Long getDurationMs() {
    return durationMs;
  }

  public void setDurationMs(Long durationMs) {
    this.durationMs = durationMs;
  }

  public Integer getSequence() {
    return sequence;
  }

  public void setSequence(Integer sequence) {
    this.sequence = sequence;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(Instant createdAt) {
    this.createdAt = createdAt;
  }
}
