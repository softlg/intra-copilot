package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.util.EntityIdGenerator;
import java.time.Instant;

/** Relational binding between a Skill and one of its authorized tools. */
@TableName("skill_tool_binding")
public class SkillToolBinding {
    @TableId private String id = EntityIdGenerator.next("ST");
    private String skillId;
    private String toolId;
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

    public String getToolId() {
        return toolId;
    }

    public void setToolId(String value) {
        this.toolId = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant value) {
        this.createdAt = value;
    }
}
