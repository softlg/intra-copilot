package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.util.EntityIdGenerator;
import java.time.Instant;

@TableName("tool_definition")
public class ToolDefinition {
    @TableId private String id = EntityIdGenerator.next("TL");
    private String name;
    private String description;
    private String type = "BROWSER_PROPOSAL";
    private String method;
    private String endpoint;
    /**
     * Foreign key to the owning {@link McpServer} row when type is MCP. Replaces the previous
     * mcp_server_url string copy so tool rows stay linked to their server even if the server URL
     * changes, and the credentials/env reference lives on the server row only.
     */
    private String mcpServerId;
    private String parameterSchema = "{}";
    private Integer timeoutMs = 10000;
    private boolean enabled = true;
    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String value) {
        name = value;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String value) {
        description = value;
    }

    public String getType() {
        return type;
    }

    public void setType(String value) {
        type = value;
    }

    public String getMethod() {
        return method;
    }

    public void setMethod(String value) {
        method = value;
    }

    public String getEndpoint() {
        return endpoint;
    }

    public void setEndpoint(String value) {
        endpoint = value;
    }

    public String getMcpServerId() {
        return mcpServerId;
    }

    public void setMcpServerId(String value) {
        mcpServerId = value;
    }

    public String getParameterSchema() {
        return parameterSchema;
    }

    public void setParameterSchema(String value) {
        parameterSchema = value;
    }

    public Integer getTimeoutMs() {
        return timeoutMs;
    }

    public void setTimeoutMs(Integer value) {
        timeoutMs = value;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean value) {
        enabled = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void touch() {
        updatedAt = Instant.now();
    }
}
