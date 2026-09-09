package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;
import java.util.UUID;

/**
 * A unit of background work for the knowledge base pipeline.
 *
 * <p>Status transitions: {@code QUEUED -> RUNNING -> SUCCEEDED | FAILED}. A failing job
 * goes back to {@code QUEUED} (with {@code next_attempt_at} set) until {@code attempt}
 * reaches {@code max_attempts}, at which point it becomes {@code DEAD}. {@code WAITING}
 * is used by a REBUILD_BASE parent job while its per-document children are still
 * running.
 */
@TableName("indexing_job")
public class IndexingJob {
    public static final String STATUS_QUEUED = "QUEUED";
    public static final String STATUS_RUNNING = "RUNNING";
    public static final String STATUS_WAITING = "WAITING";
    public static final String STATUS_SUCCEEDED = "SUCCEEDED";
    public static final String STATUS_FAILED = "FAILED";
    public static final String STATUS_DEAD = "DEAD";

    public static final String TYPE_PARSE = "PARSE";
    public static final String TYPE_REINDEX = "REINDEX";
    public static final String TYPE_REBUILD_BASE = "REBUILD_BASE";

    @TableId private String id = UUID.randomUUID().toString();
    private String parentId;
    private String documentId;
    private String knowledgeBaseId;
    private String jobType = TYPE_PARSE;
    private String status = STATUS_QUEUED;
    private int progress;
    private int attempt;
    private int maxAttempts = 3;
    private String error;
    private String payload;
    private String workerId;
    private Instant nextAttemptAt;
    private Instant createdAt = Instant.now();
    private Instant startedAt;
    private Instant finishedAt;

    public String getId() {
        return id;
    }

    public void setId(String value) {
        id = value;
    }

    public String getParentId() {
        return parentId;
    }

    public void setParentId(String value) {
        parentId = value;
    }

    public String getDocumentId() {
        return documentId;
    }

    public void setDocumentId(String value) {
        documentId = value;
    }

    public String getKnowledgeBaseId() {
        return knowledgeBaseId;
    }

    public void setKnowledgeBaseId(String value) {
        knowledgeBaseId = value;
    }

    public String getJobType() {
        return jobType;
    }

    public void setJobType(String value) {
        jobType = value;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String value) {
        status = value;
    }

    public int getProgress() {
        return progress;
    }

    public void setProgress(int value) {
        progress = Math.max(0, Math.min(100, value));
    }

    public int getAttempt() {
        return attempt;
    }

    public void setAttempt(int value) {
        attempt = value;
    }

    public int getMaxAttempts() {
        return maxAttempts;
    }

    public void setMaxAttempts(int value) {
        maxAttempts = value;
    }

    public String getError() {
        return error;
    }

    public void setError(String value) {
        error = value;
    }

    public String getPayload() {
        return payload;
    }

    public void setPayload(String value) {
        payload = value;
    }

    public String getWorkerId() {
        return workerId;
    }

    public void setWorkerId(String value) {
        workerId = value;
    }

    public Instant getNextAttemptAt() {
        return nextAttemptAt;
    }

    public void setNextAttemptAt(Instant value) {
        nextAttemptAt = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant value) {
        createdAt = value;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(Instant value) {
        startedAt = value;
    }

    public Instant getFinishedAt() {
        return finishedAt;
    }

    public void setFinishedAt(Instant value) {
        finishedAt = value;
    }

    public boolean isActive() {
        return STATUS_QUEUED.equals(status) || STATUS_RUNNING.equals(status) || STATUS_WAITING.equals(status);
    }
}
