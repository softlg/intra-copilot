package com.intra.copilot.domain.agent;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.shared.util.EntityIdGenerator;
import java.time.Instant;

@TableName("browser_task_event")
public class BrowserTaskEvent {
    @TableId("event_id")
    private String eventId = EntityIdGenerator.next("BE");

    private String taskId;
    private int sequenceNo;
    private String eventType;
    private String status;
    private String payload = "{}";
    private Instant createdAt = Instant.now();

    public String getEventId() {
        return eventId;
    }

    public void setEventId(String value) {
        eventId = value;
    }

    public String getTaskId() {
        return taskId;
    }

    public void setTaskId(String value) {
        taskId = value;
    }

    public int getSequenceNo() {
        return sequenceNo;
    }

    public void setSequenceNo(int value) {
        sequenceNo = value;
    }

    public String getEventType() {
        return eventType;
    }

    public void setEventType(String value) {
        eventType = value;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String value) {
        status = value;
    }

    public String getPayload() {
        return payload;
    }

    public void setPayload(String value) {
        payload = value == null || value.isBlank() ? "{}" : value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
