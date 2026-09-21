package com.intra.copilot.domain.agent;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.shared.util.EntityIdGenerator;
import java.time.Instant;

/** Persistent execution plan for one agent turn. */
@TableName("agent_plan")
public class AgentPlan {
    @TableId private String id = EntityIdGenerator.next("PL");
    private String conversationId;
    private String invocationId;
    private String correlationId;
    private String parentPlanId;
    private String routeAgentId;
    private String executorAgentId;
    private int revision = 1;
    private String goal;
    private String summary;
    private String status = "PENDING";
    private String planningMode = "AUTO";
    private Instant startedAt;
    private Instant completedAt;
    private String error;
    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();

    public String getId() {
        return id;
    }

    public void setId(String value) {
        id = value;
    }

    public String getConversationId() {
        return conversationId;
    }

    public void setConversationId(String value) {
        conversationId = value;
    }

    public String getInvocationId() {
        return invocationId;
    }

    public void setInvocationId(String value) {
        invocationId = value;
    }

    public String getCorrelationId() {
        return correlationId;
    }

    public void setCorrelationId(String value) {
        correlationId = value;
    }

    public String getParentPlanId() {
        return parentPlanId;
    }

    public void setParentPlanId(String value) {
        parentPlanId = value;
    }

    public String getRouteAgentId() {
        return routeAgentId;
    }

    public void setRouteAgentId(String value) {
        routeAgentId = value;
    }

    public String getExecutorAgentId() {
        return executorAgentId;
    }

    public void setExecutorAgentId(String value) {
        executorAgentId = value;
    }

    public int getRevision() {
        return revision;
    }

    public void setRevision(int value) {
        revision = value;
    }

    public String getGoal() {
        return goal;
    }

    public void setGoal(String value) {
        goal = value;
    }

    public String getSummary() {
        return summary;
    }

    public void setSummary(String value) {
        summary = value;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String value) {
        status = value;
    }

    public String getPlanningMode() {
        return planningMode;
    }

    public void setPlanningMode(String value) {
        planningMode = value;
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

    public String getError() {
        return error;
    }

    public void setError(String value) {
        error = value;
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
