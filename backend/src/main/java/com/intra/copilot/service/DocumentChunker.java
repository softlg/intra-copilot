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
    private final int maxTokens;

    public DocumentChunker(
            @Value("${rag.chunk-size:1200}") int chunkSize,
            @Value("${rag.chunk-overlap:200}") int chunkOverlap,
            @Value("${rag.chunk-max-tokens:800}") int maxTokens) {
        this.chunkSize = Math.max(200, chunkSize);
        this.chunkOverlap = Math.max(0, Math.min(this.chunkSize / 2, chunkOverlap));
        this.maxTokens = Math.max(64, maxTokens);
    }

    public List<String> split(String strategyId, String text) {
        return splitDetailed(strategyId, text).stream().map(Chunk::text).toList();
    }

    public List<Chunk> splitDetailed(String strategyId, String text) {
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

    private List<Chunk> splitStructured(String text) {
        List<Chunk> out = new ArrayList<>();
        String normalized = text.replace("\r\n", "\n").trim();
        if (normalized.isEmpty()) return out;
        String[] blocks = normalized.split("\\n(?=\\s*#{1,6}\\s+)|\\n\\s*\\n");
        StringBuilder current = new StringBuilder();
        int currentTokens = 0;
        for (String block : blocks) {
            String part = block.trim();
            if (part.isEmpty()) continue;
            int partTokens = estimateTokens(part);
            if (current.length() > 0
                    && (current.length() + part.length() + 2 > chunkSize
                            || currentTokens + partTokens > maxTokens)) {
                out.add(chunk(current.toString()));
                String overlap = current.substring(Math.max(0, current.length() - chunkOverlap));
                current = new StringBuilder(overlap);
                currentTokens = estimateTokens(overlap);
            }
            if (partTokens > maxTokens || part.length() > chunkSize) {
                if (current.length() > 0) {
                    out.add(chunk(current.toString()));
                    current.setLength(0);
                    currentTokens = 0;
                }
                for (String hardPart : splitOversized(part)) {
                    out.add(chunk(hardPart));
                }
                continue;
            }
            if (current.length() > 0) current.append("\n\n");
            current.append(part);
            currentTokens += partTokens;
        }
        if (current.length() > 0) out.add(chunk(current.toString()));
        if (out.isEmpty()) out.add(chunk(normalized));
        return out;
    }

    private List<String> splitOversized(String text) {
        List<String> out = new ArrayList<>();
        String remaining = text.trim();
        String overlap = "";
        while (!remaining.isEmpty()) {
            String candidate = overlap + remaining;
            int end = fittingEnd(candidate);
            if (end <= 0) end = Math.min(candidate.length(), 1);
            String part = candidate.substring(0, end).trim();
            if (!part.isEmpty()) out.add(part);
            if (end >= candidate.length()) break;
            int consumed = Math.max(1, end - overlap.length());
            remaining = remaining.substring(Math.min(consumed, remaining.length())).trim();
            overlap =
                    part.length() <= chunkOverlap
                            ? part
                            : part.substring(Math.max(0, part.length() - chunkOverlap));
            if (overlap.length() > 0 && estimateTokens(overlap) >= maxTokens) {
                overlap = "";
            }
        }
        return out;
    }

    private int fittingEnd(String text) {
        int low = 1;
        int high = text.length();
        int best = 0;
        while (low <= high) {
            int middle = (low + high) >>> 1;
            if (middle <= chunkSize && estimateTokens(text.substring(0, middle)) <= maxTokens) {
                best = middle;
                low = middle + 1;
            } else {
                high = middle - 1;
            }
        }
        if (best == text.length()) return best;
        int boundary = Math.max(
                Math.max(text.lastIndexOf('\n', best), text.lastIndexOf('。', best)),
                Math.max(text.lastIndexOf('.', best), text.lastIndexOf('；', best)));
        return boundary >= best / 2 ? boundary + 1 : best;
    }

    public int estimateTokens(String text) {
        if (text == null || text.isBlank()) return 0;
        int tokens = 0;
        int asciiRun = 0;
        for (int offset = 0; offset < text.length(); ) {
            int codePoint = text.codePointAt(offset);
            offset += Character.charCount(codePoint);
            if (isCjk(codePoint)) {
                if (asciiRun > 0) {
                    tokens += (asciiRun + 3) / 4;
                    asciiRun = 0;
                }
                tokens++;
            } else if (Character.isLetterOrDigit(codePoint)) {
                asciiRun++;
            } else {
                if (asciiRun > 0) {
                    tokens += (asciiRun + 3) / 4;
                    asciiRun = 0;
                }
                if (Character.isWhitespace(codePoint)) continue;
                tokens++;
            }
        }
        if (asciiRun > 0) tokens += (asciiRun + 3) / 4;
        return Math.max(1, tokens);
    }

    private Chunk chunk(String text) {
        String normalized = text.trim();
        return new Chunk(normalized, estimateTokens(normalized));
    }

    private static boolean isCjk(int codePoint) {
        Character.UnicodeScript script = Character.UnicodeScript.of(codePoint);
        return script == Character.UnicodeScript.HAN
                || script == Character.UnicodeScript.HIRAGANA
                || script == Character.UnicodeScript.KATAKANA
                || script == Character.UnicodeScript.HANGUL;
    }

    public record Chunk(String text, int tokenCount) {}
}
