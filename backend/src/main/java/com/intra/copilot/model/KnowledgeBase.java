package com.intra.copilot.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "knowledge_base")
public class KnowledgeBase {
  @Id private String id = UUID.randomUUID().toString();
  private String name;
  @Lob private String description;
  private boolean enabled = true;
  private Instant createdAt = Instant.now();
  private Instant updatedAt = Instant.now();

  public KnowledgeBase() {}

  public String getId() { return id; }
  public void setId(String id) { this.id = id; }
  public String getName() { return name; }
  public void setName(String name) { this.name = name; }
  public String getDescription() { return description; }
  public void setDescription(String description) { this.description = description; }
  public boolean isEnabled() { return enabled; }
  public void setEnabled(boolean enabled) { this.enabled = enabled; }
  public Instant getCreatedAt() { return createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
  public void touch() { updatedAt = Instant.now(); }
}
