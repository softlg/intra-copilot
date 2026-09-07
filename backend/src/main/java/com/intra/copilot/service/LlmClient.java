package com.intra.copilot.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.content.Media;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.MimeTypeUtils;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Spring AI backed model gateway shared by routing and all agents. */
@Service
public class LlmClient {
  private final ChatModel chatModel;
  private final String apiKey;

  public LlmClient(ChatModel chatModel, @Value("${spring.ai.openai.api-key:}") String apiKey) {
    this.chatModel = chatModel;
    this.apiKey = apiKey;
  }

  public Flux<String> stream(String system, List<Map<String, String>> history, String user) {
    return stream(system, history, user, List.of());
  }

  public Flux<String> stream(
      String system, List<Map<String, String>> history, String user, List<String> images) {
    if (apiKey == null || apiKey.isBlank()) {
      return Flux.just("[未配置 LLM_API_KEY] 后端已启用，请配置 OpenAI 兼容模型后重试。");
    }
    try {
      return chatModel
          .stream(new Prompt(messages(system, history, user, images)))
          .map(this::textOf)
          .filter(text -> text != null && !text.isBlank())
          .onErrorResume(error -> Flux.just("模型请求失败：" + safeMessage(error)));
    } catch (Exception error) {
      return Flux.just("模型请求失败：" + safeMessage(error));
    }
  }

  public Mono<String> complete(String system, List<Map<String, String>> history, String user) {
    if (apiKey == null || apiKey.isBlank()) return Mono.empty();
    return Mono.fromCallable(
            () ->
                chatModel.call(
                    new Prompt(
                        messages(system, history, user, List.of()),
                        OpenAiChatOptions.builder().temperature(0.0).build())))
        .map(this::textOf)
        .filter(text -> text != null && !text.isBlank())
        .onErrorResume(error -> Mono.empty());
  }

  private List<Message> messages(
      String system, List<Map<String, String>> history, String user, List<String> images) {
    List<Message> messages = new ArrayList<>();
    messages.add(new SystemMessage(system == null ? "" : system));
    if (history != null) {
      for (Map<String, String> item : history) {
        String role = item.getOrDefault("role", "user");
        String content = item.getOrDefault("content", "");
        messages.add(
            "assistant".equals(role) ? new AssistantMessage(content) : new UserMessage(content));
      }
    }
    String prompt = user == null ? "" : user;
    if (images == null || images.isEmpty()) {
      messages.add(new UserMessage(prompt));
    } else {
      List<Media> media = new ArrayList<>();
      for (String image : images) {
        if (image == null || !image.startsWith("data:image/")) continue;
        int separator = image.indexOf(';');
        String mime = separator > 0 ? image.substring(5, separator) : "image/png";
        try {
          media.add(
              Media.builder()
                  .mimeType(MimeTypeUtils.parseMimeType(mime))
                  .data(java.net.URI.create(image))
                  .build());
        } catch (IllegalArgumentException ignored) {
          // Ignore malformed image data and keep the text prompt usable.
        }
      }
      messages.add(
          media.isEmpty()
              ? new UserMessage(prompt)
              : UserMessage.builder().text(prompt).media(media).build());
    }
    return messages;
  }

  private String safeMessage(Throwable error) {
    return error.getMessage() == null || error.getMessage().isBlank()
        ? error.getClass().getSimpleName()
        : error.getMessage();
  }

  private String textOf(ChatResponse response) {
    if (response == null
        || response.getResult() == null
        || response.getResult().getOutput() == null) {
      return "";
    }
    String text = response.getResult().getOutput().getText();
    return text == null ? "" : text;
  }
}
