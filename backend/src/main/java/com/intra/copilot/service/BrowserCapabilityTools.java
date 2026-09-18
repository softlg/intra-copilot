package com.intra.copilot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.intra.copilot.model.ToolDefinition;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.stereotype.Component;

/** Code-owned browser tools for the system browser operator. */
@Component
public class BrowserCapabilityTools {
    private static final String ACT_SCHEMA =
            """
            {
              "type":"object",
              "additionalProperties":false,
              "properties":{
                "action":{"type":"string","enum":["CLICK","FOCUS","TYPE","CLEAR","SELECT","CHECK","UNCHECK","HOVER","SCROLL","PRESS_KEY","UPLOAD","NAVIGATE","SET_EDITOR"]},
                "target":{"type":"object","additionalProperties":false,"properties":{"snapshotId":{"type":"string"},"frameId":{"type":"integer"},"elementId":{"type":"string"}},"required":["snapshotId","frameId","elementId"]},
                "arguments":{"type":"object"},
                "reason":{"type":"string","minLength":1},
                "risk":{"type":"string","enum":["low","medium","high"]},
                "postcondition":{"type":"object","minProperties":1,"properties":{"urlContains":{"type":"string"},"textVisible":{"type":"string"},"valueEquals":{"type":"string"},"checkedEquals":{"type":"boolean"},"editorContains":{"type":"string"},"elementExists":{"type":"object"}}}
              },
              "required":["action","reason","risk","postcondition"]
            }
            """;
    private static final String WAIT_SCHEMA =
            """
            {
              "type":"object",
              "additionalProperties":false,
              "properties":{
                "target":{"type":"object"},
                "condition":{"type":"object","minProperties":1,"properties":{"urlContains":{"type":"string"},"textVisible":{"type":"string"},"documentTextContains":{"type":"string"},"valueEquals":{"type":"string"},"checkedEquals":{"type":"boolean"},"editorContains":{"type":"string"},"elementExists":{"type":"object"}}},
                "reason":{"type":"string","minLength":1},
                "risk":{"type":"string","enum":["low","medium","high"]}
              },
              "required":["condition","reason","risk"]
            }
            """;
    private static final String VERIFY_SCHEMA =
            """
            {
              "type":"object",
              "additionalProperties":false,
              "properties":{
                "target":{"type":"object"},
                "condition":{"type":"object","minProperties":1,"properties":{"urlContains":{"type":"string"},"textVisible":{"type":"string"},"documentTextContains":{"type":"string"},"valueEquals":{"type":"string"},"checkedEquals":{"type":"boolean"},"editorContains":{"type":"string"},"elementExists":{"type":"object"}}},
                "reason":{"type":"string","minLength":1},
                "risk":{"type":"string","enum":["low","medium","high"]}
              },
              "required":["condition","reason"]
            }
            """;
    private static final String EXTRACT_SCHEMA =
            """
            {
              "type":"object",
              "additionalProperties":false,
              "properties":{
                "target":{"type":"object"},
                "format":{"type":"string","enum":["text","html","table","code","value"]},
                "reason":{"type":"string","minLength":1},
                "risk":{"type":"string","enum":["low","medium","high"]}
              },
              "required":["reason"]
            }
            """;
    private static final String SNAPSHOT_SCHEMA =
            """
            {
              "type":"object",
              "additionalProperties":false,
              "properties":{
                "reason":{"type":"string"},
                "risk":{"type":"string","enum":["low","medium","high"]}
              }
            }
            """;

    private final ObjectMapper json;
    private final Map<String, Definition> definitions;

    public BrowserCapabilityTools(ObjectMapper json) {
        this.json = json;
        Map<String, Definition> values = new LinkedHashMap<>();
        add(
                values,
                "browser_snapshot",
                "读取当前页面最新结构化快照，不修改页面。",
                SNAPSHOT_SCHEMA);
        add(
                values,
                "browser_act",
                "在用户授权的当前页面执行一个动作，并等待可选后置条件验证。",
                ACT_SCHEMA);
        add(
                values,
                "browser_wait",
                "等待页面条件成立，不修改页面。",
                WAIT_SCHEMA);
        add(
                values,
                "browser_verify",
                "验证当前页面是否满足指定条件。",
                VERIFY_SCHEMA);
        add(
                values,
                "browser_extract",
                "从当前页面提取文本、表格、代码或字段值。",
                EXTRACT_SCHEMA);
        definitions = Map.copyOf(values);
    }

    public List<String> toolIds() {
        return List.copyOf(definitions.keySet());
    }

    public ToolCallback callback(String id) {
        Definition definition = definitions.get(id);
        return definition == null ? null : new BuiltInCallback(definition);
    }

    public ToolCallback resolveWithin(List<String> allowedIds, String name) {
        if (allowedIds == null || name == null) return null;
        for (String id : allowedIds) {
            Definition definition = definitions.get(id);
            if (definition != null && definition.name().equals(name)) {
                return new BuiltInCallback(definition);
            }
        }
        return null;
    }

