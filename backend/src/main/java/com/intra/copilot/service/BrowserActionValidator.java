package com.intra.copilot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Validates the fixed, versioned browser capability protocol. */
public final class BrowserActionValidator {
    public static final String CLICK = "CLICK";
    public static final String FOCUS = "FOCUS";
    public static final String TYPE = "TYPE";
    public static final String FILL = "FILL";
    public static final String CLEAR = "CLEAR";
    public static final String SELECT = "SELECT";
    public static final String CHECK = "CHECK";
    public static final String UNCHECK = "UNCHECK";
    public static final String HOVER = "HOVER";
    public static final String SCROLL = "SCROLL";
    public static final String PRESS_KEY = "PRESS_KEY";
    public static final String UPLOAD = "UPLOAD";
    public static final String NAVIGATE = "NAVIGATE";
    public static final String SET_EDITOR = "SET_EDITOR";
    public static final String WAIT_FOR = "WAIT_FOR";
    public static final String VERIFY = "VERIFY";
    public static final String EXTRACT = "EXTRACT";
    public static final String SNAPSHOT = "SNAPSHOT";

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Set<String> READ_ONLY = Set.of(SNAPSHOT, EXTRACT, VERIFY, WAIT_FOR);
    private static final Set<String> TYPES =
            Set.of(
                    CLICK,
                    FOCUS,
                    TYPE,
                    FILL,
                    CLEAR,
                    SELECT,
                    CHECK,
                    UNCHECK,
                    HOVER,
                    SCROLL,
                    PRESS_KEY,
                    UPLOAD,
                    NAVIGATE,
                    SET_EDITOR,
                    WAIT_FOR,
                    VERIFY,
                    EXTRACT,
                    SNAPSHOT);
    private static final Set<String> RISKS = Set.of("low", "medium", "high");
    private static final Set<String> ACTION_FIELDS =
            Set.of("type", "target", "arguments", "reason", "risk", "postcondition", "readOnly");

    private BrowserActionValidator() {}

    public static boolean isReadOnly(String type) {
        return type != null && READ_ONLY.contains(type.toUpperCase(Locale.ROOT));
    }

    public record NormalizedAction(
            String type,
            String target,
            String argumentsJson,
            String reason,
            String risk,
            String postconditionJson,
            boolean readOnly,
            String fullJson) {}

    public static NormalizedAction normalize(String argumentsJson) {
        JsonNode root = parseObject(argumentsJson, "浏览器动作参数");
        rejectUnknownFields(root);
        String type = requiredText(root, "type", "type").toUpperCase(Locale.ROOT);
        if (!TYPES.contains(type)) {
            throw new IllegalArgumentException("不支持的浏览器动作类型：" + type);
        }

        JsonNode targetNode = root.path("target");
        String target =
                targetNode.isMissingNode() || targetNode.isNull()
                        ? ""
                        : normalizeTarget(targetNode);
        JsonNode arguments = root.path("arguments");
        if (arguments.isMissingNode() || arguments.isNull()) arguments = JSON.createObjectNode();
        if (!arguments.isObject()) throw new IllegalArgumentException("arguments 必须是 JSON 对象");

        validateAction(type, target, arguments);

        String reason = requiredText(root, "reason", "reason");
        if (reason.length() > 500) {
            throw new IllegalArgumentException("操作原因不能超过 500 个字符");
        }
        String requestedRisk = optionalText(root, "risk");
        String risk = effectiveRisk(type, requestedRisk);
        JsonNode postcondition = root.path("postcondition");
        if (!postcondition.isMissingNode()
                && !postcondition.isNull()
                && !postcondition.isObject()) {
            throw new IllegalArgumentException("postcondition 必须是 JSON 对象");
        }
        if (!READ_ONLY.contains(type)
                && (!postcondition.isObject() || postcondition.isEmpty())) {
            throw new IllegalArgumentException(type + " 必须提供非空 postcondition");
        }
        String postconditionJson = postcondition.isObject() ? postcondition.toString() : "";

        ObjectNode canonical = JSON.createObjectNode();
        canonical.put("type", type);
        if (!target.isBlank()) {
            try {
                canonical.set("target", JSON.readTree(target));
            } catch (Exception ignored) {
                canonical.put("target", target);
            }
        }
        canonical.set("arguments", arguments.deepCopy());
        canonical.put("reason", reason);
        canonical.put("risk", risk);
        canonical.put("readOnly", READ_ONLY.contains(type));
        if (!postconditionJson.isBlank()) {
            try {
                canonical.set("postcondition", JSON.readTree(postconditionJson));
            } catch (Exception error) {
                throw new IllegalArgumentException("postcondition 不是有效 JSON");
            }
        }
        return new NormalizedAction(
                type,
                target,
                arguments.toString(),
                reason,
                risk,
                postconditionJson,
                READ_ONLY.contains(type),
                canonical.toString());
    }

