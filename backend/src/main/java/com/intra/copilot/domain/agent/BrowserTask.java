package com.intra.copilot.domain.agent;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.intra.copilot.shared.util.EntityIdGenerator;
import java.time.Instant;

/** Durable high-level browser task shared by extension, embedded and server runtimes. */
@TableName("browser_task")
public class BrowserTask {
    @TableId("task_id")
    private String taskId = EntityIdGenerator.next("BT");

    private String conversationId;
    private String ownerUserId;
    private String capability;
    private String interactionMode = BrowserInteractionMode.FAST.name();
    private String runtimeKind = BrowserRuntimeKind.TOOL_RESULT.name();
    private String status = BrowserTaskStatus.CREATED.name();
    private int protocolVersion = 1;
    private String idempotencyKey;
    private String goal;
    private String startUrl;
    private String allowedOrigins = "[]";
    private String businessContext = "{}";
    private String constraints = "{}";
    private String successCriteria = "[]";
    private String result;
    private String error;
    private String leaseRuntimeInstanceId;
    private String leaseTokenHash;
    private Instant leaseExpiresAt;
    private String runtimeVersion;
    private int maxSteps = 10;
    private int stepsUsed;
    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();
    private Instant startedAt;
    private Instant completedAt;
    private Instant expiresAt;
    @Version private long lockVersion;

    public String getTaskId() {
        return taskId;
    }

    public void setTaskId(String value) {
        taskId = value;
    }

    public String getConversationId() {
        return conversationId;
    }

    public void setConversationId(String value) {
        conversationId = value;
    }

    public String getOwnerUserId() {
        return ownerUserId;
    }

    public void setOwnerUserId(String value) {
        ownerUserId = value;
    }

    public String getCapability() {
        return capability;
    }

    public void setCapability(String value) {
        capability = value;
    }

    public BrowserInteractionMode interactionMode() {
        return BrowserInteractionMode.from(interactionMode);
    }

    public String getInteractionMode() {
        return interactionMode;
    }

    public void setInteractionMode(String value) {
        interactionMode = BrowserInteractionMode.from(value).name();
    }

    public BrowserRuntimeKind runtimeKind() {
        return BrowserRuntimeKind.from(runtimeKind);
    }

    public String getRuntimeKind() {
        return runtimeKind;
    }

    public void setRuntimeKind(String value) {
        runtimeKind = BrowserRuntimeKind.from(value).name();
    }

    public BrowserTaskStatus statusValue() {
        return BrowserTaskStatus.from(status);
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String value) {
        status = BrowserTaskStatus.from(value).name();
    }

    public String getGoal() {
        return goal;
    }

    public void setGoal(String value) {
        goal = value;
    }

    public String getStartUrl() {
        return startUrl;
    }

    public void setStartUrl(String value) {
        startUrl = value;
    }

    public int getProtocolVersion() {
        return protocolVersion;
    }

    public void setProtocolVersion(int value) {
        protocolVersion = Math.max(1, value);
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public void setIdempotencyKey(String value) {
        idempotencyKey = value == null || value.isBlank() ? null : value.trim();
    }

    public String getAllowedOrigins() {
        return allowedOrigins;
    }

    public void setAllowedOrigins(String value) {
        allowedOrigins = value == null || value.isBlank() ? "[]" : value;
    }

    public String getBusinessContext() {
        return businessContext;
    }

    public void setBusinessContext(String value) {
        businessContext = value == null || value.isBlank() ? "{}" : value;
    }

    public String getConstraints() {
        return constraints;
    }

    public void setConstraints(String value) {
        constraints = value == null || value.isBlank() ? "{}" : value;
    }

    public String getSuccessCriteria() {
        return successCriteria;
    }

    public void setSuccessCriteria(String value) {
        successCriteria = value == null || value.isBlank() ? "[]" : value;
    }

    public String getResult() {
        return result;
    }

    public void setResult(String value) {
        result = value;
    }

    public String getError() {
        return error;
    }

    public void setError(String value) {
        error = value;
    }

    public String getLeaseRuntimeInstanceId() {
        return leaseRuntimeInstanceId;
    }

    public void setLeaseRuntimeInstanceId(String value) {
        leaseRuntimeInstanceId = value == null || value.isBlank() ? null : value.trim();
    }

    public String getLeaseTokenHash() {
        return leaseTokenHash;
    }

    public void setLeaseTokenHash(String value) {
        leaseTokenHash = value == null || value.isBlank() ? null : value.trim();
    }

    public Instant getLeaseExpiresAt() {
        return leaseExpiresAt;
    }

    public void setLeaseExpiresAt(Instant value) {
        leaseExpiresAt = value;
    }

    public String getRuntimeVersion() {
        return runtimeVersion;
    }

    public void setRuntimeVersion(String value) {
        runtimeVersion = value == null || value.isBlank() ? null : value.trim();
    }

    public int getMaxSteps() {
        return maxSteps;
    }

    public void setMaxSteps(int value) {
        maxSteps = Math.max(1, Math.min(10, value));
    }

    public int getStepsUsed() {
        return stepsUsed;
    }

    public void setStepsUsed(int value) {
        stepsUsed = Math.max(0, value);
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(Instant value) {
        startedAt = value;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(Instant value) {
        completedAt = value;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant value) {
        expiresAt = value;
    }

    public long getLockVersion() {
        return lockVersion;
    }

    public void touch() {
        updatedAt = Instant.now();
        lockVersion++;
    }
}
