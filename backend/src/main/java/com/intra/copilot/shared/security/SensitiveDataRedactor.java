package com.intra.copilot.shared.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Locale;
import java.util.regex.Pattern;

/** Redacts credentials and opaque tokens before trace payloads reach the database or logs. */
public final class SensitiveDataRedactor {
    private static final Pattern SECRET_VALUE =
            Pattern.compile(
                    "(?i)(bearer\\s+[a-z0-9._~+/=-]{8,}|sk-[a-z0-9_-]{8,}|api[_-]?key\\s*[:=]\\s*[^\\s,;]+|"
                            + "password\\s*[:=]\\s*[^\\s,;]+|token\\s*[:=]\\s*[^\\s,;]+)");
    private static final ObjectMapper JSON = new ObjectMapper();

    private SensitiveDataRedactor() {}

    public static JsonNode redact(JsonNode value) {
        if (value == null) {
            return null;
        }
        if (value.isObject()) {
            ObjectNode object = ((ObjectNode) value).deepCopy();
            object.fieldNames()
                    .forEachRemaining(key -> object.set(key, redactField(key, object.get(key))));
            return object;
        }
        if (value.isArray()) {
            ArrayNode array = JSON.createArrayNode();
            value.forEach(item -> array.add(redact(item)));
            return array;
        }
        if (value.isTextual()) {
            return JSON.getNodeFactory().textNode(redactText(value.asText()));
        }
        return value;
    }

    private static JsonNode redactField(String key, JsonNode value) {
        if (key != null && isSecretKey(key)) {
            return JSON.getNodeFactory().textNode("[REDACTED]");
        }
        return redact(value);
    }

    private static boolean isSecretKey(String key) {
        String normalized = key.toLowerCase(Locale.ROOT).replace("-", "").replace("_", "");
        return normalized.contains("apikey")
                || normalized.contains("authorization")
                || normalized.contains("password")
                || normalized.contains("secret")
                || normalized.equals("token")
                || normalized.endsWith("accesstoken")
                || normalized.endsWith("refreshtoken");
    }

    private static String redactText(String value) {
        if (value == null || value.isBlank()) {
            return value;
        }
        return SECRET_VALUE.matcher(value).replaceAll("[REDACTED]");
    }
}
