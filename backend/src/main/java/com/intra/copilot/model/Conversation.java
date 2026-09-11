package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.util.EntityIdGenerator;
import java.time.Instant;

@TableName("conversation")
public class Conversation {
    @TableId private String id = EntityIdGenerator.next("SS");
    private String title = "新会话";
    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();
    private Long sortOrder;
    private String source = "extension";
    private String userId = "anonymous";

    public String getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String v) {
        title = v;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void touch() {
        updatedAt = Instant.now();
    }

    public Long getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(Long v) {
        sortOrder = v;
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
}
