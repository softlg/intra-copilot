package com.intra.copilot.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "tool_definition")
public class ToolDefinition {
  @Id private String id = UUID.randomUUID().toString();
  private String name;
  @Lob private String description;
  private String type = "BROWSER_PROPOSAL";
  private String method;
  @Lob private String endpoint;
  @Lob private String parameterSchema = "{}";
  @Lob private String allowedDomains = "[]";
  private Integer timeoutMs = 10000;
  private boolean enabled = true;
  private Instant createdAt = Instant.now();
  private Instant updatedAt = Instant.now();

  public String getId() { return id; }
  public void setId(String id) { this.id = id; }
  public String getName() { return name; }
  public void setName(String value) { name = value; }
  public String getDescription() { return description; }
  public void setDescription(String value) { description = value; }
  public String getType() { return type; }
  public void setType(String value) { type = value; }
  public String getMethod() { return method; }
  public void setMethod(String value) { method = value; }
  public String getEndpoint() { return endpoint; }
  public void setEndpoint(String value) { endpoint = value; }
  public String getParameterSchema() { return parameterSchema; }
  public void setParameterSchema(String value) { parameterSchema = value; }
  public String getAllowedDomains() { return allowedDomains; }
  public void setAllowedDomains(String value) { allowedDomains = value; }
  public Integer getTimeoutMs() { return timeoutMs; }
  public void setTimeoutMs(Integer value) { timeoutMs = value; }
  public boolean isEnabled() { return enabled; }
  public void setEnabled(boolean value) { enabled = value; }
  public Instant getCreatedAt() { return createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
  public void touch() { updatedAt = Instant.now(); }
}
