package com.intra.copilot.application.agent;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.intra.copilot.domain.agent.AgentDefinition;
import com.intra.copilot.domain.capability.ToolDefinition;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.stereotype.Component;
import com.intra.copilot.domain.agent.Agent;
import com.intra.copilot.domain.agent.BrowserActionValidator;
import com.intra.copilot.shared.security.SensitiveDataRedactor;

/** Resolves shared, code-owned system Agents by capability and exposes a bounded delegation tool. */
@Component
public class SystemAgentBroker {
    public static final String TASK_PREFIX = "SYSTEM_AGENT_TASK:";
    public static final String TASK_ERROR_PREFIX = "SYSTEM_AGENT_TASK_ERROR:";
    private static final Set<String> MODES = Set.of("DELEGATE", "HANDOFF");
    private static final Set<String> RISKS = Set.of("low", "medium", "high");
    private static final Set<String> TASK_FIELDS =
            Set.of("capability", "mode", "goal", "businessContext", "constraints", "successCriteria");
    private static final Set<String> CONSTRAINT_FIELDS =
            Set.of("allowedActions", "maxRisk", "maxSteps");

    private final SystemAgentCatalog catalog;
    private final AgentRegistry registry;
    private final ObjectMapper json;

    public SystemAgentBroker(
            SystemAgentCatalog catalog, AgentRegistry registry, ObjectMapper json) {
        this.catalog = catalog;
        this.registry = registry;
        this.json = json;
    }

    public boolean isDelegationTool(String name) {
        return SystemAgentCatalog.DELEGATION_TOOL_NAME.equals(name);
    }

    public boolean canDelegate(AgentDefinition caller) {
        return !descriptorsFor(caller).isEmpty();
    }

    public Optional<AgentDefinition> publishedDefinition(String id) {
        return registry.findPublished(id);
    }

    public ToolCallback callbackFor(AgentDefinition caller) {
        List<Descriptor> descriptors = descriptorsFor(caller);
        if (descriptors.isEmpty()) return null;
        return new DelegationToolCallback(caller, descriptors);
    }

    public Optional<ToolDefinition> syntheticDefinition(AgentDefinition caller) {
        ToolCallback callback = callbackFor(caller);
        if (callback == null) return Optional.empty();
        org.springframework.ai.tool.definition.ToolDefinition definition =
                callback.getToolDefinition();
        ToolDefinition value = new ToolDefinition();
        value.setId(definition.name());
        value.setName(definition.name());
        value.setDescription(definition.description());
        value.setType("BUILTIN");
        value.setParameterSchema(definition.inputSchema());
        value.setEnabled(true);
        return Optional.of(value);
    }

    public ResolvedTask resolve(AgentDefinition caller, String argumentsJson) {
        JsonNode root = parseObject(argumentsJson, "system_agent_task 参数");
        rejectUnknownFields(root, TASK_FIELDS);
        String capability = requiredText(root, "capability");
        SystemAgentCatalog.Spec spec = null;
        AgentDefinition target = null;
        List<String> unavailable = new ArrayList<>();
        for (SystemAgentCatalog.Spec candidate : catalog.providers(capability)) {
            try {
                requireCallerAllowed(caller, candidate);
            } catch (IllegalArgumentException error) {
                unavailable.add(candidate.id() + "：" + error.getMessage());
                continue;
            }
            Optional<AgentDefinition> published = registry.findPublished(candidate.id());
            if (published.isEmpty()) {
                unavailable.add(candidate.id() + "：未发布或不可用");
                continue;
            }
            spec = candidate;
            target = published.get();
            break;
        }
        if (spec == null || target == null) {
            throw new IllegalArgumentException(
                    "没有可用的系统 Agent 能力："
                            + capability
                            + (unavailable.isEmpty()
                                    ? ""
                                    : "（" + String.join("；", unavailable) + "）"));
        }
        String mode = optionalText(root, "mode", "DELEGATE").toUpperCase(Locale.ROOT);
        if (!MODES.contains(mode)) {
            throw new IllegalArgumentException("mode 必须是 DELEGATE 或 HANDOFF");
        }
        String goal = requiredText(root, "goal");
        if (goal.length() > 4000) {
            throw new IllegalArgumentException("system_agent_task.goal 不能超过 4000 个字符");
        }
        Map<String, Object> businessContext =
                objectMap(root.path("businessContext"), "businessContext");
        Constraints constraints = parseConstraints(root.path("constraints"), target);
        List<String> successCriteria =
                stringList(root.path("successCriteria"), "successCriteria", 10);
        TaskRequest request =
                new TaskRequest(
                        spec.capabilities().stream()
                                .map(SystemAgentCatalog.Capability::name)
                                .filter(capability::equalsIgnoreCase)
                                .findFirst()
                                .orElse(capability.toLowerCase(Locale.ROOT)),
                        mode,
                        goal,
                        businessContext,
                        constraints,
                        successCriteria);
        try {
            return new ResolvedTask(
                    spec,
                    target,
                    request,
                    json.writeValueAsString(
                            Map.of(
                                    "capability", request.capability(),
                                    "mode", request.mode(),
                                    "goal", request.goal(),
                                    "businessContext", request.businessContext(),
                                    "constraints", request.constraints(),
                                    "successCriteria", request.successCriteria())));
        } catch (Exception error) {
            throw new IllegalArgumentException("system_agent_task 参数无法序列化", error);
        }
    }

