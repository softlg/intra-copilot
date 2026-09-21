package com.intra.copilot.domain.conversation;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.shared.util.EntityIdGenerator;
import java.time.Instant;

@TableName("agent_feedback")
public class AgentFeedback {
    @TableId private String id = EntityIdGenerator.next("FB");
    private String sessionId;
    private String messageId;
    private Integer messageIndex;
    private String agentId;
    private String rating;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String comment;

    private String messageContent;
    private String userMessage;
    private String source;
    private String userId;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String reasonCode;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String reasonText;

    private String status = "ACTIVE";
    private Instant createdAt = Instant.now();
    private Instant ratedAt = Instant.now();
    private Instant updatedAt = Instant.now();

    public String getId() {
        return id;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String v) {
        sessionId = v;
    }

    public String getMessageId() {
        return messageId;
    }

    public void setMessageId(String v) {
        messageId = v;
    }

    public Integer getMessageIndex() {
        return messageIndex;
    }

    public void setMessageIndex(Integer v) {
        messageIndex = v;
    }

    public String getAgentId() {
        return agentId;
    }

    public void setAgentId(String v) {
        agentId = v;
    }

    public String getRating() {
        return rating;
    }

    public void setRating(String v) {
        rating = v;
    }

    public String getComment() {
        return comment;
    }

    public void setComment(String v) {
        comment = v;
    }

    public String getMessageContent() {
        return messageContent;
    }

    public void setMessageContent(String v) {
        messageContent = v;
    }

    public String getUserMessage() {
        return userMessage;
    }

    public void setUserMessage(String v) {
        userMessage = v;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String v) {
        source = v;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String v) {
        userId = v;
    }

    public String getReasonCode() {
        return reasonCode;
    }

    public void setReasonCode(String v) {
        reasonCode = v;
    }

    public String getReasonText() {
        return reasonText;
    }

    public void setReasonText(String v) {
        reasonText = v;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String v) {
        status = v;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant v) {
        createdAt = v;
    }

    public Instant getRatedAt() {
        return ratedAt;
    }

    public void setRatedAt(Instant v) {
        ratedAt = v;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant v) {
        updatedAt = v;
    }
}
