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
            // 不再用 onErrorResume 把异常吞成普通 token——那样会被当成正常回答渲染并落库。
            // 异常直接向上传播，由 ChatService 的订阅 error 回调发送 SSE error 事件并标记 invocation FAILED。
            return chatModel
                    .stream(new Prompt(messages(system, history, user, images)))
                    .map(this::textOf)
                    .filter(text -> text != null && !text.isBlank());
        } catch (Exception error) {
            return Flux.error(error);
        }
    }

    /**
     * Requests a complete answer through the streaming endpoint and aggregates the chunks.
     * Some OpenAI-compatible gateways reject non-streaming requests, even for short router calls.
     */
    public Mono<String> complete(String system, List<Map<String, String>> history, String user) {
        return complete(system, history, user, List.of());
    }

    /**
     * Non-streaming aggregation variant that can also attach images (used by the first turn of the
     * agent ReAct loop, where the user message may carry multimodal attachments).
     * 与 stream() 一致：模型/网关异常直接向上传播，由调用方（路由降级或 SSE error 事件）处理，
     * 不再用 onErrorResume 把异常吞成空串。
     */
    public Mono<String> complete(
            String system, List<Map<String, String>> history, String user, List<String> images) {
        if (apiKey == null || apiKey.isBlank()) return Mono.empty();
        return chatModel
                .stream(new Prompt(messages(system, history, user, images == null ? List.of() : images)))
                .map(this::textOf)
                .filter(text -> text != null && !text.isBlank())
                .collectList()
                .map(parts -> String.join("", parts))
                .filter(text -> !text.isBlank());
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
        // 当 prompt 为空（调用方已把用户消息放进 history）时不追加空 UserMessage，
        // 否则部分 OpenAI 兼容网关会对空 content 报错。
        if (prompt.isBlank()) {
            return messages;
        }
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
