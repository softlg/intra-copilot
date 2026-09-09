package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;
import java.util.UUID;

@TableName("agent_invocation")
public class AgentInvocation {
    @TableId private String id = UUID.randomUUID().toString();
    private String conversationId;
    private String correlationId;
    private String parentInvocationId;
    private Integer sequence;
    private Integer depth;
    private String agentRole;
    private String decisionMode;
    private String requestedAgentId;
    private String selectedAgentId;
    private String routeReason;
    private String intent;
    private String contextSent;
    private String responseContent;
    private String clientIp;
    private Double confidence;
    private String routeSource;
    private Long durationMs;
    private String error;
    private String status = "RUNNING";
    private String errorCode;
    private Integer inputTokens;
    private Integer outputTokens;

    // 运行时资源快照，避免后台查询时 JOIN agent_definition。
    private String agentModel;
    private Double agentTemperature;
    private String knowledgeBaseIds;
    private String toolIds;
    private String skillIds;
    private String userMessage;
    private String attachments;

    private Instant createdAt = Instant.now();

    public String getId() {
        return id;
    }

    public String getConversationId() {
        return conversationId;
    }

    public String getCorrelationId() { return correlationId; }
    public void setCorrelationId(String value) { correlationId = value; }
    public String getParentInvocationId() { return parentInvocationId; }
    public void setParentInvocationId(String value) { parentInvocationId = value; }
    public Integer getSequence() { return sequence; }
    public void setSequence(Integer value) { sequence = value; }
    public Integer getDepth() { return depth; }
    public void setDepth(Integer value) { depth = value; }
    public String getAgentRole() { return agentRole; }
    public void setAgentRole(String value) { agentRole = value; }
    public String getDecisionMode() { return decisionMode; }
    public void setDecisionMode(String value) { decisionMode = value; }

    public void setConversationId(String value) {
        conversationId = value;
    }

    public String getRequestedAgentId() {
        return requestedAgentId;
    }

    public void setRequestedAgentId(String value) {
        requestedAgentId = value;
    }

    public String getSelectedAgentId() {
        return selectedAgentId;
    }

    public void setSelectedAgentId(String value) {
        selectedAgentId = value;
    }

    public String getRouteReason() {
        return routeReason;
    }

    public void setRouteReason(String value) {
        routeReason = value;
    }

    public String getIntent() {
        return intent;
    }

    public void setIntent(String value) {
        intent = value;
    }

    public String getContextSent() {
        return contextSent;
    }

    public void setContextSent(String value) {
        contextSent = value;
    }

    public String getResponseContent() {
        return responseContent;
    }

    public void setResponseContent(String value) {
        responseContent = value;
    }

    public String getClientIp() {
        return clientIp;
    }

    public void setClientIp(String value) {
        clientIp = value;
    }

    public Double getConfidence() {
        return confidence;
    }

    public void setConfidence(Double value) {
        confidence = value;
    }

    public String getRouteSource() {
        return routeSource;
    }

    public void setRouteSource(String value) {
        routeSource = value;
    }

    public Long getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(Long value) {
        durationMs = value;
    }

    public String getError() {
        return error;
    }

    public String getStatus() { return status; }
    public void setStatus(String value) { status = value; }
    public String getErrorCode() { return errorCode; }
    public void setErrorCode(String value) { errorCode = value; }

    public void setError(String value) {
        error = value;
    }

    public Integer getInputTokens() {
        return inputTokens;
    }

    public void setInputTokens(Integer value) {
        inputTokens = value;
    }

    public Integer getOutputTokens() {
        return outputTokens;
    }

    public void setOutputTokens(Integer value) {
        outputTokens = value;
    }

    public String getAgentModel() { return agentModel; }
    public void setAgentModel(String value) { agentModel = value; }
    public Double getAgentTemperature() { return agentTemperature; }
    public void setAgentTemperature(Double value) { agentTemperature = value; }
    public String getKnowledgeBaseIds() { return knowledgeBaseIds; }
    public void setKnowledgeBaseIds(String value) { knowledgeBaseIds = value; }
    public String getToolIds() { return toolIds; }
    public void setToolIds(String value) { toolIds = value; }
    public String getSkillIds() { return skillIds; }
    public void setSkillIds(String value) { skillIds = value; }
    public String getUserMessage() { return userMessage; }
    public void setUserMessage(String value) { userMessage = value; }
    public String getAttachments() { return attachments; }
    public void setAttachments(String value) { attachments = value; }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
