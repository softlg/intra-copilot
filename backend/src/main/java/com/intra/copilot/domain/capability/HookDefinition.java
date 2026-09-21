package com.intra.copilot.domain.capability;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.shared.util.EntityIdGenerator;
import java.time.Instant;
import java.util.List;

/** A validation hook evaluated immediately before an Agent starts working. */
@TableName("hook_definition")
public class HookDefinition {
    @TableId private String id = EntityIdGenerator.next("HK");
    private String name;
    private String description;
    private String phase = "PRE_AGENT";
    private String ruleType = "REQUIRE_PERMISSION";
    private String ruleConfig = "{}";
    private String failureMessage;
    private int priority = 100;
    private boolean enabled = true;
    private long version = 1;
    private String failMode = "BLOCK";
    private String createdBy;
    private String updatedBy;

    @TableField(updateStrategy = FieldStrategy.NEVER)
    private Instant createdAt = Instant.now();

    private Instant updatedAt = Instant.now();

    @TableField(exist = false)
    private List<HookBinding> bindings = List.of();

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

    public long getVersion() {
        return version;
    }

    public void setVersion(long value) {
        version = value;
    }

    public String getFailMode() {
        return failMode;
    }

    public void setFailMode(String value) {
        failMode = value;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(String value) {
        createdBy = value;
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

    public List<HookBinding> getBindings() {
        return bindings;
    }

    public void setBindings(List<HookBinding> value) {
        bindings = value == null ? List.of() : List.copyOf(value);
    }

    public void touch() {
        updatedAt = Instant.now();
    }
}