    public List<ToolDefinition> syntheticDefinitions() {
        return definitions.values().stream()
                .map(
                        definition -> {
                            ToolDefinition value = new ToolDefinition();
                            value.setId(definition.id());
                            value.setName(definition.name());
                            value.setDescription(definition.description());
                            value.setType("BUILTIN");
                            value.setParameterSchema(definition.schema());
                            value.setEnabled(true);
                            return value;
                        })
                .toList();
    }

    public String redactArguments(String toolName, String argumentsJson) {
        try {
            JsonNode input = json.readTree(argumentsJson == null ? "{}" : argumentsJson);
            if (!(input instanceof ObjectNode root)) return argumentsJson;
            ObjectNode copy = root.deepCopy();
            if ("browser_act".equals(toolName)) {
                String action = copy.path("action").asText("").toUpperCase(Locale.ROOT);
                JsonNode arguments = copy.path("arguments");
                if (arguments instanceof ObjectNode values
                        && ("TYPE".equals(action)
                                || "FILL".equals(action)
                                || "SET_EDITOR".equals(action))) {
                    if (values.has("value")) values.put("value", "[REDACTED]");
                    if (values.has("code")) values.put("code", "[CODE_REDACTED]");
                }
                if (arguments instanceof ObjectNode values && "UPLOAD".equals(action)) {
                    values.put("files", "[FILES_REDACTED]");
                }
            }
            return copy.toString();
        } catch (Exception ignored) {
            return "[arguments redacted]";
        }
    }

    private void add(
            Map<String, Definition> target,
            String id,
            String description,
            String schema) {
        target.put(id, new Definition(id, id, description, schema));
    }

    private final class BuiltInCallback implements ToolCallback {
        private final Definition definition;

        private BuiltInCallback(Definition definition) {
            this.definition = definition;
        }

        @Override
        public org.springframework.ai.tool.definition.ToolDefinition getToolDefinition() {
            return org.springframework.ai.tool.definition.ToolDefinition.builder()
                    .name(definition.name())
                    .description(definition.description())
                    .inputSchema(definition.schema())
                    .build();
        }

        @Override
        public String call(String toolInput) {
            try {
                ObjectNode action = buildAction(definition.id(), toolInput);
                BrowserActionValidator.NormalizedAction normalized =
                        BrowserActionValidator.normalize(action.toString());
                return "BROWSER_ACTION:" + normalized.fullJson();
            } catch (Exception error) {
                return "BROWSER_ACTION_ERROR:" + safeMessage(error);
            }
        }
    }

    private ObjectNode buildAction(String toolId, String toolInput) throws Exception {
        JsonNode input = json.readTree(toolInput == null || toolInput.isBlank() ? "{}" : toolInput);
        if (!input.isObject()) throw new IllegalArgumentException("Tool 参数必须是 JSON 对象");
        ObjectNode root = ((ObjectNode) input).deepCopy();
        return switch (toolId) {
            case "browser_snapshot" -> {
                ObjectNode action = json.createObjectNode();
                action.put("type", BrowserActionValidator.SNAPSHOT);
                action.put("reason", root.path("reason").asText("读取页面最新状态"));
                action.put("risk", root.path("risk").asText("low"));
                action.set("arguments", json.createObjectNode());
                yield action;
            }
            case "browser_act" -> {
                String actionType =
                        root.path("action").asText("").trim().toUpperCase(Locale.ROOT);
                root.remove("action");
                root.put("type", actionType);
                yield root;
            }
            case "browser_wait" -> {
                ObjectNode action = json.createObjectNode();
                action.put("type", BrowserActionValidator.WAIT_FOR);
                action.put("reason", root.path("reason").asText("等待页面状态更新"));
                action.put("risk", root.path("risk").asText("low"));
                ObjectNode arguments = json.createObjectNode();
                arguments.set("condition", root.path("condition").deepCopy());
                if (root.has("timeoutMs")) arguments.set("timeoutMs", root.path("timeoutMs").deepCopy());
                action.set("arguments", arguments);
                if (root.has("target")) action.set("target", root.path("target").deepCopy());
                yield action;
            }
            case "browser_verify" -> {
                ObjectNode action = json.createObjectNode();
                action.put("type", BrowserActionValidator.VERIFY);
                action.put("reason", root.path("reason").asText("验证页面结果"));
                action.put("risk", root.path("risk").asText("low"));
                ObjectNode arguments = json.createObjectNode();
                arguments.set("condition", root.path("condition").deepCopy());
                action.set("arguments", arguments);
                if (root.has("target")) action.set("target", root.path("target").deepCopy());
                yield action;
            }
            case "browser_extract" -> {
                ObjectNode action = json.createObjectNode();
                action.put("type", BrowserActionValidator.EXTRACT);
                action.put("reason", root.path("reason").asText("提取页面内容"));
                action.put("risk", root.path("risk").asText("low"));
                ObjectNode arguments = json.createObjectNode();
                arguments.put("format", root.path("format").asText("text"));
                action.set("arguments", arguments);
                if (root.has("target")) action.set("target", root.path("target").deepCopy());
                yield action;
            }
            default -> throw new IllegalArgumentException("未知系统浏览器 Tool：" + toolId);
        };
    }

    private String safeMessage(Exception error) {
        String message = error.getMessage();
        return message == null || message.isBlank() ? error.getClass().getSimpleName() : message;
    }

    private record Definition(String id, String name, String description, String schema) {}
}
