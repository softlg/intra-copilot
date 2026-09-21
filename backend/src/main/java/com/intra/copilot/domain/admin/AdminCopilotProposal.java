package com.intra.copilot.domain.admin;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.shared.util.EntityIdGenerator;
import java.time.Instant;

@TableName("admin_copilot_proposal")
public class AdminCopilotProposal {
    @TableId private String id = EntityIdGenerator.next("CP");
    private String sessionId;
    private String adminUserId;
    private String kind;
    private String title;
    private String payloadJson;
    private String status = "READY";
    private String appliedTargetType;
    private String appliedTargetId;
    private String applyError;
    private Instant createdAt = Instant.now();
    private Instant confirmedAt;

    public String getId() {
        return id;
    }

    public void setId(String value) {
        id = value;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String value) {
        sessionId = value;
    }

    public String getAdminUserId() {
        return adminUserId;
    }

    public void setAdminUserId(String value) {
        adminUserId = value;
    }

    public String getKind() {
        return kind;
    }

    public void setKind(String value) {
        kind = value;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String value) {
        title = value;
    }

    public String getPayloadJson() {
        return payloadJson;
    }

    public void setPayloadJson(String value) {
        payloadJson = value;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String value) {
        status = value;
    }

    public String getAppliedTargetType() {
        return appliedTargetType;
    }

    public void setAppliedTargetType(String value) {
        appliedTargetType = value;
    }

    public String getAppliedTargetId() {
        return appliedTargetId;
    }

    public void setAppliedTargetId(String value) {
        appliedTargetId = value;
    }

    public String getApplyError() {
        return applyError;
    }

    public void setApplyError(String value) {
        applyError = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant value) {
        createdAt = value;
    }

    public Instant getConfirmedAt() {
        return confirmedAt;
    }

    public void setConfirmedAt(Instant value) {
        confirmedAt = value;
    }
}
