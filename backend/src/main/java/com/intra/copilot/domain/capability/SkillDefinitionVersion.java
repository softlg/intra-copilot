package com.intra.copilot.domain.capability;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.shared.util.EntityIdGenerator;
import java.time.Instant;

/** Immutable Skill snapshot used for release history and rollback. */
@TableName("skill_definition_version")
public class SkillDefinitionVersion {
    @TableId private String id = EntityIdGenerator.next("SV");
    private String skillId;
    private long version;
    private String versionLabel;
    private String status;
    private String prompt;
    private String toolIds = "[]";
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

    public String getSkillId() {
        return skillId;
    }

    public void setSkillId(String value) {
        skillId = value;
    }

    public long getVersion() {
        return version;
    }

    public void setVersion(long value) {
        version = value;
    }

    public String getVersionLabel() {
        return versionLabel;
    }

    public void setVersionLabel(String value) {
        versionLabel = value;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String value) {
        status = value;
    }

    public String getPrompt() {
        return prompt;
    }

    public void setPrompt(String value) {
        prompt = value;
    }

    public String getToolIds() {
        return toolIds;
    }

    public void setToolIds(String value) {
        toolIds = value == null ? "[]" : value;
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
