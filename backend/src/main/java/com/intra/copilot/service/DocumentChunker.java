package com.intra.copilot.service;

import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Splits parsed text into chunks.
 *
 * <p>The strategy id is stored on every chunk so a future strategy can coexist with
 * existing data, and so stale chunks can be identified after a strategy change.
 */
@Component
public class DocumentChunker {

    public static final String STRATEGY_STRUCTURED = "structured";

    private final int chunkSize;
    private final int chunkOverlap;

    public DocumentChunker(
            @Value("${rag.chunk-size:1200}") int chunkSize,
            @Value("${rag.chunk-overlap:200}") int chunkOverlap) {
        this.chunkSize = Math.max(200, chunkSize);
        this.chunkOverlap = Math.max(0, Math.min(this.chunkSize / 2, chunkOverlap));
    }

    public List<String> split(String strategyId, String text) {
        if (text == null || text.isBlank()) return List.of();
        String resolved = strategyId == null || strategyId.isBlank() ? STRATEGY_STRUCTURED : strategyId;
        return switch (resolved) {
            case STRATEGY_STRUCTURED -> splitStructured(text);
            default -> splitStructured(text);
        };
    }

    public String defaultStrategy() {
        return STRATEGY_STRUCTURED;
    }

    private List<String> splitStructured(String text) {
        List<String> out = new ArrayList<>();
        String normalized = text.replace("\r\n", "\n").trim();
        if (normalized.isEmpty()) return out;
        String[] blocks = normalized.split("\\n(?=\\s*#{1,6}\\s+)|\\n\\s*\\n");
        StringBuilder current = new StringBuilder();
        for (String block : blocks) {
            String part = block.trim();
            if (part.isEmpty()) continue;
            if (current.length() > 0 && current.length() + part.length() + 2 > chunkSize) {
                out.add(current.toString());
                String overlap = current.substring(Math.max(0, current.length() - chunkOverlap));
                current = new StringBuilder(overlap);
            }
            if (current.length() > 0) current.append("\n\n");
            current.append(part);
        }
        if (current.length() > 0) out.add(current.toString());
        if (out.isEmpty()) out.add(normalized);
        return out;
    }
}
