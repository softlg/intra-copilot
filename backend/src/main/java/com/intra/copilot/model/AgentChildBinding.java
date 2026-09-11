package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.util.EntityIdGenerator;
import java.time.Instant;

@TableName("agent_child_binding")
public class AgentChildBinding {
    @TableId private String id = EntityIdGenerator.next("AB");
    private String parentAgentId;
    private String childAgentId;
    private int priority = 100;
    private String routingRule;
    private boolean enabled = true;
    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();

    public String getId() { return id; }
    public void setId(String value) { id = value; }
    public String getParentAgentId() { return parentAgentId; }
    public void setParentAgentId(String value) { parentAgentId = value; }
    public String getChildAgentId() { return childAgentId; }
    public void setChildAgentId(String value) { childAgentId = value; }
    public int getPriority() { return priority; }
    public void setPriority(int value) { priority = value; }
    public String getRoutingRule() { return routingRule; }
    public void setRoutingRule(String value) { routingRule = value; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean value) { enabled = value; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void touch() { updatedAt = Instant.now(); }
}
