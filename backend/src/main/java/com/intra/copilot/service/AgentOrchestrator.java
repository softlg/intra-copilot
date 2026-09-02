package com.intra.copilot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.agent.Agent;
import com.intra.copilot.agent.DiagnosisAgent;
import com.intra.copilot.agent.GeneralAgent;
import com.intra.copilot.agent.RouterAgent;
import com.intra.copilot.agent.TmsManualAgent;
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
  private final DiagnosisAgent diagnosis;
  private final TmsManualAgent tms;
  private final LlmClient llm;
  private final ObjectMapper json = new ObjectMapper();

  public AgentOrchestrator(
      AgentRegistry registry,
      RouterAgent rules,
      GeneralAgent general,
      DiagnosisAgent diagnosis,
      TmsManualAgent tms,
      LlmClient llm) {
    this.registry = registry;
    this.rules = rules;
    this.general = general;
    this.diagnosis = diagnosis;
    this.tms = tms;
    this.llm = llm;
  }

  public RoutingResult route(
      String text, String pageContext, List<Map<String, String>> history, boolean tmsAuthorized) {
    String prompt = routingPrompt();
    String input =
        "用户消息：\n"
            + text
            + "\n\n页面上下文（可能为空）：\n"
            + (pageContext == null ? "" : pageContext);
    try {
      Optional<String> response = llm.complete(prompt, history, input).blockOptional(Duration.ofSeconds(8));
      if (response.isPresent()) {
        RoutingResult parsed = parse(response.get(), tmsAuthorized);
        if (parsed != null && parsed.confidence() >= MIN_CONFIDENCE) return parsed;
      }
    } catch (Exception ignored) {
      // Fall through to deterministic routing when the model is unavailable.
    }
    Agent fallback = rules.route(text, tmsAuthorized);
    boolean tmsIntent = rules.isTmsIntent(text);
    return new RoutingResult(
        fallback,
        tmsIntent && !tmsAuthorized ? "tms-manual" : fallback.id(),
        tmsIntent && !tmsAuthorized ? 1.0 : 0.7,
        tmsIntent && !tmsAuthorized ? "需要 TMS 权限，等待用户授权" : "规则兜底路由",
        "rules",
        tmsIntent && !tmsAuthorized);
  }

  public Agent resolve(String id) {
    if (id == null || id.isBlank()) return general;
    Optional<Agent> configured = registry.findEnabled(id);
    if (configured.isPresent()) return configured.get();
    // A configured but disabled agent must never be reachable through the
    // built-in fallback implementations.
    if (registry.allDefinitions().stream().anyMatch(definition -> id.equals(definition.getId()))) {
      return general;
    }
    return switch (id) {
      case "diagnosis" -> diagnosis;
      case "tms-manual" -> tms;
      case "assistant" -> general;
      default -> general;
    };
  }

  private RoutingResult parse(String raw, boolean tmsAuthorized) {
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
      if (!tmsAuthorized && "tms-manual".equals(targetId)) clarification = true;
      Agent target = resolve(targetId);
      if (target.id().equals("assistant") && !targetId.equals("assistant")) return null;
      return new RoutingResult(
          target,
          target.id(),
          confidence,
          reason,
          "llm",
          clarification || ("tms-manual".equals(targetId) && !tmsAuthorized));
    } catch (Exception ignored) {
      return null;
    }
  }

  private String routingPrompt() {
    StringBuilder available = new StringBuilder();
    for (AgentDefinition definition : registry.enabledDefinitions()) {
      if ("tms-manual".equals(definition.getId())) {
        available.append("- ").append(definition.getId()).append(": 仅在用户授权后使用；").append(definition.getDescription()).append('\n');
      } else {
        available.append("- ").append(definition.getId()).append(": ").append(definition.getDescription()).append('\n');
      }
    }
    return "你是页面助手的主 Agent，只负责识别意图并选择一个子 Agent。\n"
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
