package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.util.EntityIdGenerator;
import java.time.Instant;

@TableName("admin_copilot_message")
public class AdminCopilotMessage {
    @TableId private String id = EntityIdGenerator.next("CM");
    private String sessionId;
    private String role;
    private String content;
    private String payloadJson;
    private String model;
    private Instant createdAt = Instant.now();

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

    public String getRole() {
        return role;
    }

    public void setRole(String value) {
        role = value;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String value) {
        content = value;
    }

    public String getPayloadJson() {
        return payloadJson;
    }

    public void setPayloadJson(String value) {
        payloadJson = value;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String value) {
        model = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant value) {
        createdAt = value;
    }
}
