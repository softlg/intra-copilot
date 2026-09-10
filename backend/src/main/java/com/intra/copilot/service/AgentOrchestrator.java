package com.intra.copilot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.agent.Agent;
import com.intra.copilot.agent.ConfigurableAgent;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class AgentOrchestrator {
    private static final Logger LOG = LoggerFactory.getLogger(AgentOrchestrator.class);
    private static final double MIN_CONFIDENCE = 0.55;
    private static final double CONTEXT_CONFIDENCE = 0.9;
    private final AgentRegistry registry;
    private final RouterAgent rules;
    private final GeneralAgent general;
    private final RouteCopilotAgent routeCopilot;
    private final LlmClient llm;
    private final AgentChildBindingRepository childBindings;
    private final TraceRecorder trace;
    private final ObjectMapper json = new ObjectMapper();

    public AgentOrchestrator(
            AgentRegistry registry,
            RouterAgent rules,
            GeneralAgent general,
            RouteCopilotAgent routeCopilot,
            LlmClient llm,
            AgentChildBindingRepository childBindings,
            TraceRecorder trace) {
        this.registry = registry;
        this.rules = rules;
        this.general = general;
        this.routeCopilot = routeCopilot;
        this.llm = llm;
        this.childBindings = childBindings;
        this.trace = trace;
    }

    public RoutingResult route(String text, String pageContext, List<Map<String, String>> history) {
        return route(text, pageContext, history, null);
    }

    /**
     * 带追踪信息的路由。返回结果中携带模型原始输出、使用的 system prompt、输入文本，
     * 供调用方写入 agent_invocation_event 表。
     */
    public RoutingResult route(
            String text, String pageContext, List<Map<String, String>> history, RouteTraceListener listener) {
        String prompt = routingPrompt();
        String previousAgentId = lastAssistantAgentId(history).orElse("");
        String input =
                "用户消息：\n"
                        + text
                        + "\n\n页面上下文（可能为空）：\n"
                        + (pageContext == null ? "" : pageContext)
                        + "\n\n上一轮实际处理 Agent（仅用于澄清续答）："
                        + (previousAgentId.isBlank() ? "无" : previousAgentId)
                        + "\n如果当前消息只是对上一轮澄清问题的选择、确认或补充，请优先沿用该 Agent；"
                        + "如果是新的独立意图，请按当前消息重新路由。";
        if (listener != null) {
            listener.onRouteStart(prompt, input, history, pageContext);
        }
        String rawModelOutput = "";
        String failureReason = "";
        long durationMs = 0L;
        try {
            long started = System.nanoTime();
            Optional<String> response =
                    llm.complete(prompt, history, input).blockOptional(Duration.ofSeconds(8));
            durationMs = (System.nanoTime() - started) / 1_000_000L;
            if (response.isPresent()) {
                rawModelOutput = response.get();
                RoutingResult parsed = parse(rawModelOutput);
                if (parsed != null && parsed.confidence() >= MIN_CONFIDENCE) {
                    if (parsed.needsClarification() && "assistant".equals(parsed.selectedAgentId())) {
                        Optional<RoutingResult> contextual =
                                contextualRoute(text, history, "模型返回 assistant 澄清路由");
                        if (contextual.isPresent()) {
                            RoutingResult result = contextual.get();
                            if (listener != null) {
                                listener.onRouteEnd(
                                        result, rawModelOutput, prompt, input, durationMs, "context");
                            }
                            return result;
                        }
                    }
                    if (listener != null) {
                        listener.onRouteEnd(parsed, rawModelOutput, prompt, input, durationMs, "llm");
                    }
                    return parsed;
                }
                failureReason = parsed == null
                        ? invalidRouteReason(rawModelOutput)
                        : "模型路由置信度 " + parsed.confidence() + " 低于阈值 " + MIN_CONFIDENCE;
            } else {
                failureReason = "模型未返回结果";
            }
        } catch (Exception error) {
            failureReason = "模型调用异常：" + errorSummary(error);
            if (listener != null) {
                listener.onRouteError(prompt, input, error);
            }
            // 路由模型不可用时继续走上下文粘性或确定性规则兜底。
        }
        Optional<RoutingResult> contextual = contextualRoute(text, history, failureReason);
        if (contextual.isPresent()) {
            RoutingResult result = contextual.get();
            if (listener != null) {
                listener.onRouteEnd(result, rawModelOutput, prompt, input, durationMs, "context");
            }
            return result;
        }
        Agent fallback = rules.route(text);
        String fallbackReason = "route-copilot 未完成路由（" + failureReason + "），规则兜底路由";
        RoutingResult result =
                new RoutingResult(fallback, fallback.id(), 0.7, fallbackReason, "rules", false, null);
        if (listener != null) {
            listener.onRouteEnd(result, rawModelOutput, prompt, input, durationMs, "rules");
        }
        return result;
    }

    public Agent resolve(String id) {
        if (id == null || id.isBlank()) return general;
        if ("route-copilot".equals(id)) return routeCopilot;
        if ("assistant".equals(id)) return general;
        Optional<Agent> configured = registry.findEnabled(id);
        if (configured.isPresent()) return configured.get();
        // 降级到通用 Agent 时必须留下可观测证据，否则"配置存在但不生效"的问题无法定位。
        boolean existsButDisabled =
                registry.allDefinitions().stream().anyMatch(definition -> id.equals(definition.getId()));
        LOG.warn("Agent 解析降级：id={}，原因={}，已回退到通用 Agent",
                id, existsButDisabled ? "已停用或未发布" : "不存在");
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
            List<Map<String, String>> history,
            DelegationTraceListener listener) {
        if (domain == null || !"DOMAIN".equals(domain.getRole())) {
            return new DelegationResult(false, resolve(domain == null ? null : domain.getId()),
                    "DIRECT", "非领域 Agent 直接处理", 1.0, List.of(), null);
        }
        if ("DIRECT".equals(domain.getHandlingMode())) {
            return new DelegationResult(false, resolve(domain.getId()), "DIRECT",
                    "领域 Agent 配置为直接处理", 1.0, List.of(), null);
        }
        List<ChildCandidate> candidates = childBindings.findByParent(domain.getId()).stream()
                .filter(AgentChildBinding::isEnabled)
                .map(binding -> registry.findPublished(binding.getChildAgentId())
                        .filter(child -> "SUB".equals(child.getRole()))
                        .map(child -> new ChildCandidate(binding, child)))
                .flatMap(Optional::stream)
                .sorted(java.util.Comparator.comparingInt(binding -> binding.binding().getPriority()))
                .toList();
        if (listener != null) listener.onCandidates(domain.getId(), candidates);
        if (candidates.isEmpty()) {
            return new DelegationResult(false, resolve(domain.getId()), "DIRECT",
                    "未配置可用子 Agent", 1.0, candidates, null);
        }
        Optional<ChildCandidate> ruleMatch = candidates.stream()
                .filter(candidate -> matchesRule(text, candidate.binding().getRoutingRule())).findFirst();
        if (ruleMatch.isPresent()) {
            Agent child = resolve(ruleMatch.get().definition().getId());
            if (listener != null) listener.onRuleMatch(domain.getId(), ruleMatch.get().binding(), ruleMatch.get().definition());
            return new DelegationResult(true, child, "DELEGATE",
                    "命中子 Agent 指派规则", 0.95, candidates, ruleMatch.get().binding().getRoutingRule());
        }
        if ("DELEGATE".equals(domain.getHandlingMode())) {
            Agent child = resolve(candidates.get(0).definition().getId());
            if (listener != null) listener.onFallback(domain.getId(), candidates.get(0).definition());
            return new DelegationResult(true, child, "DELEGATE",
                    "领域 Agent 配置为优先委派", 0.8, candidates, null);
        }
        String available = candidates.stream()
                .map(candidate -> "- " + candidate.definition().getId() + ": " + candidate.definition().getDescription())
                .reduce("", (left, right) -> left + right + "\n");
        String prompt = "你是领域 Agent 的任务分发器。判断应该由领域 Agent 直接处理，还是委派给一个子 Agent。"
                + "只输出 JSON：{\"mode\":\"DIRECT或DELEGATE\",\"childAgentId\":\"\",\"reason\":\"\",\"confidence\":0到1}。"
                + "只能选择以下子 Agent：\n" + available;
        if (listener != null) listener.onDispatchStart(domain.getId(), prompt, text, pageContext);
        try {
            long started = System.nanoTime();
            Optional<String> response = llm.complete(prompt, history,
                    "用户消息：\n" + text + "\n页面上下文：\n" + (pageContext == null ? "" : pageContext))
                    .blockOptional(Duration.ofSeconds(8));
            long durationMs = (System.nanoTime() - started) / 1_000_000L;
            if (response.isPresent()) {
                JsonNode node = parseJson(response.get());
                if (node != null && "DELEGATE".equals(node.path("mode").asText())) {
                    String childId = node.path("childAgentId").asText();
                    Optional<ChildCandidate> selected = candidates.stream()
                            .filter(candidate -> candidate.definition().getId().equals(childId)).findFirst();
                    if (selected.isPresent()) {
                        if (listener != null) listener.onDispatchEnd(
                                domain.getId(), selected.get().definition(), response.get(), durationMs, true);
                        return new DelegationResult(true, resolve(childId), "DELEGATE",
                                node.path("reason").asText("模型选择子 Agent"),
                                node.path("confidence").asDouble(0.7), candidates, null);
                    }
                }
                if (listener != null) listener.onDispatchEnd(
                        domain.getId(), null, response.get(), durationMs, false);
            } else if (listener != null) {
                listener.onDispatchEnd(domain.getId(), null, "", durationMs, false);
            }
        } catch (Exception error) {
            if (listener != null) listener.onDispatchError(domain.getId(), error);
        }
        return new DelegationResult(false, resolve(domain.getId()), "DIRECT",
                "未命中规则，领域 Agent 直接处理", 0.7, candidates, null);
    }

    public DelegationResult decideDomain(
            AgentDefinition domain, String text, String pageContext, List<Map<String, String>> history) {
        return decideDomain(domain, text, pageContext, history, null);
    }

    /** 调用方实现此接口，将委派阶段的中间状态写入追踪表。 */
    public interface DelegationTraceListener {
        void onCandidates(String domainId, List<ChildCandidate> candidates);
        void onRuleMatch(String domainId, AgentChildBinding binding, AgentDefinition child);
        void onFallback(String domainId, AgentDefinition child);
        void onDispatchStart(String domainId, String prompt, String userMessage, String pageContext);
        void onDispatchEnd(String domainId, AgentDefinition selected, String rawOutput, long durationMs, boolean delegated);
        void onDispatchError(String domainId, Throwable error);
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
            return new RoutingResult(target, target.id(), confidence, reason, "llm", clarification, null);
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

    /** 模型结果无效时给出可供后台排查的具体原因。 */
    private String invalidRouteReason(String raw) {
        JsonNode node = parseJson(raw);
        if (node == null) return "返回内容不是合法路由 JSON";
        String targetId = node.path("targetAgentId").asText("");
        if (targetId.isBlank() || "router".equals(targetId)) return "模型未返回有效的目标 Agent";
        Optional<AgentDefinition> definition = registry.findPublished(targetId);
        if (definition.isEmpty()) return "模型选择的 Agent 不存在或未发布：" + targetId;
        if (!List.of("GENERAL", "DOMAIN").contains(definition.get().getRole())) {
            return "模型选择的 Agent 角色不可用于用户路由：" + targetId;
        }
        return "模型返回的路由结果无效";
    }

    /**
     * 澄清问题的短回复（如“1”“是”“继续”）在路由模型不可用时，
     * 沿用上一轮已发布 Agent，避免重新兜底到通用 assistant。
     */
    private Optional<RoutingResult> contextualRoute(
            String text, List<Map<String, String>> history, String failureReason) {
        if (!looksLikeClarificationReply(text, history)) return Optional.empty();
        Optional<String> previousAgentId = lastAssistantAgentId(history);
        if (previousAgentId.isEmpty()) return Optional.empty();
        Optional<AgentDefinition> definition =
                registry.findPublished(previousAgentId.get())
                        .filter(item -> List.of("GENERAL", "DOMAIN").contains(item.getRole()));
        if (definition.isEmpty()) return Optional.empty();
        Agent agent = new ConfigurableAgent(definition.get());
        String reason = "route-copilot 未完成路由（"
                + failureReason
                + "），沿用上一轮 Agent "
                + previousAgentId.get()
                + " 处理澄清回复";
        return Optional.of(
                new RoutingResult(
                        agent,
                        previousAgentId.get(),
                        CONTEXT_CONFIDENCE,
                        reason,
                        "context",
                        false,
                        null));
    }

    private boolean looksLikeClarificationReply(String text, List<Map<String, String>> history) {
        if (text == null || text.isBlank() || history == null || history.isEmpty()) return false;
        String normalized = text.strip().toLowerCase();
        boolean directReply =
                normalized.matches("\\d{1,2}[.、,，:：]?")
                        || normalized.matches("第\\s*\\d{1,2}\\s*(?:个|项|条)?")
                        || List.of(
                                        "是", "对", "好的", "可以", "确认", "继续", "接着", "补充",
                                        "不是", "否", "不用", "取消", "yes", "no", "continue")
                                .contains(normalized)
                        || normalized.startsWith("继续")
                        || normalized.startsWith("补充");
        if (directReply) return true;
        String previous = lastAssistantContent(history);
        return normalized.length() <= 30
                && previous != null
                && asksForClarification(previous);
    }

    private String lastAssistantContent(List<Map<String, String>> history) {
        if (history == null) return null;
        for (int i = history.size() - 1; i >= 0; i--) {
            Map<String, String> item = history.get(i);
            if (item != null && "assistant".equals(item.get("role"))) {
                return item.get("content");
            }
        }
        return null;
    }

    private Optional<String> lastAssistantAgentId(List<Map<String, String>> history) {
        if (history == null) return Optional.empty();
        for (int i = history.size() - 1; i >= 0; i--) {
            Map<String, String> item = history.get(i);
            if (item == null || !"assistant".equals(item.get("role"))) continue;
            String agentId = item.get("agentId");
            return agentId == null || agentId.isBlank() ? Optional.empty() : Optional.of(agentId);
        }
        return Optional.empty();
    }

    private boolean asksForClarification(String content) {
        if (content == null || content.isBlank()) return false;
        if (content.contains("?") || content.contains("？")) return true;
        for (String marker :
                List.of(
                        "请选择",
                        "请确认",
                        "请补充",
                        "请提供",
                        "需要你",
                        "哪一个",
                        "哪一项",
                        "是否",
                        "还是",
                        "选项")) {
            if (content.contains(marker)) return true;
        }
        return false;
    }

    private String errorSummary(Throwable error) {
        if (error == null) return "未知错误";
        String message = error.getMessage();
        return message == null || message.isBlank() ? error.getClass().getSimpleName() : message;
    }

    private boolean matchesRule(String text, String rule) {
        if (text == null || rule == null || rule.isBlank()) return false;
        String normalized = text.toLowerCase();
        for (String raw : rule.toLowerCase().split("[,，;；\\n]")) {
            String token = raw.trim();
            if (token.isEmpty()) continue;
            // 支持首尾通配：*发货* / 发货* / *发货
            boolean wildcard = token.startsWith("*") || token.endsWith("*");
            String core = token.replace("*", "");
            if (core.isEmpty()) continue;
            if (wildcard) {
                if (normalized.contains(core)) return true;
                continue;
            }
            // 纯 ASCII 关键词按词边界匹配，避免 "ai" 命中 "said" 这类误伤；
            // 中文等无空格语言仍按子串匹配。
            if (core.matches("[\\x00-\\x7F]+")) {
                if (core.length() < 2) continue;
                if (normalized.matches("(?s).*(^|[^a-z0-9])" + java.util.regex.Pattern.quote(core)
                        + "([^a-z0-9]|$).*")) return true;
            } else if (normalized.contains(core)) {
                return true;
            }
        }
        return false;
    }

    private String routingPrompt() {
        StringBuilder available = new StringBuilder();
        String routingRules = "";
        String routeSystemPrompt = routeCopilot.systemPrompt() == null ? "" : routeCopilot.systemPrompt();
        for (AgentDefinition definition : registry.allDefinitions()) {
            if ("route-copilot".equals(definition.getId())) {
                routingRules = definition.getRoutingRules();
                if (definition.getSystemPrompt() != null && !definition.getSystemPrompt().isBlank()) {
                    routeSystemPrompt = definition.getSystemPrompt();
                }
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
        return routeSystemPrompt
                + "\n你只负责识别用户意图并选择一个后台 Agent。\n"
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
            boolean needsClarification,
            RouteTraceInfo trace) {}

    public record RouteTraceInfo(
            String systemPrompt,
            String userInput,
            String rawModelOutput,
            long durationMs,
            String finalRouteSource) {}

    /** 调用方实现此接口，将路由阶段的中间状态写入追踪表。 */
    public interface RouteTraceListener {
        void onRouteStart(
                String systemPrompt, String userInput, List<Map<String, String>> history, String pageContext);

        void onRouteEnd(
                RoutingResult result,
                String rawModelOutput,
                String systemPrompt,
                String userInput,
                long durationMs,
                String routeSource);

        void onRouteError(String systemPrompt, String userInput, Throwable error);
    }

    public record DelegationResult(
            boolean delegated,
            Agent agent,
            String mode,
            String reason,
            double confidence,
            List<ChildCandidate> candidates,
            String matchedRule) {}

    public record ChildCandidate(AgentChildBinding binding, AgentDefinition definition) {}
}