    public List<Descriptor> descriptors() {
        List<Descriptor> values = new ArrayList<>();
        for (SystemAgentCatalog.Spec spec : catalog.all()) {
            if (!spec.delegatable() || spec.capabilities().isEmpty()) continue;
            AgentDefinition target = registry.findPublished(spec.id()).orElse(null);
            if (target == null) continue;
            for (SystemAgentCatalog.Capability capability : spec.capabilities()) {
                values.add(
                        new Descriptor(
                                capability.name(),
                                capability.description(),
                                spec.id(),
                                target.getDisplayName(),
                                spec.allowedCallerRoles(),
                                spec.maxDelegationDepth(),
                                spec.priority()));
            }
        }
        values.sort(
                Comparator.comparingInt(Descriptor::priority)
                        .thenComparing(Descriptor::capability)
                        .thenComparing(Descriptor::agentId));
        return List.copyOf(values);
    }

    public String redactArguments(String argumentsJson) {
        try {
            JsonNode value = json.readTree(argumentsJson == null ? "{}" : argumentsJson);
            return SensitiveDataRedactor.redact(value).toString();
        } catch (Exception ignored) {
            return "[system_agent_task arguments redacted]";
        }
    }

    private List<Descriptor> descriptorsFor(AgentDefinition caller) {
        if (caller == null) return List.of();
        String callerRole =
                caller.getRole() == null ? "" : caller.getRole().toUpperCase(Locale.ROOT);
        return descriptors().stream()
                .filter(item -> !item.agentId().equals(caller.getId()))
                .filter(
                        item ->
                                item.allowedCallerRoles().contains("*")
                                        || item.allowedCallerRoles().contains(callerRole))
                .toList();
    }

    private void requireCallerAllowed(AgentDefinition caller, SystemAgentCatalog.Spec spec) {
        if (caller == null) {
            throw new IllegalArgumentException("当前 Agent 没有系统 Agent 委派权限");
        }
        if (spec.id().equals(caller.getId())) {
            throw new IllegalArgumentException("系统 Agent 不能把任务委派给自己");
        }
        String role = caller.getRole() == null ? "" : caller.getRole().toUpperCase(Locale.ROOT);
        if (!spec.allowedCallerRoles().contains("*")
                && !spec.allowedCallerRoles().contains(role)) {
            throw new IllegalArgumentException("当前 Agent 角色不能调用该系统 Agent 能力");
        }
    }

