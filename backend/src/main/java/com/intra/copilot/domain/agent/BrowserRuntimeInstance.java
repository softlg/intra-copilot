package com.intra.copilot.domain.agent;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;

/** Latest presence and capability handshake reported by a browser runtime instance. */
@TableName("browser_runtime_instance")
public class BrowserRuntimeInstance {
    @TableId("instance_id")
    private String instanceId;

    private String ownerUserId;
    private String runtimeKind;
    private int protocolVersion;
    private String runtimeVersion;
    private String supportedActions = "[]";
    private String interactionModes = "[]";
    private String currentUrl;
    private Instant lastSeenAt = Instant.now();
    private Instant createdAt = Instant.now();

    public String getInstanceId() {
        return instanceId;
    }

    public void setInstanceId(String value) {
        instanceId = value;
    }

    public String getOwnerUserId() {
        return ownerUserId;
    }

    public void setOwnerUserId(String value) {
        ownerUserId = value;
    }

    public String getRuntimeKind() {
        return runtimeKind;
    }

    public void setRuntimeKind(String value) {
        runtimeKind = BrowserRuntimeKind.from(value).name();
    }

    public int getProtocolVersion() {
        return protocolVersion;
    }

    public void setProtocolVersion(int value) {
        protocolVersion = Math.max(1, value);
    }

    public String getRuntimeVersion() {
        return runtimeVersion;
    }

    public void setRuntimeVersion(String value) {
        runtimeVersion = value;
    }

    public String getSupportedActions() {
        return supportedActions;
    }

    public void setSupportedActions(String value) {
        supportedActions = value == null || value.isBlank() ? "[]" : value;
    }

    public String getInteractionModes() {
        return interactionModes;
    }

    public void setInteractionModes(String value) {
        interactionModes = value == null || value.isBlank() ? "[]" : value;
    }

    public String getCurrentUrl() {
        return currentUrl;
    }

    public void setCurrentUrl(String value) {
        currentUrl = value;
    }

    public Instant getLastSeenAt() {
        return lastSeenAt;
    }

    public void setLastSeenAt(Instant value) {
        lastSeenAt = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
