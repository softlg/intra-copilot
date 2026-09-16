package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.util.EntityIdGenerator;
import java.time.Instant;

@TableName("admin_agent_validation_run")
public class AgentValidationRun {
    @TableId private String id = EntityIdGenerator.next("VR");
    private String adminUserId;
    private String agentId;
    private long agentVersion;
    private String configHash;
    private String status;
    private String reportJson = "{}";
    private Instant createdAt = Instant.now();
    private Instant completedAt;

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

    public String getAgentId() {
        return agentId;
    }

    public void setAgentId(String value) {
        agentId = value;
    }

    public long getAgentVersion() {
        return agentVersion;
    }

    public void setAgentVersion(long value) {
        agentVersion = value;
    }

    public String getConfigHash() {
        return configHash;
    }

    public void setConfigHash(String value) {
        configHash = value;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String value) {
        status = value;
    }

    public String getReportJson() {
        return reportJson;
    }

    public void setReportJson(String value) {
        reportJson = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant value) {
        createdAt = value;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(Instant value) {
        completedAt = value;
    }
}
