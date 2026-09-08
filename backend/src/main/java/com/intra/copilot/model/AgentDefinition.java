package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;

@TableName("agent_definition")
public class AgentDefinition {
    @TableId private String id;
    private String displayName;
    private String description;
    private String systemPrompt;
    private String role = "DOMAIN";
    private String parentAgentId;
    private String handlingMode = "AUTO";
    private String returnMode = "CHILD_DIRECT";
    private boolean enabled = true;
    private boolean published = true;
    /** True for agents shipped by the application and protected from deletion. */
    private boolean systemAgent;

    private boolean supportsBrowserActions;
    private int priority = 100;
    private String routingRules;
    private String model;
    private Double temperature;
    private String knowledgeBaseIds = "[]";
    private String toolIds = "[]";
    private String skillIds = "[]";
    private long version = 1;
    private long publishedVersion = 0;
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

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getParentAgentId() {
        return parentAgentId;
    }

    public void setParentAgentId(String parentAgentId) {
        this.parentAgentId = parentAgentId;
    }

    public String getHandlingMode() {
        return handlingMode;
    }

    public void setHandlingMode(String handlingMode) {
        this.handlingMode = handlingMode;
    }

    public String getReturnMode() {
        return returnMode;
    }

    public void setReturnMode(String returnMode) {
        this.returnMode = returnMode;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isPublished() {
        return published;
    }

    public void setPublished(boolean published) {
        this.published = published;
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

    public void setVersion(long version) {
        this.version = version;
    }

    public long getPublishedVersion() {
        return publishedVersion;
    }

    public void setPublishedVersion(long publishedVersion) {
        this.publishedVersion = publishedVersion;
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
