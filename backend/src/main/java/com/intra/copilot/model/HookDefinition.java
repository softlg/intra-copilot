package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;
import java.util.UUID;

/** A validation hook evaluated immediately before an Agent starts working. */
@TableName("hook_definition")
public class HookDefinition {
    @TableId private String id = UUID.randomUUID().toString();
    private String name;
    private String description;
    private String phase = "PRE_AGENT";
    private String ruleType = "REQUIRE_PERMISSION";
    private String ruleConfig = "{}";
    private String failureMessage;
    private int priority = 100;
    private boolean enabled = true;
    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();

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

    public String getPhase() {
        return phase;
    }

    public void setPhase(String value) {
        phase = value;
    }

    public String getRuleType() {
        return ruleType;
    }

    public void setRuleType(String value) {
        ruleType = value;
    }

    public String getRuleConfig() {
        return ruleConfig;
    }

    public void setRuleConfig(String value) {
        ruleConfig = value;
    }

    public String getFailureMessage() {
        return failureMessage;
    }

    public void setFailureMessage(String value) {
        failureMessage = value;
    }

    public int getPriority() {
        return priority;
    }

    public void setPriority(int value) {
        priority = value;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean value) {
        enabled = value;
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
