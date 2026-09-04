package com.intra.copilot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.agent.Agent;
import com.intra.copilot.agent.GeneralAgent;
import com.intra.copilot.agent.RouteCopilotAgent;
import com.intra.copilot.agent.RouterAgent;
import com.intra.copilot.model.AgentDefinition;
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
  private final ObjectMapper json = new ObjectMapper();

  public AgentOrchestrator(
      AgentRegistry registry,
      RouterAgent rules,
      GeneralAgent general,
      RouteCopilotAgent routeCopilot,
      LlmClient llm) {
    this.registry = registry;
    this.rules = rules;
    this.general = general;
    this.routeCopilot = routeCopilot;
    this.llm = llm;
  }

  public RoutingResult route(
      String text, String pageContext, List<Map<String, String>> history) {
    String prompt = routingPrompt();
    String input =
        "用户消息：\n"
            + text
            + "\n\n页面上下文（可能为空）：\n"
            + (pageContext == null ? "" : pageContext);
    try {
      Optional<String> response = llm.complete(prompt, history, input).blockOptional(Duration.ofSeconds(8));
      if (response.isPresent()) {
        RoutingResult parsed = parse(response.get());
        if (parsed != null && parsed.confidence() >= MIN_CONFIDENCE) return parsed;
      }
    } catch (Exception ignored) {
      // Fall through to deterministic routing when the model is unavailable.
    }
    Agent fallback = rules.route(text);
    return new RoutingResult(
        fallback,
        fallback.id(),
        0.7,
        "规则兜底路由",
        "rules",
        false);
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
      if (target.id().equals("assistant") && !targetId.equals("assistant")) return null;
      return new RoutingResult(
          target,
          target.id(),
          confidence,
          reason,
          "llm",
          clarification);
    } catch (Exception ignored) {
      return null;
    }
  }

  private String routingPrompt() {
    StringBuilder available = new StringBuilder();
    for (AgentDefinition definition : registry.enabledDefinitions()) {
      if ("route-copilot".equals(definition.getId())) continue;
      available.append("- ").append(definition.getId()).append(": ").append(definition.getDescription()).append('\n');
    }
    return "你是 Intra route Copilot，只负责识别用户意图并选择一个后台 Agent。\n"
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
}
