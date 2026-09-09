package com.intra.copilot.service;

import org.springframework.stereotype.Component;

/**
 * Maps an embedding dimension to the physical vector table that stores it.
 *
 * <p>V3 created a single {@code document_chunk.embedding vector(1536)} column; V18 added
 * per-dimension tables so a base can switch profiles. Both the write path (indexing)
 * and the read path (search) must agree on the mapping, hence the shared component.
 */
@Component
public class EmbeddingSchema {

    public boolean supports(int dimension) {
        return dimension == 1024 || dimension == 1536 || dimension == 3072;
    }

    public String tableFor(int dimension) {
        return switch (dimension) {
            case 1024 -> "document_chunk_embedding_1024";
            case 1536 -> "document_chunk_embedding_1536";
            case 3072 -> "document_chunk_embedding_3072";
            default -> throw new IllegalArgumentException("暂不支持的 Embedding 维度：" + dimension + "，请先添加对应数据库迁移");
        };
    }

    /**
     * 3072 维使用 halfvec：pgvector 0.8.0 的 HNSW 索引对 vector 的硬上限是 2000 维，
     * halfvec 放宽到 4000 维，其余维度仍用 vector。
     */
    public String castFor(int dimension) {
        return dimension == 3072 ? "?::halfvec" : "?::vector";
    }
}
