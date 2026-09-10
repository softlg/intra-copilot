package com.intra.copilot.agent;

import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.service.AgentRegistry;
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
     * Deterministic fallback used when the route LLM is unavailable / low confidence.
     * Now actually honours the administrator-configured {@code routingRules} of the
     * route-copilot agent (format: {@code keyword => agentId} per line, separators
     * {@code =>}, {@code ->} or {@code :}); first keyword contained in the message wins.
     * Falls back to the general agent only when no rule matches.
     */
    public Agent route(String text) {
        String rules = null;
        for (AgentDefinition definition : registry.allDefinitions()) {
            if ("route-copilot".equals(definition.getId())) {
                rules = definition.getRoutingRules();
                break;
            }
        }
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
        return general;
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
