package com.intra.copilot.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
public class Message {
  @Id private String id = UUID.randomUUID().toString();
  private String conversationId;
  private String role;
  @Lob private String content;
  private String agentId;
  @Lob private String contextSummary;
  private Instant createdAt = Instant.now();
  public Message() {}
  public Message(String c,String r,String content,String a,String ctx){conversationId=c;role=r;this.content=content;agentId=a;contextSummary=ctx;}
  public String getId(){return id;} public String getConversationId(){return conversationId;} public String getRole(){return role;} public String getContent(){return content;} public String getAgentId(){return agentId;} public String getContextSummary(){return contextSummary;} public Instant getCreatedAt(){return createdAt;}
}
