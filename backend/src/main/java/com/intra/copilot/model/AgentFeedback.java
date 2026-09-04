package com.intra.copilot.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "agent_feedback")
public class AgentFeedback {
  @Id private String id = UUID.randomUUID().toString();
  private String sessionId;
  private String messageId;
  private Integer messageIndex;
  private String agentId;
  private String rating;
  @Column(columnDefinition = "TEXT") private String comment;
  private Instant createdAt = Instant.now();
  public String getId() { return id; }
  public String getSessionId() { return sessionId; }
  public void setSessionId(String v) { sessionId = v; }
  public String getMessageId() { return messageId; }
  public void setMessageId(String v) { messageId = v; }
  public Integer getMessageIndex() { return messageIndex; }
  public void setMessageIndex(Integer v) { messageIndex = v; }
  public String getAgentId() { return agentId; }
  public void setAgentId(String v) { agentId = v; }
  public String getRating() { return rating; }
  public void setRating(String v) { rating = v; }
  public String getComment() { return comment; }
  public void setComment(String v) { comment = v; }
  public Instant getCreatedAt() { return createdAt; }
}
