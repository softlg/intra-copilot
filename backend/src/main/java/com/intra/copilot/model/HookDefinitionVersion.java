package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.util.EntityIdGenerator;
import java.time.Instant;

/** Immutable snapshot used to explain and roll back hook policy changes. */
@TableName("hook_definition_version")
public class HookDefinitionVersion {
    @TableId private String id = EntityIdGenerator.next("HV");
    private String hookId;
    private long version;
    private String snapshot;
    private String changeNote;
    private String createdBy;
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

    public long getVersion() {
        return version;
    }

    public void setVersion(long value) {
        version = value;
    }

    public String getSnapshot() {
        return snapshot;
    }

    public void setSnapshot(String value) {
        snapshot = value;
    }

    public String getChangeNote() {
        return changeNote;
    }

    public void setChangeNote(String value) {
        changeNote = value;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(String value) {
        createdBy = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant value) {
        createdAt = value;
    }
}
