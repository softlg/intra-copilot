package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;

/** Pointer to the original bytes of an uploaded document. */
@TableName("knowledge_document_storage")
public class KnowledgeDocumentStorage {
    @TableId private String documentId;
    private String storageBackend = "local";
    private String storageKey;
    private String sha256;
    private Long byteSize;
    private Instant uploadedAt = Instant.now();

    public String getDocumentId() {
        return documentId;
    }

    public void setDocumentId(String value) {
        documentId = value;
    }

    public String getStorageBackend() {
        return storageBackend;
    }

    public void setStorageBackend(String value) {
        storageBackend = value;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public void setStorageKey(String value) {
        storageKey = value;
    }

    public String getSha256() {
        return sha256;
    }

    public void setSha256(String value) {
        sha256 = value;
    }

    public Long getByteSize() {
        return byteSize;
    }

    public void setByteSize(Long value) {
        byteSize = value;
    }

    public Instant getUploadedAt() {
        return uploadedAt;
    }

    public void setUploadedAt(Instant value) {
        uploadedAt = value;
    }
}
