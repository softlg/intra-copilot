package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.util.EntityIdGenerator;
import java.time.Instant;

/** A registered MCP server and its last discovered health/capability snapshot. */
@TableName("mcp_server")
public class McpServer {
    @TableId private String id = EntityIdGenerator.next("MC");
    private String name;
    private String description;
    private String serverUrl;
    private String transport = "STREAMABLE_HTTP";
    private String authEnv;
    private boolean enabled = true;
    private String status = "UNKNOWN";
    private Integer interfaceCount = 0;
    private String interfacesJson = "[]";
    private String capabilitiesJson = "{}";
    private String lastError;
    private Instant lastCheckedAt;
    private Integer lastLatencyMs;
    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();

    public String getId() { return id; }
    public void setId(String value) { id = value; }
    public String getName() { return name; }
    public void setName(String value) { name = value; }
    public String getDescription() { return description; }
    public void setDescription(String value) { description = value; }
    public String getServerUrl() { return serverUrl; }
    public void setServerUrl(String value) { serverUrl = value; }
    public String getTransport() { return transport; }
    public void setTransport(String value) { transport = value; }
    public String getAuthEnv() { return authEnv; }
    public void setAuthEnv(String value) { authEnv = value; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean value) { enabled = value; }
    public String getStatus() { return status; }
    public void setStatus(String value) { status = value; }
    public Integer getInterfaceCount() { return interfaceCount; }
    public void setInterfaceCount(Integer value) { interfaceCount = value; }
    public String getInterfacesJson() { return interfacesJson; }
    public void setInterfacesJson(String value) { interfacesJson = value; }
    public String getCapabilitiesJson() { return capabilitiesJson; }
    public void setCapabilitiesJson(String value) { capabilitiesJson = value; }
    public String getLastError() { return lastError; }
    public void setLastError(String value) { lastError = value; }
    public Instant getLastCheckedAt() { return lastCheckedAt; }
    public void setLastCheckedAt(Instant value) { lastCheckedAt = value; }
    public Integer getLastLatencyMs() { return lastLatencyMs; }
    public void setLastLatencyMs(Integer value) { lastLatencyMs = value; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void touch() { updatedAt = Instant.now(); }
}
