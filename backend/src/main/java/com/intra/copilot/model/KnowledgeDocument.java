package com.intra.copilot.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "knowledge_document")
public class KnowledgeDocument {
  @Id private String id = UUID.randomUUID().toString();
  private String knowledgeBaseId;
  private String filename;
  private String mediaType;
  private String status = "PENDING";
  @Lob private String content;
  @Lob private String error;
  private Instant createdAt = Instant.now();
  private Instant updatedAt = Instant.now();

  public String getId() { return id; }
  public String getKnowledgeBaseId() { return knowledgeBaseId; }
  public void setKnowledgeBaseId(String value) { knowledgeBaseId = value; }
  public String getFilename() { return filename; }
  public void setFilename(String value) { filename = value; }
  public String getMediaType() { return mediaType; }
  public void setMediaType(String value) { mediaType = value; }
  public String getStatus() { return status; }
  public void setStatus(String value) { status = value; }
  public String getContent() { return content; }
  public void setContent(String value) { content = value; }
  public String getError() { return error; }
  public void setError(String value) { error = value; }
  public Instant getCreatedAt() { return createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
  public void touch() { updatedAt = Instant.now(); }
}
