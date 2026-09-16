package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.util.EntityIdGenerator;
import java.time.Instant;

/** Immutable audit record for a management-console mutation. */
@TableName("admin_operation_audit")
public class AdminOperationAudit {
    @TableId private String id = EntityIdGenerator.next("OA");
    private String adminUserId;
    private String actorUsername;
    private String action;
    private String targetType;
    private String targetId;
    private String source;
    private String sessionId;
    private String payloadJson;
    private Instant createdAt = Instant.now();

    public String getId() {
        return id;
    }

    public void setId(String value) {
        id = value;
    }

    public String getAdminUserId() {
        return adminUserId;
    }

    public void setAdminUserId(String value) {
        adminUserId = value;
    }

    public String getActorUsername() {
        return actorUsername;
    }

    public void setActorUsername(String value) {
        actorUsername = value;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String value) {
        action = value;
    }

    public String getTargetType() {
        return targetType;
    }

    public void setTargetType(String value) {
        targetType = value;
    }

    public String getTargetId() {
        return targetId;
    }

    public void setTargetId(String value) {
        targetId = value;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String value) {
        source = value;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String value) {
        sessionId = value;
    }

    public String getPayloadJson() {
        return payloadJson;
    }

    public void setPayloadJson(String value) {
        payloadJson = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant value) {
        createdAt = value;
    }
}
