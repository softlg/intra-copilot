package com.intra.copilot.domain.agent;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.shared.util.EntityIdGenerator;
import java.time.Instant;

/** One ordered step in an {@link AgentPlan}. */
@TableName("agent_plan_step")
public class AgentPlanStep {
    @TableId private String id = EntityIdGenerator.next("PS");
    private String planId;
    private int stepIndex;
    private String title;
    private String description;
    private String agentId;
    private String toolNames = "[]";
    private String dependsOn = "[]";
    private String successCriteria;
    private String status = "PENDING";
    private String resultSummary;
    private String error;
    private Instant startedAt;
    private Instant completedAt;
    private Long durationMs;
    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();

    public String getId() {
        return id;
    }

    public void setId(String value) {
        id = value;
    }

    public String getPlanId() {
        return planId;
    }

    public void setPlanId(String value) {
        planId = value;
    }

    public int getStepIndex() {
        return stepIndex;
    }

    public void setStepIndex(int value) {
        stepIndex = value;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String value) {
        title = value;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String value) {
        description = value;
    }

    public String getAgentId() {
        return agentId;
    }

    public void setAgentId(String value) {
        agentId = value;
    }

    public String getToolNames() {
        return toolNames;
    }

    public void setToolNames(String value) {
        toolNames = value == null ? "[]" : value;
    }

    public String getDependsOn() {
        return dependsOn;
    }

    public void setDependsOn(String value) {
        dependsOn = value == null ? "[]" : value;
    }

    public String getSuccessCriteria() {
        return successCriteria;
    }

    public void setSuccessCriteria(String value) {
        successCriteria = value;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String value) {
        status = value;
    }

    public String getResultSummary() {
        return resultSummary;
    }

    public void setResultSummary(String value) {
        resultSummary = value;
    }

    public String getError() {
        return error;
    }

    public void setError(String value) {
        error = value;
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

    public Long getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(Long value) {
        durationMs = value;
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
