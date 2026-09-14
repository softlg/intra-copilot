package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.intra.copilot.util.EntityIdGenerator;
import java.time.Instant;
import java.util.List;

@TableName("skill_definition")
public class SkillDefinition {
    @TableId private String id = EntityIdGenerator.next("SK");
    private String name;
    private String description;
    private String prompt;

    @TableField("tool_ids")
    private String legacyToolIds = "[]";

    private String version = "1.0.0";
    private boolean enabled = true;
    private String status = "DRAFT";
    private String activationMode = "ALWAYS";
    private String activationConfig = "{}";
    private int priority = 100;
    private int maxPromptChars = 8000;
    private long publishedVersion;
    private long invocationCount;
    private Instant lastUsedAt;
    private long lockVersion;
    private String updatedBy;

    @TableField(updateStrategy = FieldStrategy.NEVER)
    private Instant createdAt = Instant.now();

    private Instant updatedAt = Instant.now();

    @TableField(exist = false)
    private List<String> toolIds = List.of();

    @TableField(exist = false)
    private int toolCount;

    @TableField(exist = false)
    private int agentCount;

    @TableField(exist = false)
    private List<String> agentIds = List.of();

    @TableField(exist = false)
    private List<String> agentNames = List.of();

    @TableField(exist = false)
    private int promptChars;

    @TableField(exist = false)
    private int promptTokenEstimate;

    @TableField(exist = false)
    private String changeNote;

    public String getId() {
        return id;
    }

    public void setId(String value) {
        id = value;
    }

    public String getName() {
        return name;
    }

    public void setName(String value) {
        name = value;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String value) {
        description = value;
    }

    public String getPrompt() {
        return prompt;
    }

    public void setPrompt(String value) {
        prompt = value;
    }

    public List<String> getToolIds() {
        return toolIds;
    }

    public void setToolIds(List<String> value) {
        toolIds = value == null ? List.of() : List.copyOf(value);
    }

    @JsonIgnore
    public String getLegacyToolIds() {
        return legacyToolIds;
    }

    public void setLegacyToolIds(String value) {
        legacyToolIds = value == null ? "[]" : value;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String value) {
        version = value;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean value) {
        enabled = value;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String value) {
        status = value;
    }

    public String getActivationMode() {
        return activationMode;
    }

    public void setActivationMode(String value) {
        activationMode = value;
    }

    public String getActivationConfig() {
        return activationConfig;
    }

    public void setActivationConfig(String value) {
        activationConfig = value;
    }

    public int getPriority() {
        return priority;
    }

    public void setPriority(int value) {
        priority = value;
    }

    public int getMaxPromptChars() {
        return maxPromptChars;
    }

    public void setMaxPromptChars(int value) {
        maxPromptChars = value;
    }

    public long getPublishedVersion() {
        return publishedVersion;
    }

    public void setPublishedVersion(long value) {
        publishedVersion = value;
    }

    public long getInvocationCount() {
        return invocationCount;
    }

    public void setInvocationCount(long value) {
        invocationCount = value;
    }

    public Instant getLastUsedAt() {
        return lastUsedAt;
    }

    public void setLastUsedAt(Instant value) {
        lastUsedAt = value;
    }

    public long getLockVersion() {
        return lockVersion;
    }

    public void setLockVersion(long value) {
        lockVersion = value;
    }

    public String getUpdatedBy() {
        return updatedBy;
    }

    public void setUpdatedBy(String value) {
        updatedBy = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant value) {
        createdAt = value;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant value) {
        updatedAt = value;
    }

    public int getToolCount() {
        return toolCount;
    }

    public void setToolCount(int value) {
        toolCount = value;
    }

    public int getAgentCount() {
        return agentCount;
    }

    public void setAgentCount(int value) {
        agentCount = value;
    }

    public List<String> getAgentIds() {
        return agentIds;
    }

    public void setAgentIds(List<String> value) {
        agentIds = value == null ? List.of() : List.copyOf(value);
    }

    public List<String> getAgentNames() {
        return agentNames;
    }

    public void setAgentNames(List<String> value) {
        agentNames = value == null ? List.of() : List.copyOf(value);
    }

    public int getPromptChars() {
        return promptChars;
    }

    public void setPromptChars(int value) {
        promptChars = value;
    }

    public int getPromptTokenEstimate() {
        return promptTokenEstimate;
    }

    public void setPromptTokenEstimate(int value) {
        promptTokenEstimate = value;
    }

    public String getChangeNote() {
        return changeNote;
    }

    public void setChangeNote(String value) {
        changeNote = value;
    }

    public void touch() {
        lockVersion++;
        updatedAt = Instant.now();
    }
}
