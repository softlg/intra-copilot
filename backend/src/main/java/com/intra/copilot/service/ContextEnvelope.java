package com.intra.copilot.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Bounded, explicit context passed between orchestration nodes.  Page text and
 * retrieved documents are treated as untrusted data by callers and are
 * truncated before being placed in prompts or logs.
 */
public record ContextEnvelope(
        String correlationId,
        String conversationId,
        String parentInvocationId,
        String message,
        List<Map<String, String>> history,
        String pageContext,
        List<String> retrievalSources,
        Map<String, Boolean> permissions,
        int remainingTokens,
        int depth) {
    public static final int MAX_MESSAGE_CHARS = 16_000;
    public static final int MAX_PAGE_CONTEXT_CHARS = 24_000;

    public ContextEnvelope {
        correlationId = correlationId == null || correlationId.isBlank()
                ? UUID.randomUUID().toString() : correlationId;
        message = limit(message, MAX_MESSAGE_CHARS);
        pageContext = limit(pageContext, MAX_PAGE_CONTEXT_CHARS);
        history = history == null ? List.of() : List.copyOf(history);
        retrievalSources = retrievalSources == null ? List.of() : List.copyOf(retrievalSources);
        permissions = permissions == null ? Map.of() : Map.copyOf(permissions);
        remainingTokens = Math.max(0, remainingTokens);
        depth = Math.max(0, depth);
    }

    private static String limit(String value, int max) {
        if (value == null) return "";
        return value.length() <= max ? value : value.substring(0, max) + "\n[内容已截断]";
    }
}
