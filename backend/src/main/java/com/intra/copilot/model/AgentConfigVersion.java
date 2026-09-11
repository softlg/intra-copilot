package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.util.EntityIdGenerator;
import java.time.Instant;

@TableName("agent_config_version")
public class AgentConfigVersion {
    @TableId private String id = EntityIdGenerator.next("AV");
    private String agentId;
    private long version;
    private String status = "DRAFT";
    private String snapshot;
    private String releaseNote;
    private Instant createdAt = Instant.now();

    public String getId() { return id; }
    public void setId(String value) { id = value; }
    public String getAgentId() { return agentId; }
    public void setAgentId(String value) { agentId = value; }
    public long getVersion() { return version; }
    public void setVersion(long value) { version = value; }
    public String getStatus() { return status; }
    public void setStatus(String value) { status = value; }
    public String getSnapshot() { return snapshot; }
    public void setSnapshot(String value) { snapshot = value; }
    public String getReleaseNote() { return releaseNote; }
    public void setReleaseNote(String value) { releaseNote = value; }
    public Instant getCreatedAt() { return createdAt; }
}
