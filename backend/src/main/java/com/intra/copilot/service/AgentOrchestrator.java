package com.intra.copilot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.agent.Agent;
import com.intra.copilot.agent.GeneralAgent;
import com.intra.copilot.agent.RouteCopilotAgent;
import com.intra.copilot.agent.RouterAgent;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.model.AgentChildBinding;
import com.intra.copilot.repo.AgentChildBindingRepository;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Service;

@Service
public class AgentOrchestrator {
    private static final double MIN_CONFIDENCE = 0.55;
    private final AgentRegistry registry;
    private final RouterAgent rules;
    private final GeneralAgent general;
    private final RouteCopilotAgent routeCopilot;
    private final LlmClient llm;
    private final AgentChildBindingRepository childBindings;
    private final ObjectMapper json = new ObjectMapper();

    public AgentOrchestrator(
            AgentRegistry registry,
            RouterAgent rules,
            GeneralAgent general,
            RouteCopilotAgent routeCopilot,
            LlmClient llm,
            AgentChildBindingRepository childBindings) {
        this.registry = registry;
        this.rules = rules;
        this.general = general;
        this.routeCopilot = routeCopilot;
        this.llm = llm;
        this.childBindings = childBindings;
    }

    public RoutingResult route(String text, String pageContext, List<Map<String, String>> history) {
        String prompt = routingPrompt();
        String input =
                "用户消息：\n" + text + "\n\n页面上下文（可能为空）：\n" + (pageContext == null ? "" : pageContext);
        try {
            Optional<String> response =
                    llm.complete(prompt, history, input).blockOptional(Duration.ofSeconds(8));
            if (response.isPresent()) {
                RoutingResult parsed = parse(response.get());
                if (parsed != null && parsed.confidence() >= MIN_CONFIDENCE) return parsed;
            }
        } catch (Exception ignored) {
            // Fall through to deterministic routing when the model is unavailable.
        }
        Agent fallback = rules.route(text);
        return new RoutingResult(fallback, fallback.id(), 0.7, "规则兜底路由", "rules", false);
    }

    public Agent resolve(String id) {
        if (id == null || id.isBlank()) return general;
        if ("route-copilot".equals(id)) return routeCopilot;
        if ("assistant".equals(id)) return general;
        Optional<Agent> configured = registry.findEnabled(id);
        if (configured.isPresent()) return configured.get();
        // A configured but disabled agent must never be reachable through the
        // built-in fallback implementations.
        if (registry.allDefinitions().stream().anyMatch(definition -> id.equals(definition.getId()))) {
            return general;
        }
        return general;
    }

    /** Resolve an agent explicitly requested by a client. Main and SUB agents
     * are internal nodes and can never be selected directly by the plugin. */
    public Agent resolveUserAgent(String id) {
        if (id == null || id.isBlank()) return general;
        Optional<AgentDefinition> definition = registry.findPublished(id)
                .filter(item -> List.of("GENERAL", "DOMAIN").contains(item.getRole()));
        if (definition.isEmpty()) {
            if ("assistant".equals(id)) return general;
            throw new IllegalArgumentException("只能选择已发布且启用的通用或领域 Agent");
        }
        return new com.intra.copilot.agent.ConfigurableAgent(definition.get());
    }

