package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;
import java.util.UUID;

@TableName("conversation")
public class Conversation {
  @TableId private String id = UUID.randomUUID().toString();
  private String title = "新会话";
  private Instant createdAt = Instant.now();
  private Instant updatedAt = Instant.now();

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
}
