package com.intra.copilot.service.mcp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.model.McpServer;
import com.intra.copilot.model.SkillToolBinding;
import com.intra.copilot.model.ToolDefinition;
import com.intra.copilot.repo.AgentDefinitionRepository;
import com.intra.copilot.repo.SkillToolBindingRepository;
import com.intra.copilot.repo.ToolDefinitionRepository;
import com.intra.copilot.util.EntityIdGenerator;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/** Maintains the database mirror of tools exposed by an MCP server. */
@Service
public class McpToolSynchronizer {
    private final ToolDefinitionRepository tools;
    private final AgentDefinitionRepository agents;
    private final SkillToolBindingRepository skillBindings;
    private final ObjectMapper json;

    public McpToolSynchronizer(
            ToolDefinitionRepository tools,
            AgentDefinitionRepository agents,
            SkillToolBindingRepository skillBindings,
            ObjectMapper json) {
        this.tools = tools;
        this.agents = agents;
        this.skillBindings = skillBindings;
        this.json = json;
    }

    public void sync(McpServer server, List<Map<String, Object>> interfaces) {
        List<ToolDefinition> allTools = tools.findAll();
        List<AgentDefinition> allAgents = agents.findAll();
        List<ToolDefinition> existing =
                allTools.stream()
                        .filter(
                                tool ->
                                        "MCP".equalsIgnoreCase(tool.getType())
                                                && server.getId().equals(tool.getMcpServerId()))
                        .toList();
        Map<String, ToolDefinition> byRemoteName =
                existing.stream()
                        .filter(
                                tool ->
                                        tool.getRemoteName() != null
                                                && !tool.getRemoteName().isBlank())
                        .collect(
                                Collectors.toMap(
                                        ToolDefinition::getRemoteName,
                                        tool -> tool,
                                        (left, right) -> left));
        Set<String> incomingNames =
                interfaces
                        .stream()
                        .map(tool -> String.valueOf(tool.get("name")))
                        .collect(Collectors.toCollection(HashSet::new));

        for (ToolDefinition tool : existing) {
            String remoteName =
                    tool.getRemoteName() == null || tool.getRemoteName().isBlank()
                            ? tool.getName()
                            : tool.getRemoteName();
            if (incomingNames.contains(remoteName)) continue;
            if (isReferenced(tool.getId(), allAgents)) {
                tool.setEnabled(false);
                tool.touch();
                tools.save(tool);
            } else {
                tools.deleteById(tool.getId());
            }
        }

        Set<String> claimed = new HashSet<>();
        for (Map<String, Object> discovered : interfaces) {
            String remoteName = String.valueOf(discovered.get("name"));
            if (remoteName.isBlank() || !claimed.add(remoteName)) continue;
            String description =
                    discovered.get("description") == null
                            ? ""
                            : String.valueOf(discovered.get("description"));
            String schemaJson = writeSchema(discovered.get("inputSchema"));
            ToolDefinition definition = byRemoteName.get(remoteName);
            if (definition == null) {
                definition = new ToolDefinition();
                definition.setId(EntityIdGenerator.next("TL"));
            }
            String functionName = uniqueFunctionName(remoteName, definition.getId(), allTools);
            definition.setName(functionName);
            definition.setRemoteName(remoteName);
            definition.setType("MCP");
            definition.setDescription(
                    remoteName.equals(functionName)
                            ? description
                            : "MCP 原名："
                                    + remoteName
                                    + (description.isBlank() ? "" : "\n" + description));
            definition.setMcpServerId(server.getId());
            definition.setParameterSchema(schemaJson);
            definition.setTimeoutMs(
                    definition.getTimeoutMs() == null ? 10000 : definition.getTimeoutMs());
            definition.setEnabled(server.isEnabled());
            definition.touch();
            tools.save(definition);
        }
        syncEnabledState(server, allTools);
    }

    public void syncEnabledState(McpServer server) {
        syncEnabledState(server, tools.findAll());
    }

