package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.util.EntityIdGenerator;
import java.time.Instant;

@TableName("admin_copilot_session")
public class AdminCopilotSession {
    @TableId private String id = EntityIdGenerator.next("CS");
    private String adminUserId;
    private String title;
    private String mode;
    private String status = "ACTIVE";
    private String currentAgentId;
    private String stateJson = "{}";
    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();

    public String getId() {
        return id;
    }

    public void setId(String value) {
        id = value;
    }

    public String getAdminUserId() {
        return adminUserId;
    }

    public void setAdminUserId(String value) {
        adminUserId = value;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String value) {
        title = value;
    }

    public String getMode() {
        return mode;
    }

    public void setMode(String value) {
        mode = value;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String value) {
        status = value;
    }

    public String getCurrentAgentId() {
        return currentAgentId;
    }

    public void setCurrentAgentId(String value) {
        currentAgentId = value;
    }

    public String getStateJson() {
        return stateJson;
    }

    public void setStateJson(String value) {
        stateJson = value;
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

    public void touch() {
        updatedAt = Instant.now();
    }
}
