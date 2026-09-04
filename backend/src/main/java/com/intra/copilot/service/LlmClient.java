package com.intra.copilot.service;

import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
public class LlmClient {
  private final WebClient client;
  private final String model;
  private final String key;

  public LlmClient(
      @Value("${llm.base-url}") String base,
      @Value("${llm.model}") String model,
      @Value("${llm.api-key:}") String key) {
    this.model = model;
    this.key = key;
    this.client = WebClient.builder().baseUrl(base).build();
  }

  public Flux<String> stream(String system, List<Map<String, String>> history, String user) {
    List<Map<String, String>> messages = new ArrayList<>();
    messages.add(Map.of("role", "system", "content", system));
    messages.addAll(history);
    messages.add(Map.of("role", "user", "content", user));
    Map<String, Object> body = new HashMap<>();
    body.put("model", model);
    body.put("messages", messages);
    body.put("stream", true);
    body.put("temperature", 0.2);
    if (key == null || key.isBlank())
      return Flux.just("[未配置 LLM_API_KEY] 后端已启用，请配置 OpenAI 兼容模型后重试。");
    return client
        .post()
        .uri("/chat/completions")
        .contentType(MediaType.APPLICATION_JSON)
        .headers(h -> h.setBearerAuth(key))
        .bodyValue(body)
        .retrieve()
        .bodyToFlux(String.class)
        .map(this::extract)
        .filter(s -> !s.isBlank())
        .onErrorResume(e -> Flux.just("模型请求失败：" + e.getMessage()));
  }

  public Mono<String> complete(String system, List<Map<String, String>> history, String user) {
    List<Map<String, String>> messages = new ArrayList<>();
    messages.add(Map.of("role", "system", "content", system));
    messages.addAll(history);
    messages.add(Map.of("role", "user", "content", user));
    Map<String, Object> body = new HashMap<>();
    body.put("model", model);
    body.put("messages", messages);
    body.put("stream", false);
    body.put("temperature", 0.0);
    if (key == null || key.isBlank()) return Mono.empty();
    return client
        .post()
        .uri("/chat/completions")
        .contentType(MediaType.APPLICATION_JSON)
        .headers(h -> h.setBearerAuth(key))
        .bodyValue(body)
        .retrieve()
        .bodyToMono(String.class)
        .map(this::extractFullContent)
        .filter(s -> !s.isBlank())
        .onErrorResume(e -> Mono.empty());
  }

  private String extractFullContent(String raw) {
    try {
      int marker = raw.indexOf("\"content\":");
      if (marker < 0) return "";
      int start = raw.indexOf('"', marker + 10);
      if (start < 0) return "";
      StringBuilder value = new StringBuilder();
      boolean escaped = false;
      for (int i = start + 1; i < raw.length(); i++) {
        char current = raw.charAt(i);
        if (escaped) {
          value.append(switch (current) {
            case 'n' -> '\n';
            case 'r' -> '\r';
            case 't' -> '\t';
            default -> current;
          });
          escaped = false;
        } else if (current == '\\') {
          escaped = true;
        } else if (current == '"') {
          break;
        } else {
          value.append(current);
        }
      }
      return value.toString();
    } catch (Exception ignored) {
      return "";
    }
  }

  private String extract(String raw) {
    try {
      int i = raw.indexOf("\"content\":\"");
      if (i < 0) return "";
      String s = raw.substring(i + 11);
      int end = s.indexOf('"');
      return s.substring(0, end).replace("\\n", "\n").replace("\\\"", "\"");
    } catch (Exception e) {
      return "";
    }
  }
}
