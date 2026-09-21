package com.intra.copilot.domain.capability;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.shared.util.EntityIdGenerator;
import java.time.Instant;

/** Scope binding for a hook policy. Hook definitions may be reused by many agents. */
@TableName("hook_binding")
public class HookBinding {
    @TableId private String id = EntityIdGenerator.next("HB");

    @TableField("hook_id")
    private String hookId;

    @TableField("target_type")
    private String targetType = "GLOBAL";

    @TableField("target_id")
    private String targetId = "*";

    @TableField("created_at")
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

    public String getTargetType() {
        return targetType;
    }

    public void setTargetType(String value) {
        targetType = value;
    }

    public String getTargetId() {
        return targetId;
    }

    public void setTargetId(String value) {
        targetId = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant value) {
        createdAt = value;
    }
}