    private void syncEnabledState(McpServer server, List<ToolDefinition> allTools) {
        for (ToolDefinition tool : allTools) {
            if ("MCP".equalsIgnoreCase(tool.getType())
                    && server.getId().equals(tool.getMcpServerId())
                    && tool.isEnabled() != server.isEnabled()) {
                tool.setEnabled(server.isEnabled());
                tool.touch();
                tools.save(tool);
            }
        }
    }

    public void ensureNotReferenced(String toolId) {
        ensureNotReferenced(toolId, agents.findAll());
    }

    public void ensureNotReferenced(String toolId, List<AgentDefinition> allAgents) {
        List<String> agentNames =
                allAgents
                        .stream()
                        .filter(agent -> containsToolId(agent.getToolIds(), toolId))
                        .map(
                                agent ->
                                        agent.getDisplayName() == null
                                                ? agent.getId()
                                                : agent.getDisplayName())
                        .toList();
        List<String> skillIds =
                skillBindings
                        .findByToolId(toolId)
                        .stream()
                        .map(SkillToolBinding::getSkillId)
                        .distinct()
                        .toList();
        if (agentNames.isEmpty() && skillIds.isEmpty()) return;
        StringBuilder message = new StringBuilder("MCP Tool 仍被引用，无法删除（请先解除绑定）：");
        if (!agentNames.isEmpty()) {
            message.append(" Agent[").append(String.join("、", agentNames)).append("]");
        }
        if (!skillIds.isEmpty()) {
            message.append(" Skill[").append(String.join("、", skillIds)).append("]");
        }
        throw new IllegalArgumentException(message.toString());
    }

    private boolean isReferenced(String toolId, List<AgentDefinition> allAgents) {
        return allAgents.stream().anyMatch(agent -> containsToolId(agent.getToolIds(), toolId))
                || !skillBindings.findByToolId(toolId).isEmpty();
    }

    private boolean containsToolId(String toolIdsJson, String toolId) {
        if (toolIdsJson == null || toolIdsJson.isBlank()) return false;
        try {
            JsonNode root = json.readTree(toolIdsJson);
            if (!root.isArray()) return false;
            for (JsonNode value : root) {
                if (toolId.equals(value.asText())) return true;
            }
        } catch (Exception ignored) {
            return false;
        }
        return false;
    }

    private String writeSchema(Object schema) {
        try {
            return schema == null ? "{}" : json.writeValueAsString(schema);
        } catch (Exception error) {
            throw new IllegalArgumentException("MCP Tool Schema 序列化失败", error);
        }
    }

    private String uniqueFunctionName(
            String remoteName, String toolId, List<ToolDefinition> allTools) {
        String base = sanitizeFunctionName(remoteName);
        boolean conflict =
                allTools.stream()
                        .anyMatch(
                                tool ->
                                        !tool.getId().equals(toolId)
                                                && tool.getName() != null
                                                && tool.getName().equalsIgnoreCase(base));
        if (!conflict) return base;
        String suffix = "_" + shortHash(remoteName);
        int allowed = Math.max(1, 64 - suffix.length());
        return (base.length() <= allowed ? base : base.substring(0, allowed)) + suffix;
    }

    private String sanitizeFunctionName(String value) {
        String sanitized = value == null ? "" : value.replaceAll("[^A-Za-z0-9_-]", "_");
        sanitized = sanitized.replaceAll("_+", "_").replaceAll("^-+|-+$", "");
        if (sanitized.isBlank()) sanitized = "mcp_tool";
        if (sanitized.length() <= 64) return sanitized;
        String suffix = "_" + shortHash(value);
        return sanitized.substring(0, Math.max(1, 64 - suffix.length())) + suffix;
    }

    private String shortHash(String value) {
        try {
            byte[] digest =
                    MessageDigest.getInstance("SHA-256")
                            .digest((value == null ? "" : value).getBytes(StandardCharsets.UTF_8));
            StringBuilder text = new StringBuilder();
            for (int index = 0; index < 5; index++) {
                text.append(String.format("%02x", digest[index]));
            }
            return text.toString();
        } catch (Exception ignored) {
            return Integer.toHexString(String.valueOf(value).hashCode());
        }
    }
}
