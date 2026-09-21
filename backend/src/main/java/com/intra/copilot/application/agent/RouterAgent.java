package com.intra.copilot.application.agent;

import com.intra.copilot.domain.agent.Agent;
import com.intra.copilot.domain.agent.AgentDefinition;
import com.intra.copilot.domain.agent.GeneralAgent;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class RouterAgent {
    private final GeneralAgent general;
    private final AgentRegistry registry;

    public RouterAgent(GeneralAgent g, AgentRegistry registry) {
        general = g;
        this.registry = registry;
    }

    /**
     * Deterministic fallback used when the route LLM is unavailable / low confidence. Now actually
     * honours the administrator-configured {@code routingRules} of the route-copilot agent (format:
     * {@code keyword => agentId} per line, separators {@code =>}, {@code ->} or {@code :}); first
     * keyword contained in the message wins. Falls back to the general agent only when no rule
     * matches.
     */
    public Agent route(String text) {
        String rules =
                registry.findPublished("route-copilot")
                        .map(AgentDefinition::getRoutingRules)
                        .orElse(null);
        if (rules != null && !rules.isBlank() && text != null && !text.isBlank()) {
            String lower = text.toLowerCase();
            for (String line : rules.split("\\R")) {
                String trimmed = line.trim();
                if (trimmed.isBlank()) continue;
                int sep = indexOfSeparator(trimmed);
                if (sep < 0) continue;
                int sepLength = separatorLength(trimmed, sep);
                String keyword = trimmed.substring(0, sep).trim().toLowerCase();
                String agentId = trimmed.substring(sep + sepLength).trim();
                if (keyword.isBlank() || agentId.isBlank()) continue;
                if (lower.contains(keyword)) {
                    Optional<Agent> found = registry.findEnabled(agentId);
                    if (found.isPresent()) {
                        return found.get();
                    }
                }
            }
        }
        if (text != null && looksLikeBrowserAction(text)) {
            Optional<Agent> browserOperator =
                    registry.findEnabled(SystemAgentCatalog.BROWSER_OPERATOR);
            if (browserOperator.isPresent()) return browserOperator.get();
        }
        return general;
    }

    private static boolean looksLikeBrowserAction(String text) {
        String value = text.toLowerCase();
        for (String keyword :
                java.util.List.of(
                        "页面", "浏览器", "点击", "填写", "输入", "选择", "提交", "运行", "帮我操作", "直接完成", "页面上完成",
                        "读取页面", "browser", "click", "fill", "submit")) {
            if (value.contains(keyword)) return true;
        }
        return false;
    }

    /** 返回分隔符的起始下标；未找到返回 -1。 */
    private static int indexOfSeparator(String line) {
        int arrow = line.indexOf("=>");
        if (arrow >= 0) return arrow;
        int dash = line.indexOf("->");
        if (dash >= 0) return dash;
        return line.indexOf(':');
    }

    /** 分隔符长度："=>" / "->" 为 2，":" 为 1。 */
    private static int separatorLength(String line, int sep) {
        return line.startsWith("=>", sep) || line.startsWith("->", sep) ? 2 : 1;
    }
}
