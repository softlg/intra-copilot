package com.intra.copilot.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "skill_definition")
public class SkillDefinition {
  @Id private String id = UUID.randomUUID().toString();
  private String name;
  @Lob private String description;
  @Lob private String prompt;
  @Lob private String toolIds = "[]";
  private String version = "1.0.0";
  private boolean enabled = true;
  private Instant createdAt = Instant.now();
  private Instant updatedAt = Instant.now();

  public String getId() { return id; }
  public void setId(String id) { this.id = id; }
  public String getName() { return name; }
  public void setName(String value) { name = value; }
  public String getDescription() { return description; }
  public void setDescription(String value) { description = value; }
  public String getPrompt() { return prompt; }
  public void setPrompt(String value) { prompt = value; }
  public String getToolIds() { return toolIds; }
  public void setToolIds(String value) { toolIds = value; }
  public String getVersion() { return version; }
  public void setVersion(String value) { version = value; }
  public boolean isEnabled() { return enabled; }
  public void setEnabled(boolean value) { enabled = value; }
  public Instant getCreatedAt() { return createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
  public void touch() { updatedAt = Instant.now(); }
}
