package com.intra.copilot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Shared validation for configurable browser action tools and runtime action arguments. */
public final class BrowserActionValidator {
    public static final String CLICK = "CLICK";
    public static final String FILL = "FILL";
    public static final String NAVIGATE = "NAVIGATE";
    public static final String SET_EDITOR = "SET_EDITOR";

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Set<String> TYPES = Set.of(CLICK, FILL, NAVIGATE, SET_EDITOR);
    private static final Set<String> RISKS = Set.of("low", "medium", "high");
    private static final Set<String> ACTION_FIELDS =
            Set.of("type", "target", "arguments", "reason", "risk");

    private BrowserActionValidator() {}

    public record NormalizedAction(
            String type,
            String target,
            String argumentsJson,
            String reason,
            String risk,
            String fullJson) {}

    /**
     * Validates the configurable schema of a BROWSER_PROPOSAL tool. The runtime only understands
     * the shared action envelope, so accepting an arbitrary schema would advertise capabilities
     * that the browser executor cannot safely enforce.
     */
    public static void validateSchema(String schema) {
        JsonNode root = parseObject(schema, "参数 Schema");
        if (!root.path("type").asText("").equals("object")) {
            throw new IllegalArgumentException("浏览器动作 Tool 的参数 Schema type 必须为 object");
        }
        if (!root.path("additionalProperties").isBoolean()
                || root.path("additionalProperties").asBoolean()) {
            throw new IllegalArgumentException(
                    "浏览器动作 Tool 的参数 Schema 必须设置 additionalProperties=false");
        }

        JsonNode properties = root.path("properties");
        if (!properties.isObject()) {
            throw new IllegalArgumentException("浏览器动作 Tool 的参数 Schema 必须包含 properties");
        }
        requireSchemaProperty(properties, "type", "string");
        requireSchemaProperty(properties, "target", "string");
        requireSchemaProperty(properties, "arguments", "object");
        requireSchemaProperty(properties, "reason", "string");
        requireSchemaProperty(properties, "risk", "string");

        JsonNode typeEnum = properties.path("type").path("enum");
        if (!typeEnum.isArray() || typeEnum.isEmpty()) {
            throw new IllegalArgumentException("type 必须声明非空的 enum");
        }
        for (JsonNode value : typeEnum) {
            String type = value.asText("").toUpperCase(Locale.ROOT);
            if (!TYPES.contains(type)) {
                throw new IllegalArgumentException("不支持的浏览器动作类型：" + value.asText());
            }
        }

        JsonNode riskEnum = properties.path("risk").path("enum");
        if (!riskEnum.isArray() || riskEnum.isEmpty()) {
            throw new IllegalArgumentException("risk 必须声明非空的 enum");
        }
        for (JsonNode value : riskEnum) {
            if (!RISKS.contains(value.asText("").toLowerCase(Locale.ROOT))) {
                throw new IllegalArgumentException("不支持的浏览器动作风险等级：" + value.asText());
            }
        }

        JsonNode required = root.path("required");
        if (!required.isArray()) {
            throw new IllegalArgumentException("浏览器动作 Tool 的参数 Schema 必须声明 required");
        }
        Set<String> requiredFields = new LinkedHashSet<>();
        for (JsonNode value : required) {
            if (!value.isTextual() || value.asText().isBlank()) {
                throw new IllegalArgumentException("required 中的字段名必须是非空字符串");
            }
            requiredFields.add(value.asText());
        }
        if (!requiredFields.containsAll(List.of("type", "reason", "risk"))) {
            throw new IllegalArgumentException("required 必须包含 type、reason、risk");
        }
    }