    public static boolean supportsSchema(String schema) {
        try {
            JsonNode root = parseObject(schema, "参数 Schema");
            return root.path("properties").path("action").path("enum").isArray()
                    || root.path("properties").path("type").path("enum").isArray();
        } catch (Exception ignored) {
            return false;
        }
    }

    private static void validateAction(String type, String target, JsonNode arguments) {
        switch (type) {
            case CLICK, FOCUS, CLEAR, CHECK, UNCHECK, HOVER -> requireTarget(target);
            case TYPE, FILL -> {
                requireTarget(target);
                requiredText(arguments, "value", "arguments.value");
            }
            case SELECT -> {
                requireTarget(target);
                JsonNode value = arguments.path("value");
                JsonNode values = arguments.path("values");
                if (!value.isTextual() && !value.isNumber() && !values.isArray()) {
                    throw new IllegalArgumentException(
                            "SELECT 必须提供 arguments.value 或 arguments.values");
                }
            }
            case SCROLL -> {
                if (target.isBlank()
                        && !arguments.has("deltaX")
                        && !arguments.has("deltaY")) {
                    throw new IllegalArgumentException(
                            "SCROLL 必须提供 target 或 arguments.deltaX/deltaY");
                }
            }
            case PRESS_KEY -> requiredText(arguments, "key", "arguments.key");
            case UPLOAD -> {
                requireTarget(target);
                if (!arguments.path("files").isArray() || arguments.path("files").isEmpty()) {
                    throw new IllegalArgumentException("UPLOAD 必须提供 arguments.files");
                }
                if (arguments.path("files").size() > 5) {
                    throw new IllegalArgumentException("单次最多上传 5 个文件");
                }
                long totalBytes = 0;
                for (JsonNode file : arguments.path("files")) {
                    if (!file.isObject()
                            || file.path("name").asText("").isBlank()
                            || file.path("dataBase64").asText("").isBlank()) {
                        throw new IllegalArgumentException(
                                "每个上传文件必须提供 name 和 dataBase64");
                    }
                    totalBytes += file.path("dataBase64").asText("").length() * 3L / 4L;
                }
                if (totalBytes > 10 * 1024 * 1024L) {
                    throw new IllegalArgumentException("上传文件总大小不能超过 10MB");
                }
            }
            case NAVIGATE -> validateNavigateUrl(requiredText(arguments, "url", "arguments.url"));
            case SET_EDITOR -> {
                requireTarget(target);
                requiredText(arguments, "code", "arguments.code");
            }
            case WAIT_FOR, VERIFY -> {
                if (!arguments.has("condition")) {
                    throw new IllegalArgumentException(type + " 必须提供 arguments.condition");
                }
            }
            case EXTRACT -> {
                // A document-level extraction is valid when no target is supplied.
            }
            case SNAPSHOT -> {
                // No target is required.
            }
            default -> throw new IllegalArgumentException("不支持的浏览器动作类型：" + type);
        }
    }

    private static String normalizeTarget(JsonNode value) {
        if (value.isTextual()) {
            String target = value.asText().strip();
            if (target.matches("ref_[0-9]{1,4}")) return target;
            throw new IllegalArgumentException("target 字符串必须是页面上下文中的 ref_N");
        }
        if (!value.isObject()) {
            throw new IllegalArgumentException("target 必须是稳定引用对象或 ref_N");
        }
        Set<String> allowed = Set.of("snapshotId", "frameId", "elementId");
        Iterator<String> names = value.fieldNames();
        while (names.hasNext()) {
            String name = names.next();
            if (!allowed.contains(name)) {
                throw new IllegalArgumentException("target 不支持字段：" + name);
            }
        }
        String snapshotId = requiredText(value, "snapshotId", "target.snapshotId");
        String elementId = requiredText(value, "elementId", "target.elementId");
        if (!value.path("frameId").canConvertToInt()) {
            throw new IllegalArgumentException("target.frameId 必须是整数");
        }
        ObjectNode normalized = JSON.createObjectNode();
        normalized.put("snapshotId", snapshotId);
        normalized.put("frameId", value.path("frameId").asInt());
        normalized.put("elementId", elementId);
        return normalized.toString();
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
                        ? (READ_ONLY.contains(type) ? "low" : "medium")
                        : requestedRisk.toLowerCase(Locale.ROOT);
        if (!RISKS.contains(requested)) {
            throw new IllegalArgumentException("risk 必须是 low、medium 或 high");
        }
        if (!READ_ONLY.contains(type) && "low".equals(requested)) return "medium";
        return requested;
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

    private static void requireTarget(String target) {
        if (target == null || target.isBlank()) {
            throw new IllegalArgumentException("当前动作必须提供 target");
        }
    }

    private static JsonNode parseObject(String raw, String label) {
        if (raw == null || raw.isBlank()) throw new IllegalArgumentException(label + "不能为空");
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
        if (value.isBlank()) throw new IllegalArgumentException(label + "不能为空");
        return value;
    }

    private static String optionalText(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) return "";
        if (!value.isTextual()) throw new IllegalArgumentException(field + " 必须是字符串");
        return value.asText().strip();
    }
}
