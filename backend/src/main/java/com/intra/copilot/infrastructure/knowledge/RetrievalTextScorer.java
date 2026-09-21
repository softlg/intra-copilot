package com.intra.copilot.infrastructure.knowledge;

import java.text.Normalizer;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lightweight lexical scorer used by hybrid retrieval.
 *
 * <p>It is intentionally dependency-free: ASCII identifiers are kept whole, while CJK text is
 * expanded into overlapping character n-grams. This catches exact macro/API names and short Chinese
 * phrases without requiring a database full-text extension.
 */
final class RetrievalTextScorer {

    private static final Pattern TOKEN_PATTERN =
            Pattern.compile("(\\p{IsHan}+|[a-z0-9][a-z0-9_.:/-]*)");

    private RetrievalTextScorer() {}

    static double score(String query, String content) {
        Map<String, Double> queryTokens = weightedTokens(query);
        if (queryTokens.isEmpty() || content == null || content.isBlank()) return 0;

        Set<String> contentTokens = tokens(content);
        double total = 0;
        double matched = 0;
        for (Map.Entry<String, Double> entry : queryTokens.entrySet()) {
            total += entry.getValue();
            if (contentTokens.contains(entry.getKey())) matched += entry.getValue();
        }
        return total == 0 ? 0 : Math.max(0, Math.min(1, matched / total));
    }

    private static Map<String, Double> weightedTokens(String text) {
        Map<String, Double> tokens = new LinkedHashMap<>();
        for (String token : tokenize(text)) {
            double weight = isAsciiIdentifier(token) ? 4 : token.codePointCount(0, token.length());
            tokens.merge(token, weight, Math::max);
        }
        return tokens;
    }

    private static Set<String> tokens(String text) {
        return new LinkedHashSet<>(tokenize(text));
    }

    private static Set<String> tokenize(String text) {
        Set<String> out = new LinkedHashSet<>();
        String normalized =
                Normalizer.normalize(text == null ? "" : text, Normalizer.Form.NFKC)
                        .toLowerCase(Locale.ROOT);
        Matcher matcher = TOKEN_PATTERN.matcher(normalized);
        while (matcher.find()) {
            String token = matcher.group();
            if (isAsciiIdentifier(token)) {
                if (token.length() >= 2) out.add(token);
                continue;
            }
            int[] points = token.codePoints().toArray();
            if (points.length == 1) {
                out.add(token);
                continue;
            }
            for (int i = 0; i < points.length; i++) {
                if (i + 1 < points.length) out.add(new String(points, i, 2));
                if (i + 2 < points.length) out.add(new String(points, i, 3));
            }
        }
        return out;
    }

    private static boolean isAsciiIdentifier(String token) {
        return token.chars().anyMatch(Character::isLetterOrDigit)
                && token.chars().allMatch(value -> value < 128);
    }
}
