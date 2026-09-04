package com.intra.copilot.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "agent_invocation")
public class AgentInvocation {
  @Id private String id = UUID.randomUUID().toString();
  private String conversationId;
  private String requestedAgentId;
  private String selectedAgentId;
  @Column(columnDefinition = "TEXT") private String routeReason;
  @Column(columnDefinition = "TEXT") private String intent;
  @Column(columnDefinition = "TEXT") private String contextSent;
  @Column(columnDefinition = "TEXT") private String responseContent;
  private String clientIp;
  private Double confidence;
  private String routeSource;
  private Long durationMs;
  @Column(columnDefinition = "TEXT") private String error;
  private Integer inputTokens;
  private Integer outputTokens;
  private Instant createdAt = Instant.now();

  public String getId() {
    return id;
  }

  public String getConversationId() {
    return conversationId;
  }

  public void setConversationId(String value) {
    conversationId = value;
  }

  public String getRequestedAgentId() {
    return requestedAgentId;
  }

  public void setRequestedAgentId(String value) {
    requestedAgentId = value;
  }

  public String getSelectedAgentId() {
    return selectedAgentId;
  }

  public void setSelectedAgentId(String value) {
    selectedAgentId = value;
  }

  public String getRouteReason() {
    return routeReason;
  }

  public void setRouteReason(String value) {
    routeReason = value;
  }

  public String getIntent() { return intent; }
  public void setIntent(String value) { intent = value; }
  public String getContextSent() { return contextSent; }
  public void setContextSent(String value) { contextSent = value; }
  public String getResponseContent() { return responseContent; }
  public void setResponseContent(String value) { responseContent = value; }
  public String getClientIp() { return clientIp; }
  public void setClientIp(String value) { clientIp = value; }

  public Double getConfidence() {
    return confidence;
  }

  public void setConfidence(Double value) {
    confidence = value;
  }

  public String getRouteSource() {
    return routeSource;
  }

  public void setRouteSource(String value) {
    routeSource = value;
  }

  public Long getDurationMs() {
    return durationMs;
  }

  public void setDurationMs(Long value) {
    durationMs = value;
  }

  public String getError() {
    return error;
  }

  public void setError(String value) {
    error = value;
  }

  public Integer getInputTokens() {
    return inputTokens;
  }

  public void setInputTokens(Integer value) {
    inputTokens = value;
  }

  public Integer getOutputTokens() {
    return outputTokens;
  }

  public void setOutputTokens(Integer value) {
    outputTokens = value;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
