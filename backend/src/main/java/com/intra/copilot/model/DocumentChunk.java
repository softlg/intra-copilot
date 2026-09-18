package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.JsonNode;
import com.intra.copilot.persistence.PostgresJsonNodeTypeHandler;
import com.intra.copilot.util.EntityIdGenerator;
import org.apache.ibatis.type.JdbcType;

@TableName("document_chunk")
public class DocumentChunk {
    @TableId private String id = EntityIdGenerator.next("CH");
    private String documentId;
    private int chunkIndex;
    private String content;
    private Integer pageNumber;
    private String sectionPath;
    private String blockType = "TEXT";

    @TableField(typeHandler = PostgresJsonNodeTypeHandler.class, jdbcType = JdbcType.OTHER)
    private JsonNode metadata;

    private Integer tokenCount;
    private String contentHash;
    private String embeddingModel;
    private Integer embeddingDimension;
    private String chunkStrategy;
    private String jobId;

    public String getId() {
        return id;
    }

    public String getDocumentId() {
        return documentId;
    }

    public void setDocumentId(String value) {
        documentId = value;
    }

    public int getChunkIndex() {
        return chunkIndex;
    }

    public void setChunkIndex(int value) {
        chunkIndex = value;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String value) {
        content = value;
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

    public String getBlockType() {
        return blockType;
    }

    public void setBlockType(String value) {
        blockType = value;
    }

    public JsonNode getMetadata() {
        return metadata;
    }

    public void setMetadata(JsonNode value) {
        metadata = value;
    }

    public Integer getTokenCount() {
        return tokenCount;
    }

    public void setTokenCount(Integer value) {
        tokenCount = value;
    }

    public String getContentHash() {
        return contentHash;
    }

    public void setContentHash(String value) {
        contentHash = value;
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

    public String getChunkStrategy() {
        return chunkStrategy;
    }

    public void setChunkStrategy(String value) {
        chunkStrategy = value;
    }

    public String getJobId() {
        return jobId;
    }

    public void setJobId(String value) {
        jobId = value;
    }
}
