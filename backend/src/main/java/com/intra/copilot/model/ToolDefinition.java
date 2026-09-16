package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
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

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String method;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String endpoint;
    /** Original remote tool name for MCP tools after local function-name normalization. */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String remoteName;
    /**
     * Foreign key to the owning {@link McpServer} row when type is MCP. Replaces the previous
     * mcp_server_url string copy so tool rows stay linked to their server even if the server URL
     * changes, and the credentials/env reference lives on the server row only.
     */
    private String mcpServerId;

    private String parameterSchema;
    private Integer timeoutMs;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String authHeaderName;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String authEnv;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String authScheme;

    private boolean enabled = true;
    private String createdBy = "system";
    private String updatedBy = "system";
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

    public String getRemoteName() {
        return remoteName;
    }

    public void setRemoteName(String value) {
        remoteName = value;
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

    public String getAuthHeaderName() {
        return authHeaderName;
    }

    public void setAuthHeaderName(String value) {
        authHeaderName = value;
    }

    public String getAuthEnv() {
        return authEnv;
    }

    public void setAuthEnv(String value) {
        authEnv = value;
    }

    public String getAuthScheme() {
        return authScheme;
    }

    public void setAuthScheme(String value) {
        authScheme = value;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean value) {
        enabled = value;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(String value) {
        createdBy = value;
    }

    public String getUpdatedBy() {
        return updatedBy;
    }

    public void setUpdatedBy(String value) {
        updatedBy = value;
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
