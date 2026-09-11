package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.util.EntityIdGenerator;
import java.time.Instant;

/** Append-only record of knowledge base maintenance actions. */
@TableName("knowledge_audit_log")
public class KnowledgeAuditLog {
    public static final String ACTION_UPLOAD = "UPLOAD";
    public static final String ACTION_REINDEX = "REINDEX";
    public static final String ACTION_REBUILD_BASE = "REBUILD_BASE";
    public static final String ACTION_DELETE_DOC = "DELETE_DOC";
    public static final String ACTION_DELETE_BASE = "DELETE_BASE";
    public static final String ACTION_PROFILE_CHANGE = "PROFILE_CHANGE";
    public static final String ACTION_CREATE_BASE = "CREATE_BASE";
    public static final String ACTION_UPDATE_BASE = "UPDATE_BASE";

    @TableId private String id = EntityIdGenerator.next("AL");
    private String knowledgeBaseId;
    private String documentId;
    private String actor = "system";
    private String action;
    private String detail;
    private Instant createdAt = Instant.now();

    public String getId() {
        return id;
    }

    public void setId(String value) {
        id = value;
    }

    public String getKnowledgeBaseId() {
        return knowledgeBaseId;
    }

    public void setKnowledgeBaseId(String value) {
        knowledgeBaseId = value;
    }

    public String getDocumentId() {
        return documentId;
    }

    public void setDocumentId(String value) {
        documentId = value;
    }

    public String getActor() {
        return actor;
    }

    public void setActor(String value) {
        actor = value;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String value) {
        action = value;
    }

    public String getDetail() {
        return detail;
    }

    public void setDetail(String value) {
        detail = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant value) {
        createdAt = value;
    }
}
