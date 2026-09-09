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
    private final EmbeddingRateLimiter rateLimiter;

    public EmbeddingClient(ObjectMapper json, Environment environment, EmbeddingProfileService profiles,
            EmbeddingRateLimiter rateLimiter) {
        this.json = json; this.environment = environment; this.profiles = profiles; this.rateLimiter = rateLimiter;
    }
    public List<Double> embed(String text) { return embed(text, profiles.builtInDefault()); }
    public List<Double> embed(String text, EmbeddingProfile profile) {
        rateLimiter.acquire(profile.getProvider());
        int maxAttempts = Math.max(1, environment.getProperty("embedding.max-attempts", Integer.class, 3));
        long backoffMs = Math.max(200, environment.getProperty("embedding.retry-backoff-ms", Long.class, 1000L));
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return call(text, profile);
            } catch (RetryableEmbeddingException retryable) {
                if (attempt == maxAttempts) {
                    throw new IllegalStateException("Embedding 配置「" + profile.getName() + "」重试 " + maxAttempts + " 次后仍失败：" + retryable.getMessage(), retryable);
                }
                sleep(Math.min(30_000L, backoffMs));
                backoffMs = Math.min(30_000L, backoffMs * 2);
            }
        }
        throw new IllegalStateException("Embedding 调用失败：" + profile.getName());
    }

    private void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Embedding 重试被中断", e);
        }
    }

    /** Signals a transient failure that is worth retrying (throttling, 5xx, network). */
    private static class RetryableEmbeddingException extends RuntimeException {
        RetryableEmbeddingException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    private List<Double> call(String text, EmbeddingProfile profile) {
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
        } catch (IllegalStateException error) {
            // Dimension mismatch, empty vector: retrying cannot fix a configuration problem.
            throw error;
        } catch (org.springframework.web.client.RestClientResponseException error) {
            int status = error.getStatusCode().value();
            boolean retryable = status == 408 || status == 409 || status == 425 || status == 429 || status >= 500;
            if (retryable) throw new RetryableEmbeddingException("HTTP " + status + " " + error.getMessage(), error);
            throw new IllegalStateException("Embedding 配置「" + profile.getName() + "」调用失败：HTTP " + status, error);
        } catch (org.springframework.web.client.ResourceAccessException error) {
            throw new RetryableEmbeddingException(error.getMessage(), error);
        } catch (Exception error) {
            throw new IllegalStateException("Embedding 配置「" + profile.getName() + "」调用失败：" + error.getMessage(), error);
        }
    }
    public static String literal(List<Double> vector) { return vector.toString(); }
}