    private Constraints parseConstraints(JsonNode node, AgentDefinition target) {
        if (node.isMissingNode() || node.isNull()) {
            return new Constraints(List.of(), "high", normalizedMaxSteps(10, target));
        }
        if (!node.isObject()) throw new IllegalArgumentException("constraints 必须是 JSON 对象");
        rejectUnknownFields(node, CONSTRAINT_FIELDS);
        List<String> allowedActions =
                stringList(node.path("allowedActions"), "constraints.allowedActions", 32).stream()
                        .map(value -> value.toUpperCase(Locale.ROOT))
                        .distinct()
                        .toList();
        String maxRisk =
                optionalText(node, "maxRisk", "high").toLowerCase(Locale.ROOT);
        if (!RISKS.contains(maxRisk)) {
            throw new IllegalArgumentException("constraints.maxRisk 必须是 low、medium 或 high");
        }
        JsonNode maxStepsNode = node.path("maxSteps");
        int maxSteps = 10;
        if (!maxStepsNode.isMissingNode() && !maxStepsNode.isNull()) {
            if (!maxStepsNode.isIntegralNumber() || !maxStepsNode.canConvertToInt()) {
                throw new IllegalArgumentException("constraints.maxSteps 必须是整数");
            }
            maxSteps = maxStepsNode.asInt();
        }
        return new Constraints(
                allowedActions, maxRisk, normalizedMaxSteps(maxSteps, target));
    }

    private int normalizedMaxSteps(int requested, AgentDefinition target) {
        int configured = target.getMaxPlanSteps() <= 0 ? 10 : target.getMaxPlanSteps();
        return Math.max(1, Math.min(Math.min(configured, 10), requested));
    }

