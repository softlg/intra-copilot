package com.intra.copilot.service;

import java.util.ArrayList;
import java.util.List;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Embedding gateway backed by Spring AI's provider-neutral EmbeddingModel. */
@Service
public class EmbeddingClient {
    private final EmbeddingModel embeddingModel;
    private final int dimension;
    private final String apiKey;

    public EmbeddingClient(
            EmbeddingModel embeddingModel,
            @Value("${spring.ai.openai.embedding.api-key:${spring.ai.openai.api-key:}}") String apiKey,
            @Value("${embedding.dimension:1536}") int dimension) {
        this.embeddingModel = embeddingModel;
        this.apiKey = apiKey;
        this.dimension = dimension;
    }

    public List<Double> embed(String text) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("未配置 EMBEDDING_API_KEY 或 LLM_API_KEY");
        }
        float[] values = embeddingModel.embed(text == null ? "" : text);
        if (values == null || values.length == 0) {
            throw new IllegalStateException("Embedding 服务返回空向量");
        }
        if (values.length != dimension) {
            throw new IllegalStateException("Embedding 维度不匹配：期望 " + dimension + "，实际 " + values.length);
        }
        List<Double> vector = new ArrayList<>(values.length);
        for (float value : values) vector.add((double) value);
        return vector;
    }

    public static String literal(List<Double> vector) {
        return vector.toString();
    }
}
