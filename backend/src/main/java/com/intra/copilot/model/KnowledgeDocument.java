package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;
import java.util.UUID;

@TableName("knowledge_document")
public class KnowledgeDocument {
  @TableId private String id = UUID.randomUUID().toString();
  private String knowledgeBaseId;
  private String filename;
  private String mediaType;
  private String status = "PENDING";
  private String content;
  private String error;
  private String fileHash;
  private Long sizeBytes;
  private Instant createdAt = Instant.now();
  private Instant updatedAt = Instant.now();

  public String getId() {
    return id;
  }

  public String getKnowledgeBaseId() {
    return knowledgeBaseId;
  }

  public void setKnowledgeBaseId(String value) {
    knowledgeBaseId = value;
  }

  public String getFilename() {
    return filename;
  }

  public void setFilename(String value) {
    filename = value;
  }

  public String getMediaType() {
    return mediaType;
  }

  public void setMediaType(String value) {
    mediaType = value;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String value) {
    status = value;
  }

  public String getContent() {
    return content;
  }

  public void setContent(String value) {
    content = value;
  }

  public String getError() {
    return error;
  }

  public void setError(String value) {
    error = value;
  }

  public String getFileHash() {
    return fileHash;
  }

  public void setFileHash(String value) {
    fileHash = value;
  }

  public Long getSizeBytes() {
    return sizeBytes;
  }

  public void setSizeBytes(Long value) {
    sizeBytes = value;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  public void touch() {
    updatedAt = Instant.now();
  }
}
