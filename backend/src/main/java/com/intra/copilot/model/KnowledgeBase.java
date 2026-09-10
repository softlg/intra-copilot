package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;
import java.util.UUID;

@TableName("knowledge_base")
public class KnowledgeBase {
    public static final String STATUS_READY = "READY";
    public static final String STATUS_REBUILDING = "REBUILDING";

    @TableId private String id = UUID.randomUUID().toString();
    private String name;
    private String description;
    private boolean enabled = true;
    private String embeddingProfileId;
    private Boolean useSystemEmbedding = true;
    private String embeddingProvider;
    private String embeddingModel;
    private Integer embeddingDimension;
    private String createdBy;
    private String updatedBy;
    private String status = "READY";
    private String chunkStrategy = "structured";
    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();

    public KnowledgeBase() {}

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getEmbeddingProfileId() { return embeddingProfileId; }
    public void setEmbeddingProfileId(String value) { embeddingProfileId = value; }

    public Boolean getUseSystemEmbedding() { return useSystemEmbedding; }
    public void setUseSystemEmbedding(Boolean value) { useSystemEmbedding = value; }

    public String getEmbeddingProvider() { return embeddingProvider; }
    public void setEmbeddingProvider(String value) { embeddingProvider = value; }

    public String getEmbeddingModel() { return embeddingModel; }
    public void setEmbeddingModel(String value) { embeddingModel = value; }

    public Integer getEmbeddingDimension() { return embeddingDimension; }
    public void setEmbeddingDimension(Integer value) { embeddingDimension = value; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String value) { createdBy = value; }

    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String value) { updatedBy = value; }

    public String getStatus() { return status; }
    public void setStatus(String value) { status = value; }

    public String getChunkStrategy() { return chunkStrategy; }
    public void setChunkStrategy(String value) { chunkStrategy = value; }

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
