package com.intra.copilot.domain.capability;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.shared.util.EntityIdGenerator;
import java.time.Instant;

/** Administrative audit record for Skill changes. */
@TableName("skill_audit_log")
public class SkillAuditLog {
    @TableId private String id = EntityIdGenerator.next("SA");
    private String skillId;
    private String action;
    private String actor;
    private String beforeConfig;
    private String afterConfig;
    private Instant createdAt = Instant.now();

    public String getId() {
        return id;
    }

    public void setId(String value) {
        this.id = value;
    }

    public String getSkillId() {
        return skillId;
    }

    public void setSkillId(String value) {
        this.skillId = value;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String value) {
        this.action = value;
    }

    public String getActor() {
        return actor;
    }

    public void setActor(String value) {
        this.actor = value;
    }

    public String getBeforeConfig() {
        return beforeConfig;
    }

    public void setBeforeConfig(String value) {
        this.beforeConfig = value;
    }

    public String getAfterConfig() {
        return afterConfig;
    }

    public void setAfterConfig(String value) {
        this.afterConfig = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant value) {
        this.createdAt = value;
    }
}
