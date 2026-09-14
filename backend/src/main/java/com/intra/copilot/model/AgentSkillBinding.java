package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.util.EntityIdGenerator;
import java.time.Instant;

/** Relational binding between an Agent and a Skill. */
@TableName("agent_skill_binding")
public class AgentSkillBinding {
    @TableId private String id = EntityIdGenerator.next("AS");
    private String agentId;
    private String skillId;
    private int priority = 100;
    private boolean enabled = true;
    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();

    public String getId() {
        return id;
    }

    public void setId(String value) {
        this.id = value;
    }

    public String getAgentId() {
        return agentId;
    }

    public void setAgentId(String value) {
        this.agentId = value;
    }

    public String getSkillId() {
        return skillId;
    }

    public void setSkillId(String value) {
        this.skillId = value;
    }

    public int getPriority() {
        return priority;
    }

    public void setPriority(int value) {
        this.priority = value;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean value) {
        this.enabled = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant value) {
        this.createdAt = value;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant value) {
        this.updatedAt = value;
    }
}
