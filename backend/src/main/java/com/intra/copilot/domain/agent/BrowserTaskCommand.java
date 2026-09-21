package com.intra.copilot.domain.agent;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.shared.util.EntityIdGenerator;
import java.time.Instant;

/** One durable action command claimed by an external browser runtime. */
@TableName("browser_task_command")
public class BrowserTaskCommand {
    public static final String PENDING = "PENDING";
    public static final String RUNNING = "RUNNING";
    public static final String COMPLETED = "COMPLETED";
    public static final String FAILED = "FAILED";
    public static final String CANCELED = "CANCELED";

    @TableId("command_id")
    private String commandId = EntityIdGenerator.next("BC");

    private String taskId;
    private int sequenceNo;
    private String actionJson;
    private String actionType;
    private String status = PENDING;
    private String runtimeInstanceId;
    private String leaseTokenHash;
    private String resultJson;
    private String observationJson;
    private String error;
    private int attemptCount;
    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();
    private Instant completedAt;
    private Instant expiresAt;

    public String getCommandId() {
        return commandId;
    }

    public void setCommandId(String value) {
        commandId = value;
    }

    public String getTaskId() {
        return taskId;
    }

    public void setTaskId(String value) {
        taskId = value;
    }

    public int getSequenceNo() {
        return sequenceNo;
    }

    public void setSequenceNo(int value) {
        sequenceNo = Math.max(1, value);
    }

    public String getActionJson() {
        return actionJson;
    }

    public void setActionJson(String value) {
        actionJson = value;
    }

    public String getActionType() {
        return actionType;
    }

    public void setActionType(String value) {
        actionType = value;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String value) {
        status = value;
    }

    public String getRuntimeInstanceId() {
        return runtimeInstanceId;
    }

    public void setRuntimeInstanceId(String value) {
        runtimeInstanceId = value;
    }

    public String getLeaseTokenHash() {
        return leaseTokenHash;
    }

    public void setLeaseTokenHash(String value) {
        leaseTokenHash = value;
    }

    public String getResultJson() {
        return resultJson;
    }

    public void setResultJson(String value) {
        resultJson = value;
    }

    public String getObservationJson() {
        return observationJson;
    }

    public void setObservationJson(String value) {
        observationJson = value;
    }

    public String getError() {
        return error;
    }

    public void setError(String value) {
        error = value;
    }

    public int getAttemptCount() {
        return attemptCount;
    }

    public void setAttemptCount(int value) {
        attemptCount = Math.max(0, value);
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
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

    public boolean terminal() {
        return COMPLETED.equals(status) || FAILED.equals(status) || CANCELED.equals(status);
    }

    public void touch() {
        updatedAt = Instant.now();
    }
}
