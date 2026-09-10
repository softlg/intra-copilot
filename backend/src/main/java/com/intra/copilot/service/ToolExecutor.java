package com.intra.copilot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.McpServer;
import com.intra.copilot.model.ToolDefinition;
import com.intra.copilot.repo.McpServerRepository;
import com.intra.copilot.repo.ToolDefinitionRepository;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * Executes a configured {@link ToolDefinition} as a real action. This is the missing
 * "action" half of the agent loop: the model proposes a tool call (by tool name), and this
 * executor runs it (HTTP endpoint, MCP server, or a browser action proposal) and returns a
 * result string that the agent feeds back into the next reasoning turn.
 */
@Service
public class ToolExecutor {
    private final ToolDefinitionRepository toolRepository;
    private final McpServerRepository mcpRepository;
    private final McpServerService mcpService;
    private final RestClient.Builder restClientBuilder;
    private final ObjectMapper json;
    private final boolean allowPrivateNetwork;
    private static final int MAX_RESULT_CHARS = 8000;

    public ToolExecutor(
            ToolDefinitionRepository toolRepository,
            McpServerRepository mcpRepository,
            McpServerService mcpService,
            RestClient.Builder restClientBuilder,
            ObjectMapper json,
            @Value("${tool.allow-private-network:false}") boolean allowPrivateNetwork) {
        this.toolRepository = toolRepository;
        this.mcpRepository = mcpRepository;
        this.mcpService = mcpService;
        this.restClientBuilder = restClientBuilder;
        this.json = json;
        this.allowPrivateNetwork = allowPrivateNetwork;
    }

    /** Resolve a tool definition by its configured name (used by the agent loop). */
    public ToolDefinition resolve(String name) {
        if (name == null || name.isBlank()) return null;
        return toolRepository.findAll().stream()
                .filter(t -> name.equals(t.getName()) && t.isEnabled())
                .findFirst()
                .orElse(null);
    }

    /** Resolve a tool definition by its primary key id (used to render tool usage hints). */
    public ToolDefinition resolveById(String id) {
        if (id == null || id.isBlank()) return null;
        return toolRepository.findById(id).filter(ToolDefinition::isEnabled).orElse(null);
    }

    /**
     * Resolve a tool by name but ONLY within the ids bound to the current Agent.
     * 作用域收窄可防止模型调用到该 Agent 未授权的其他已启用工具。
     */
    public ToolDefinition resolveWithin(List<String> allowedIds, String name) {
        if (name == null || name.isBlank() || allowedIds == null || allowedIds.isEmpty()) return null;
        for (String id : allowedIds) {
            ToolDefinition def = resolveById(id);
            if (def != null && name.equals(def.getName())) return def;
        }
        return null;
    }

    /** Render a human-readable tool list for the system prompt so the model knows what it can call. */
    public String describeTools(List<String> ids) {
        if (ids == null || ids.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (String id : ids) {
            ToolDefinition def = resolveById(id);
            if (def == null) continue;
            sb.append("- ").append(def.getName());
            if (def.getDescription() != null && !def.getDescription().isBlank()) {
                sb.append("：").append(def.getDescription());
            }
            sb.append("（类型：").append(def.getType()).append("）\n");
        }
        return sb.toString();
    }

    /** Execute the given tool with the supplied JSON arguments; never throws—errors become a result string. */
    public String execute(ToolDefinition def, String argumentsJson) {
        try {
            return switch (def.getType()) {
                case "MCP" -> executeMcp(def, argumentsJson);
                case "BROWSER_PROPOSAL" -> executeBrowserProposal(def, argumentsJson);
                default -> executeHttp(def, argumentsJson);
            };
        } catch (Exception error) {
            return "工具执行失败：" + safeMessage(error);
        }
    }

    private String executeHttp(ToolDefinition def, String argumentsJson) throws Exception {
        String url = def.getEndpoint();
        if (url == null || url.isBlank()) return "工具未配置 endpoint";
        URI uri = URI.create(url.trim());
        if (!List.of("http", "https").contains(uri.getScheme())) return "仅支持 http/https endpoint";
        if (!allowPrivateNetwork && isPrivateHost(uri.getHost())) {
            return "当前配置禁止访问内网/本机工具地址";
        }
        int timeout = def.getTimeoutMs() == null ? 10000 : Math.max(500, def.getTimeoutMs());
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(timeout);
        factory.setReadTimeout(timeout);
        RestClient client = restClientBuilder.clone().requestFactory(factory).build();
        Object body = parseArguments(argumentsJson);
        RestClient.RequestBodySpec spec = client.method(org.springframework.http.HttpMethod.valueOf(
                        def.getMethod() == null ? "POST" : def.getMethod().toUpperCase()))
                .uri(url)
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON);
        String raw = spec.body(body).retrieve().body(String.class);
        return truncate(raw == null ? "" : raw);
    }

    private String executeMcp(ToolDefinition def, String argumentsJson) {
        String serverUrl = def.getMcpServerUrl();
        if (serverUrl == null || serverUrl.isBlank()) return "MCP 工具未配置 mcpServerUrl";
        McpServer server = mcpRepository.findAll().stream()
                .filter(s -> serverUrl.equals(s.getServerUrl()) && s.isEnabled())
                .findFirst()
                .orElse(null);
        if (server == null) return "未找到启用且地址匹配的 MCP 服务：" + serverUrl;
        return mcpService.callTool(server, def.getName(), argumentsJson);
    }

    private String executeBrowserProposal(ToolDefinition def, String argumentsJson) {
        // 浏览器动作由插件侧执行：这里把结构化提案回传，由 ChatService 转成 action_proposed 事件。
        return "BROWSER_PROPOSAL:" + truncate(argumentsJson == null ? "{}" : argumentsJson);
    }

    private Object parseArguments(String argumentsJson) {
        try {
            return json.readValue(argumentsJson == null ? "{}" : argumentsJson, Object.class);
        } catch (Exception ignored) {
            return Map.of();
        }
    }

    private String truncate(String text) {
        return text == null ? "" : (text.length() <= MAX_RESULT_CHARS ? text : text.substring(0, MAX_RESULT_CHARS) + "\n...[truncated]");
    }

    private boolean isPrivateHost(String host) {
        if (host == null) return false;
        try {
            for (java.net.InetAddress address : java.net.InetAddress.getAllByName(host)) {
                if (address.isAnyLocalAddress() || address.isLoopbackAddress()
                        || address.isLinkLocalAddress() || address.isSiteLocalAddress()) return true;
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    private String safeMessage(Exception error) {
        return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
    }
}