    public DelegationResult decideDomain(
            AgentDefinition domain,
            String text,
            String pageContext,
            List<Map<String, String>> history) {
        if (domain == null || !"DOMAIN".equals(domain.getRole())) {
            return new DelegationResult(false, resolve(domain == null ? null : domain.getId()), "DIRECT", "非领域 Agent 直接处理", 1.0);
        }
        if ("DIRECT".equals(domain.getHandlingMode())) {
            return new DelegationResult(false, resolve(domain.getId()), "DIRECT", "领域 Agent 配置为直接处理", 1.0);
        }
        List<ChildCandidate> candidates = childBindings.findByParent(domain.getId()).stream()
                .filter(AgentChildBinding::isEnabled)
                .map(binding -> registry.findPublished(binding.getChildAgentId())
                        .filter(child -> "SUB".equals(child.getRole()))
                        .map(child -> new ChildCandidate(binding, child)))
                .flatMap(Optional::stream)
                .toList();
        if (candidates.isEmpty()) {
            return new DelegationResult(false, resolve(domain.getId()), "DIRECT", "未配置可用子 Agent", 1.0);
        }
        Optional<ChildCandidate> ruleMatch = candidates.stream().filter(candidate -> matchesRule(text, candidate.binding().getRoutingRule())).findFirst();
        if (ruleMatch.isPresent()) {
            Agent child = resolve(ruleMatch.get().definition().getId());
            return new DelegationResult(true, child, "DELEGATE", "命中子 Agent 指派规则", 0.95);
        }
        if ("DELEGATE".equals(domain.getHandlingMode())) {
            Agent child = resolve(candidates.get(0).definition().getId());
            return new DelegationResult(true, child, "DELEGATE", "领域 Agent 配置为优先委派", 0.8);
        }
        String available = candidates.stream()
                .map(candidate -> "- " + candidate.definition().getId() + ": " + candidate.definition().getDescription())
                .reduce("", (left, right) -> left + right + "\n");
        String prompt = "你是领域 Agent 的任务分发器。判断应该由领域 Agent 直接处理，还是委派给一个子 Agent。"
                + "只输出 JSON：{\"mode\":\"DIRECT或DELEGATE\",\"childAgentId\":\"\",\"reason\":\"\",\"confidence\":0到1}。"
                + "只能选择以下子 Agent：\n" + available;
        try {
            Optional<String> response = llm.complete(prompt, history,
                    "用户消息：\n" + text + "\n页面上下文：\n" + (pageContext == null ? "" : pageContext))
                    .blockOptional(Duration.ofSeconds(8));
            if (response.isPresent()) {
                JsonNode node = parseJson(response.get());
                if (node != null && "DELEGATE".equals(node.path("mode").asText())) {
                    String childId = node.path("childAgentId").asText();
                    Optional<ChildCandidate> selected = candidates.stream()
                            .filter(candidate -> candidate.definition().getId().equals(childId)).findFirst();
                    if (selected.isPresent()) {
                        return new DelegationResult(true, resolve(childId), "DELEGATE",
                                node.path("reason").asText("模型选择子 Agent"), node.path("confidence").asDouble(0.7));
                    }
                }
            }
        } catch (Exception ignored) {
            // Direct processing is the safe fallback for an unavailable dispatcher.
        }
        return new DelegationResult(false, resolve(domain.getId()), "DIRECT", "未命中规则，领域 Agent 直接处理", 0.7);
    }

    private RoutingResult parse(String raw) {
        try {
            int start = raw.indexOf('{');
            int end = raw.lastIndexOf('}');
            if (start < 0 || end <= start) return null;
            JsonNode node = json.readTree(raw.substring(start, end + 1));
            String targetId = node.path("targetAgentId").asText("");
            double confidence = node.path("confidence").asDouble(0);
            String reason = node.path("reason").asText("模型路由");
            boolean clarification = node.path("needsClarification").asBoolean(false);
            if (targetId.isBlank() || "router".equals(targetId)) return null;
            Agent target = resolve(targetId);
            Optional<AgentDefinition> definition = registry.findPublished(targetId);
            if (definition.isEmpty() || !List.of("GENERAL", "DOMAIN").contains(definition.get().getRole())) return null;
            return new RoutingResult(target, target.id(), confidence, reason, "llm", clarification);
        } catch (Exception ignored) {
            return null;
        }
    }

    private JsonNode parseJson(String raw) {
        try {
            int start = raw.indexOf('{');
            int end = raw.lastIndexOf('}');
            return start >= 0 && end > start ? json.readTree(raw.substring(start, end + 1)) : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private boolean matchesRule(String text, String rule) {
        if (text == null || rule == null || rule.isBlank()) return false;
        String normalized = text.toLowerCase();
        return List.of(rule.toLowerCase().split("[,，;；\\n]")).stream()
                .map(String::trim).filter(token -> token.length() >= 2).anyMatch(normalized::contains);
    }

    private String routingPrompt() {
        StringBuilder available = new StringBuilder();
        String routingRules = "";
        for (AgentDefinition definition : registry.allDefinitions()) {
            if ("route-copilot".equals(definition.getId())) {
                routingRules = definition.getRoutingRules();
                break;
            }
        }
        for (AgentDefinition definition : registry.enabledDefinitions()) {
            if (!List.of("GENERAL", "DOMAIN").contains(definition.getRole())) continue;
            available
                    .append("- ")
                    .append(definition.getId())
                    .append(": ")
                    .append(definition.getDescription())
                    .append('\n');
        }
        return "你是 Intra route Copilot，只负责识别用户意图并选择一个后台 Agent。\n"
                + (routingRules == null || routingRules.isBlank()
                        ? ""
                        : "管理员配置的意图路由规则（优先遵循）：\n" + routingRules + "\n")
                + "可选 Agent：\n"
                + available
                + "只输出 JSON，不要 Markdown：{\"targetAgentId\":\"...\",\"confidence\":0到1,\"reason\":\"...\",\"needsClarification\":false}。"
                + "无法判断时选择 assistant 并将 needsClarification 设为 true。不要编造不存在的 Agent。";
    }

    public record RoutingResult(
            Agent agent,
            String selectedAgentId,
            double confidence,
            String reason,
            String routeSource,
            boolean needsClarification) {}

    public record DelegationResult(
            boolean delegated, Agent agent, String mode, String reason, double confidence) {}

    private record ChildCandidate(AgentChildBinding binding, AgentDefinition definition) {}
}
