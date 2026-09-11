package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.util.EntityIdGenerator;
import java.time.Instant;

@TableName("knowledge_document")
public class KnowledgeDocument {
    @TableId private String id = EntityIdGenerator.next("DC");
    private String knowledgeBaseId;
    private String filename;
    private String mediaType;
    private String status = "PENDING";
    private String content;
    private String error;
    private String fileHash;
    private Long sizeBytes;
    private String createdBy;
    private String updatedBy;
    private String sourceUrl;
    private Integer version = 1;
    private String parser;
    private String chunkStrategy;
    private String embeddingModel;
    private Integer embeddingDimension;
    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();

    public String getId() {
        return id;
    }

    public String getKnowledgeBaseId() {
        return knowledgeBaseId;
    }

    public void setKnowledgeBaseId(String value) {
        knowledgeBaseId = value;
    }

    public String getFilename() {
        return filename;
    }

    public void setFilename(String value) {
        filename = value;
    }

    public String getMediaType() {
        return mediaType;
    }

    public void setMediaType(String value) {
        mediaType = value;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String value) {
        status = value;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String value) {
        content = value;
    }

    public String getError() {
        return error;
    }

    public void setError(String value) {
        error = value;
    }

    public String getFileHash() {
        return fileHash;
    }

    public void setFileHash(String value) {
        fileHash = value;
    }

    public Long getSizeBytes() {
        return sizeBytes;
    }

    public void setSizeBytes(Long value) {
        sizeBytes = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(String value) {
        createdBy = value;
    }

    public String getUpdatedBy() {
        return updatedBy;
    }

    public void setUpdatedBy(String value) {
        updatedBy = value;
    }

    public String getSourceUrl() {
        return sourceUrl;
    }

    public void setSourceUrl(String value) {
        sourceUrl = value;
    }

    public Integer getVersion() {
        return version;
    }

    public void setVersion(Integer value) {
        version = value;
    }

    public String getParser() {
        return parser;
    }

    public void setParser(String value) {
        parser = value;
    }

    public String getChunkStrategy() {
        return chunkStrategy;
    }

    public void setChunkStrategy(String value) {
        chunkStrategy = value;
    }

    public String getEmbeddingModel() {
        return embeddingModel;
    }

    public void setEmbeddingModel(String value) {
        embeddingModel = value;
    }

    public Integer getEmbeddingDimension() {
        return embeddingDimension;
    }

    public void setEmbeddingDimension(Integer value) {
        embeddingDimension = value;
    }

    public void touch() {
        updatedAt = Instant.now();
    }
}