    private Map<String, Object> objectMap(JsonNode node, String label) {
        if (node.isMissingNode() || node.isNull()) return Map.of();
        if (!node.isObject()) throw new IllegalArgumentException(label + " 必须是 JSON 对象");
        try {
            return json.convertValue(node, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception error) {
            throw new IllegalArgumentException(label + " 无法解析", error);
        }
    }

    private List<String> stringList(JsonNode node, String label, int limit) {
        if (node.isMissingNode() || node.isNull()) return List.of();
        if (!node.isArray()) throw new IllegalArgumentException(label + " 必须是数组");
        if (node.size() > limit) {
            throw new IllegalArgumentException(label + " 最多允许 " + limit + " 项");
        }
        List<String> values = new ArrayList<>();
        for (JsonNode item : node) {
            if (!item.isTextual() || item.asText().isBlank()) {
                throw new IllegalArgumentException(label + " 只能包含非空字符串");
            }
            values.add(item.asText().trim());
        }
        return List.copyOf(values);
    }

    private JsonNode parseObject(String raw, String label) {
        if (raw == null || raw.isBlank()) throw new IllegalArgumentException(label + "不能为空");
        try {
            JsonNode value = json.readTree(raw);
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

    private void rejectUnknownFields(JsonNode root, Set<String> allowed) {
        Iterator<String> fields = root.fieldNames();
        while (fields.hasNext()) {
            String field = fields.next();
            if (!allowed.contains(field)) {
                throw new IllegalArgumentException("不支持的字段：" + field);
            }
        }
    }

    private String requiredText(JsonNode root, String field) {
        String value = optionalText(root, field, "");
        if (value.isBlank()) throw new IllegalArgumentException(field + " 不能为空");
        return value;
    }

    private String optionalText(JsonNode root, String field, String fallback) {
        JsonNode value = root.path(field);
        if (value.isMissingNode() || value.isNull()) return fallback;
        if (!value.isTextual()) throw new IllegalArgumentException(field + " 必须是字符串");
        String text = value.asText().trim();
        return text.isBlank() ? fallback : text;
    }

    public record TaskRequest(
            String capability,
            String mode,
            String goal,
            Map<String, Object> businessContext,
            Constraints constraints,
            List<String> successCriteria) {}

    public record Constraints(List<String> allowedActions, String maxRisk, int maxSteps) {}

    public record ResolvedTask(
            SystemAgentCatalog.Spec spec,
            AgentDefinition target,
            TaskRequest request,
            String canonicalJson) {
        public boolean isHandoff() {
            return "HANDOFF".equals(request.mode());
        }

        public boolean allowsAction(String type, String risk) {
            if (type == null || "".equals(type)) return false;
            String normalizedType = type.toUpperCase(Locale.ROOT);
            if (!BrowserActionValidator.isReadOnly(normalizedType)
                    && !request.constraints().allowedActions().isEmpty()
                    && !request.constraints().allowedActions().contains(normalizedType)) {
                return false;
            }
            if (!"browser.operate".equals(request.capability())) return true;
            int requestedRisk = riskRank(risk);
            int allowedRisk = riskRank(request.constraints().maxRisk());
            return requestedRisk <= allowedRisk;
        }
    }

    public record Descriptor(
            String capability,
            String description,
            String agentId,
            String displayName,
            Set<String> allowedCallerRoles,
            int maxDelegationDepth,
            int priority) {}

    private final class DelegationToolCallback implements ToolCallback {
        private final AgentDefinition caller;
        private final List<Descriptor> descriptors;

        private DelegationToolCallback(AgentDefinition caller, List<Descriptor> descriptors) {
            this.caller = caller;
            this.descriptors = descriptors;
        }

        @Override
        public org.springframework.ai.tool.definition.ToolDefinition getToolDefinition() {
            Set<String> capabilities = new LinkedHashSet<>();
            descriptors.forEach(item -> capabilities.add(item.capability()));
            ArrayNode enumValues = json.createArrayNode();
            capabilities.forEach(enumValues::add);
            ObjectNode constraints = json.createObjectNode();
            constraints.put("type", "object");
            constraints.put("additionalProperties", false);
            ObjectNode constraintProperties = constraints.putObject("properties");
            ObjectNode allowedActions = constraintProperties.putObject("allowedActions");
            allowedActions.put("type", "array");
            allowedActions.putObject("items").put("type", "string");
            allowedActions.put("maxItems", 32);
            constraintProperties.putObject("maxRisk").put("type", "string").putArray("enum")
                    .add("low")
                    .add("medium")
                    .add("high");
            constraintProperties.putObject("maxSteps").put("type", "integer").put("minimum", 1)
                    .put("maximum", 10);

            ObjectNode properties = json.createObjectNode();
            ObjectNode capability = properties.putObject("capability");
            capability.put("type", "string");
            capability.set("enum", enumValues);
            capability.put(
                    "description",
                    descriptors.stream()
                            .map(
                                    item ->
                                            item.capability()
                                                    + "："
                                                    + item.description()
                                                    + "（"
                                                    + item.displayName()
                                                    + "）")
                            .distinct()
                            .reduce((left, right) -> left + "\n" + right)
                            .orElse(""));
            properties.putObject("mode").put("type", "string").putArray("enum")
                    .add("DELEGATE")
                    .add("HANDOFF");
            properties.putObject("goal").put("type", "string").put("minLength", 1).put("maxLength", 4000);
            properties.putObject("businessContext").put("type", "object");
            properties.set("constraints", constraints);
            ObjectNode successCriteria = properties.putObject("successCriteria");
            successCriteria.put("type", "array").put("maxItems", 10);
            successCriteria.putObject("items").put("type", "string").put("minLength", 1);

            ObjectNode schema = json.createObjectNode();
            schema.put("type", "object");
            schema.put("additionalProperties", false);
            schema.set("properties", properties);
            ArrayNode required = schema.putArray("required");
            required.add("capability");
            required.add("goal");
            return org.springframework.ai.tool.definition.ToolDefinition.builder()
                    .name(SystemAgentCatalog.DELEGATION_TOOL_NAME)
                    .description(
                            "把一个具有明确目标和成功标准的子任务委派给系统内置 Agent。"
                                    + "只提交业务目标和约束，不要提交页面元素或底层脚本。")
                    .inputSchema(schema.toString())
                    .build();
        }

        @Override
        public String call(String toolInput) {
            try {
                ResolvedTask task = resolve(caller, toolInput);
                return TASK_PREFIX + task.canonicalJson();
            } catch (Exception error) {
                String message = error.getMessage();
                return TASK_ERROR_PREFIX
                        + (message == null || message.isBlank()
                                ? error.getClass().getSimpleName()
                                : message);
            }
        }
    }

    private static int riskRank(String risk) {
        if ("low".equalsIgnoreCase(risk)) return 1;
        if ("high".equalsIgnoreCase(risk)) return 3;
        return 2;
    }
}
