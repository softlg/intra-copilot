package com.intra.copilot.domain.conversation;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.shared.util.EntityIdGenerator;
import java.time.Instant;

@TableName("action_proposal")
public class ActionProposal {
    @TableId("action_id")
    private String actionId = EntityIdGenerator.next("AP");

    private String conversationId;
    private String invocationId;
    private String traceId;
    private String type;
    private String target;
    private String arguments;
    private String postcondition;
    private boolean readOnly;
    private String reason;
    private String risk;
    private Instant expiresAt;
    private String status = "PENDING";
    private String result;

    public String getActionId() {
        return actionId;
    }

    public String getConversationId() {
        return conversationId;
    }

    public void setConversationId(String v) {
        conversationId = v;
    }

    public String getInvocationId() {
        return invocationId;
    }

    public void setInvocationId(String v) {
        invocationId = v;
    }

    public String getTraceId() {
        return traceId;
    }

    public void setTraceId(String v) {
        traceId = v;
    }

    public String getType() {
        return type;
    }

    public void setType(String v) {
        type = v;
    }

    public String getTarget() {
        return target;
    }

    public void setTarget(String v) {
        target = v;
    }

    public String getArguments() {
        return arguments;
    }

    public void setArguments(String v) {
        arguments = v;
    }

    public String getPostcondition() {
        return postcondition;
    }

    public void setPostcondition(String value) {
        postcondition = value;
    }

    public boolean isReadOnly() {
        return readOnly;
    }

    public void setReadOnly(boolean value) {
        readOnly = value;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String v) {
        reason = v;
    }

    public String getRisk() {
        return risk;
    }

    public void setRisk(String v) {
        risk = v;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant v) {
        expiresAt = v;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String v) {
        status = v;
    }

    public String getResult() {
        return result;
    }

    public void setResult(String v) {
        result = v;
    }
}
