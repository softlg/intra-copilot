package com.intra.copilot.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
public class ActionProposal {
  @Id private String actionId = UUID.randomUUID().toString();
  private String conversationId;
  private String type;
  private String target;
  @Lob private String arguments;
  private String reason;
  private String risk;
  private Instant expiresAt;
  private String status = "PENDING";
  @Lob private String result;

  public String getActionId() {
    return actionId;
  }

  public String getConversationId() {
    return conversationId;
  }

  public void setConversationId(String v) {
    conversationId = v;
  }

  public String getType() {
    return type;
  }

  public void setType(String v) {
    type = v;
  }

  public String getTarget() {
    return target;
  }

  public void setTarget(String v) {
    target = v;
  }

  public String getArguments() {
    return arguments;
  }

  public void setArguments(String v) {
    arguments = v;
  }

  public String getReason() {
    return reason;
  }

  public void setReason(String v) {
    reason = v;
  }

  public String getRisk() {
    return risk;
  }

  public void setRisk(String v) {
    risk = v;
  }

  public Instant getExpiresAt() {
    return expiresAt;
  }

  public void setExpiresAt(Instant v) {
    expiresAt = v;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String v) {
    status = v;
  }

  public String getResult() {
    return result;
  }

  public void setResult(String v) {
    result = v;
  }
}
