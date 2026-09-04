package com.intra.copilot.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "agent_definition")
public class AgentDefinition {
  @Id private String id;
  private String displayName;
  @Column(columnDefinition = "TEXT") private String description;
  @Column(columnDefinition = "TEXT") private String systemPrompt;
  private boolean enabled = true;
  /** True for agents shipped by the application and protected from deletion. */
  private boolean systemAgent;
  private boolean supportsBrowserActions;
  private int priority = 100;
  @Column(columnDefinition = "TEXT") private String routingRules;
  private String model;
  private Double temperature;
  @Column(columnDefinition = "TEXT") private String knowledgeBaseIds = "[]";
  @Column(columnDefinition = "TEXT") private String toolIds = "[]";
  @Column(columnDefinition = "TEXT") private String skillIds = "[]";
  private long version = 1;
  private Instant createdAt = Instant.now();
  private Instant updatedAt = Instant.now();

  public AgentDefinition() {}

  public AgentDefinition(
      String id,
      String displayName,
      String description,
      String systemPrompt,
      boolean supportsBrowserActions,
      int priority) {
    this.id = id;
    this.displayName = displayName;
    this.description = description;
    this.systemPrompt = systemPrompt;
    this.supportsBrowserActions = supportsBrowserActions;
    this.priority = priority;
  }

  public String getId() {
    return id;
  }

  public void setId(String id) {
    this.id = id;
  }

  public String getDisplayName() {
    return displayName;
  }

  public void setDisplayName(String displayName) {
    this.displayName = displayName;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public String getSystemPrompt() {
    return systemPrompt;
  }

  public void setSystemPrompt(String systemPrompt) {
    this.systemPrompt = systemPrompt;
  }

  public boolean isEnabled() {
    return enabled;
  }

  public void setEnabled(boolean enabled) {
    this.enabled = enabled;
  }

  public boolean isSystemAgent() {
    return systemAgent;
  }

  public void setSystemAgent(boolean systemAgent) {
    this.systemAgent = systemAgent;
  }

  public boolean isSupportsBrowserActions() {
    return supportsBrowserActions;
  }

  public void setSupportsBrowserActions(boolean supportsBrowserActions) {
    this.supportsBrowserActions = supportsBrowserActions;
  }

  public int getPriority() {
    return priority;
  }

  public void setPriority(int priority) {
    this.priority = priority;
  }

  public String getRoutingRules() {
    return routingRules;
  }

  public void setRoutingRules(String routingRules) {
    this.routingRules = routingRules;
  }

  public String getModel() {
    return model;
  }

  public void setModel(String model) {
    this.model = model;
  }

  public Double getTemperature() {
    return temperature;
  }

  public void setTemperature(Double temperature) {
    this.temperature = temperature;
  }

  public String getKnowledgeBaseIds() {
    return knowledgeBaseIds;
  }

  public void setKnowledgeBaseIds(String knowledgeBaseIds) {
    this.knowledgeBaseIds = knowledgeBaseIds;
  }

  public String getToolIds() {
    return toolIds;
  }

  public void setToolIds(String toolIds) {
    this.toolIds = toolIds;
  }

  public String getSkillIds() {
    return skillIds;
  }

  public void setSkillIds(String skillIds) {
    this.skillIds = skillIds;
  }

  public long getVersion() {
    return version;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  public void touch() {
    version++;
    updatedAt = Instant.now();
  }
}
