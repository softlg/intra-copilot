package com.intra.copilot.domain.capability;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.shared.util.EntityIdGenerator;
import java.time.Instant;

/** Administrative audit trail for hook policy changes. */
@TableName("hook_audit_log")
public class HookAuditLog {
    @TableId private String id = EntityIdGenerator.next("HA");
    private String hookId;
    private String action;
    private String actor;
    private String beforeConfig;
    private String afterConfig;
    private Instant createdAt = Instant.now();

    public String getId() {
        return id;
    }

    public void setId(String value) {
        id = value;
    }

    public String getHookId() {
        return hookId;
    }

    public void setHookId(String value) {
        hookId = value;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String value) {
        action = value;
    }

    public String getActor() {
        return actor;
    }

    public void setActor(String value) {
        actor = value;
    }

    public String getBeforeConfig() {
        return beforeConfig;
    }

    public void setBeforeConfig(String value) {
        beforeConfig = value;
    }

    public String getAfterConfig() {
        return afterConfig;
    }

    public void setAfterConfig(String value) {
        afterConfig = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant value) {
        createdAt = value;
    }
}