    public static NormalizedAction normalize(String argumentsJson) {
        JsonNode root = parseObject(argumentsJson, "浏览器动作参数");
        rejectUnknownFields(root);

        String type = requiredText(root, "type", "type").toUpperCase(Locale.ROOT);
        if (!TYPES.contains(type)) {
            throw new IllegalArgumentException("不支持的浏览器动作类型：" + type);
        }

        String target = optionalText(root, "target");
        JsonNode arguments = root.path("arguments");
        if (arguments.isMissingNode() || arguments.isNull()) {
            arguments = JSON.createObjectNode();
        }
        if (!arguments.isObject()) {
            throw new IllegalArgumentException("arguments 必须是 JSON 对象");
        }

        switch (type) {
            case CLICK -> {
                requireTarget(target);
                rejectUnknownArgumentFields(arguments, Set.of());
            }
            case FILL -> {
                requireTarget(target);
                requiredText(arguments, "value", "arguments.value");
                rejectUnknownArgumentFields(arguments, Set.of("value"));
            }
            case NAVIGATE -> {
                String url = requiredText(arguments, "url", "arguments.url");
                validateNavigateUrl(url);
                rejectUnknownArgumentFields(arguments, Set.of("url"));
            }
            case SET_EDITOR -> {
                requireTarget(target);
                requiredText(arguments, "code", "arguments.code");
                rejectUnknownArgumentFields(arguments, Set.of("code", "language"));
            }
            default -> throw new IllegalArgumentException("不支持的浏览器动作类型：" + type);
        }

        String reason = requiredText(root, "reason", "reason");
        if (reason.length() > 500) {
            throw new IllegalArgumentException("操作原因不能超过 500 个字符");
        }
        String requestedRisk = optionalText(root, "risk");
        String risk = effectiveRisk(type, requestedRisk);

        ObjectNode canonical = JSON.createObjectNode();
        canonical.put("type", type);
        if (!target.isBlank()) canonical.put("target", target);
        canonical.set("arguments", arguments.deepCopy());
        canonical.put("reason", reason);
        canonical.put("risk", risk);
        return new NormalizedAction(
                type, target, arguments.toString(), reason, risk, canonical.toString());
    }

    private static void validateNavigateUrl(String url) {
        final URI uri;
        try {
            uri = URI.create(url);
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("arguments.url 不是有效网址");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!List.of("http", "https").contains(scheme) || uri.getHost() == null) {
            throw new IllegalArgumentException("浏览器导航仅允许 http 或 https 地址");
        }
    }

    private static String effectiveRisk(String type, String requestedRisk) {
        String requested =
                requestedRisk == null || requestedRisk.isBlank()
                        ? "medium"
                        : requestedRisk.toLowerCase(Locale.ROOT);
        if (!RISKS.contains(requested)) {
            throw new IllegalArgumentException("risk 必须是 low、medium 或 high");
        }
        int requestedRank = riskRank(requested);
        int minimumRank = List.of(CLICK, FILL, NAVIGATE, SET_EDITOR).contains(type) ? 1 : 0;
        return requestedRank < minimumRank ? "medium" : requested;
    }

    private static int riskRank(String risk) {
        return switch (risk) {
            case "low" -> 0;
            case "medium" -> 1;
            case "high" -> 2;
            default -> -1;
        };
    }

    private static void rejectUnknownFields(JsonNode root) {
        Iterator<String> names = root.fieldNames();
        while (names.hasNext()) {
            String name = names.next();
            if (!ACTION_FIELDS.contains(name)) {
                throw new IllegalArgumentException("不支持的浏览器动作字段：" + name);
            }
        }
    }

    private static void rejectUnknownArgumentFields(JsonNode arguments, Set<String> allowed) {
        Iterator<String> names = arguments.fieldNames();
        while (names.hasNext()) {
            String name = names.next();
            if (!allowed.contains(name)) {
                throw new IllegalArgumentException("当前动作不支持参数：" + name);
            }
        }
    }

    private static void requireTarget(String target) {
        if (target == null || target.isBlank()) {
            throw new IllegalArgumentException("CLICK、FILL、SET_EDITOR 必须提供 target");
        }
        if (target.length() > 500) {
            throw new IllegalArgumentException("target 不能超过 500 个字符");
        }
        if (!target.matches("ref_[0-9]{1,4}")) {
            throw new IllegalArgumentException("target 必须是页面上下文中的 ref_N");
        }
    }

    private static void requireSchemaProperty(
            JsonNode properties, String name, String expectedType) {
        JsonNode property = properties.path(name);
        if (!property.isObject() || !expectedType.equals(property.path("type").asText())) {
            throw new IllegalArgumentException(
                    "properties." + name + " 必须是 type=" + expectedType + " 的对象");
        }
    }

    private static JsonNode parseObject(String raw, String label) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        try {
            JsonNode value = JSON.readTree(raw);
            if (value == null || !value.isObject()) {
                throw new IllegalArgumentException(label + "必须是 JSON 对象");
            }
            return value;
        } catch (IllegalArgumentException error) {
            throw error;
        } catch (Exception error) {
            throw new IllegalArgumentException(label + "不是有效 JSON");
        }
    }

    private static String requiredText(JsonNode node, String field, String label) {
        String value = optionalText(node, field);
        if (value.isBlank()) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        return value;
    }

    private static String optionalText(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) return "";
        if (!value.isTextual()) {
            throw new IllegalArgumentException(field + " 必须是字符串");
        }
        return value.asText().strip();
    }
}
