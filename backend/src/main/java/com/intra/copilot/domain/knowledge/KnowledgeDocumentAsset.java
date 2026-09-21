package com.intra.copilot.domain.knowledge;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.JsonNode;
import com.intra.copilot.shared.persistence.PostgresJsonNodeTypeHandler;
import com.intra.copilot.shared.util.EntityIdGenerator;
import java.time.Instant;
import org.apache.ibatis.type.JdbcType;

@TableName("knowledge_document_asset")
public class KnowledgeDocumentAsset {
    @TableId private String id = EntityIdGenerator.next("AS");
    private String documentId;
    private String assetKind;
    private String name;
    private String mediaType;
    private String storageBackend;
    private String storageKey;
    private String sha256;
    private Long byteSize;
    private Integer pageNumber;
    private String sectionPath;
    private String extractedText;
    private String jobId;

    @TableField(typeHandler = PostgresJsonNodeTypeHandler.class, jdbcType = JdbcType.OTHER)
    private JsonNode metadata;

    private Instant createdAt = Instant.now();

    public String getId() {
        return id;
    }

    public void setId(String value) {
        id = value;
    }

    public String getDocumentId() {
        return documentId;
    }

    public void setDocumentId(String value) {
        documentId = value;
    }

    public String getAssetKind() {
        return assetKind;
    }

    public void setAssetKind(String value) {
        assetKind = value;
    }

    public String getName() {
        return name;
    }

    public void setName(String value) {
        name = value;
    }

    public String getMediaType() {
        return mediaType;
    }

    public void setMediaType(String value) {
        mediaType = value;
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

    public Integer getPageNumber() {
        return pageNumber;
    }

    public void setPageNumber(Integer value) {
        pageNumber = value;
    }

    public String getSectionPath() {
        return sectionPath;
    }

    public void setSectionPath(String value) {
        sectionPath = value;
    }

    public String getExtractedText() {
        return extractedText;
    }

    public void setExtractedText(String value) {
        extractedText = value;
    }

    public String getJobId() {
        return jobId;
    }

    public void setJobId(String value) {
        jobId = value;
    }

    public JsonNode getMetadata() {
        return metadata;
    }

    public void setMetadata(JsonNode value) {
        metadata = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
