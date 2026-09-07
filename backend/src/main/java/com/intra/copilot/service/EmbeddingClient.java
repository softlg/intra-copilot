package com.intra.copilot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

@Service
public class EmbeddingClient {
  private final WebClient client;
  private final String model;
  private final String key;
  private final int dimension;
  private final ObjectMapper json = new ObjectMapper();

  public EmbeddingClient(
      @Value("${embedding.base-url}") String base,
      @Value("${embedding.model}") String model,
      @Value("${embedding.api-key:}") String key,
      @Value("${embedding.dimension:1536}") int dimension) {
    this.client = WebClient.builder().baseUrl(base).build();
    this.model = model;
    this.key = key;
    this.dimension = dimension;
  }

  public List<Double> embed(String text) {
    if (key == null || key.isBlank()) throw new IllegalStateException("未配置 EMBEDDING_API_KEY");
    String raw =
        client
            .post()
            .uri("/embeddings")
            .contentType(MediaType.APPLICATION_JSON)
            .headers(headers -> headers.setBearerAuth(key))
            .bodyValue(java.util.Map.of("model", model, "input", text))
            .retrieve()
            .bodyToMono(String.class)
            .block(java.time.Duration.ofSeconds(30));
    try {
      JsonNode values = json.readTree(raw).path("data").path(0).path("embedding");
      List<Double> vector = new ArrayList<>();
      values.forEach(value -> vector.add(value.asDouble()));
      if (vector.isEmpty()) throw new IllegalStateException("Embedding 服务返回空向量");
      if (vector.size() != dimension) throw new IllegalStateException("Embedding 维度不匹配：期望 " + dimension + "，实际 " + vector.size());
      return vector;
    } catch (Exception error) {
      throw new IllegalStateException("无法解析 Embedding 响应", error);
    }
  }

  public static String literal(List<Double> vector) {
    return vector.toString();
  }
}
