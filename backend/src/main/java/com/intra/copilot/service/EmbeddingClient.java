package com.intra.copilot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.EmbeddingProfile;
import java.util.ArrayList;
import java.util.List;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/** OpenAI-compatible embedding gateway with per-profile model selection. */
@Service
public class EmbeddingClient {
    private final ObjectMapper json;
    private final Environment environment;
    private final EmbeddingProfileService profiles;

    public EmbeddingClient(ObjectMapper json, Environment environment, EmbeddingProfileService profiles) {
        this.json = json; this.environment = environment; this.profiles = profiles;
    }
    public List<Double> embed(String text) { return embed(text, profiles.builtInDefault()); }
    public List<Double> embed(String text, EmbeddingProfile profile) {
        String prefix = "embedding.providers." + profile.getProvider();
        String baseUrl = environment.getProperty(prefix + ".base-url", environment.getProperty("spring.ai.openai.embedding.base-url", "https://api.openai.com/v1"));
        String apiKey = environment.getProperty(prefix + ".api-key", environment.getProperty("spring.ai.openai.embedding.api-key", environment.getProperty("spring.ai.openai.api-key", "")));
        String path = environment.getProperty(prefix + ".path", environment.getProperty("spring.ai.openai.embedding.embeddings-path", "/embeddings"));
        try {
            String body = json.createObjectNode().put("model", profile.getModel()).put("input", text == null ? "" : text).toString();
            String response = RestClient.builder().baseUrl(baseUrl).build().post().uri(path).header("Authorization", "Bearer " + apiKey).header("Content-Type", "application/json").body(body).retrieve().body(String.class);
            JsonNode values = json.readTree(response).path("data").path(0).path("embedding");
            if (!values.isArray() || values.isEmpty()) throw new IllegalStateException("Embedding 服务返回空向量");
            if (values.size() != profile.getDimension()) throw new IllegalStateException("Embedding 维度不匹配：配置 " + profile.getDimension() + "，实际 " + values.size());
            List<Double> result = new ArrayList<>(values.size()); values.forEach(value -> result.add(value.asDouble())); return result;
        } catch (Exception error) {
            if (error instanceof IllegalStateException) throw (IllegalStateException) error;
            throw new IllegalStateException("Embedding 配置「" + profile.getName() + "」调用失败：" + error.getMessage(), error);
        }
    }
    public static String literal(List<Double> vector) { return vector.toString(); }
}
