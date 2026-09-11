package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.util.EntityIdGenerator;
import java.time.Instant;

@TableName("message")
public class Message {
    @TableId private String id = EntityIdGenerator.next("MS");
    private String conversationId;
    private String role;
    private String content;
    private String agentId;
    private String contextSummary;
    private Instant createdAt = Instant.now();

    public Message() {}

    public Message(String c, String r, String content, String a, String ctx) {
        conversationId = c;
        role = r;
        this.content = content;
        agentId = a;
        contextSummary = ctx;
    }

    public String getId() {
        return id;
    }

    public String getConversationId() {
        return conversationId;
    }

    public String getRole() {
        return role;
    }

    public String getContent() {
        return content;
    }

    public String getAgentId() {
        return agentId;
    }

    public String getContextSummary() {
        return contextSummary;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
