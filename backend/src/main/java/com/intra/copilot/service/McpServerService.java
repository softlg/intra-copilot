package com.intra.copilot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.intra.copilot.model.McpServer;
import com.intra.copilot.repo.McpServerRepository;
import java.net.URI;
import java.net.InetAddress;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/** Registers MCP endpoints and performs a safe initialize/tools-list discovery. */
@Service
public class McpServerService {
    private final McpServerRepository repository;
    private final ObjectMapper mapper;
    private final RestClient.Builder restClientBuilder;
    private final int timeoutMs;
    private final boolean allowPrivateNetwork;

    public McpServerService(
            McpServerRepository repository,
            ObjectMapper mapper,
            RestClient.Builder restClientBuilder,
            @Value("${mcp.timeout-ms:8000}") int timeoutMs,
            @Value("${mcp.allow-private-network:true}") boolean allowPrivateNetwork) {
        this.repository = repository;
        this.mapper = mapper;
        this.restClientBuilder = restClientBuilder;
        this.timeoutMs = Math.max(1000, Math.min(30000, timeoutMs));
        this.allowPrivateNetwork = allowPrivateNetwork;
    }

    public List<McpServer> list() { return repository.findAll(); }

    public McpServer get(String id) {
        return repository.findById(id).orElseThrow(() -> new IllegalArgumentException("MCP 服务不存在"));
    }

    public McpServer create(McpServer server) {
        validate(server);
        ensureNameAvailable(server.getName(), null);
        server.setName(server.getName().trim());
        server.setStatus("UNKNOWN");
        return repository.save(server);
    }

    public McpServer update(String id, McpServer value) {
        McpServer current = get(id);
        validate(value);
        ensureNameAvailable(value.getName(), id);
        current.setName(value.getName().trim());
        current.setDescription(value.getDescription());
        current.setServerUrl(value.getServerUrl().trim());
        current.setTransport(value.getTransport().toUpperCase());
        current.setAuthEnv(value.getAuthEnv());
        current.setEnabled(value.isEnabled());
        current.touch();
        return repository.save(current);
    }

    public void delete(String id) { repository.deleteById(id); }

    public McpServer checkHealth(String id) {
        McpServer server = get(id);
        Instant started = Instant.now();
        server.setLastCheckedAt(started);
        try {
            ResponseEntity<String> initialized = postJson(server, initializeRequest());
            String sessionId = initialized.getHeaders().getFirst("Mcp-Session-Id");
            ResponseEntity<String> listed = postJson(server, toolsListRequest(), sessionId);
            Discovery discovery = parseDiscovery(initialized.getBody(), listed.getBody());
            server.setStatus(discovery.interfaces().isEmpty() ? "DEGRADED" : "HEALTHY");
            server.setInterfaceCount(discovery.interfaces().size());
            server.setInterfacesJson(mapper.writeValueAsString(discovery.interfaces()));
            server.setCapabilitiesJson(discovery.capabilitiesJson());
            server.setLastError(discovery.interfaces().isEmpty() ? "服务已连接，但未返回可用接口" : null);
        } catch (Exception error) {
            if ("SSE".equalsIgnoreCase(server.getTransport()) && sseReachable(server)) {
                server.setStatus("DEGRADED");
                server.setInterfaceCount(0);
                server.setLastError("SSE 服务地址可访问，但当前端点未返回可解析的 tools/list；请确认 MCP SSE 消息端点配置");
            } else {
                server.setStatus("UNHEALTHY");
                server.setInterfaceCount(0);
                server.setLastError(safeMessage(error));
            }
        }
        server.setLastLatencyMs((int) Math.min(Integer.MAX_VALUE, Duration.between(started, Instant.now()).toMillis()));
        server.touch();
        return repository.save(server);
    }

    private ResponseEntity<String> postJson(McpServer server, Map<String, Object> body) {
        return postJson(server, body, null);
    }

    private ResponseEntity<String> postJson(McpServer server, Map<String, Object> body, String sessionId) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(timeoutMs);
        requestFactory.setReadTimeout(timeoutMs);
        RestClient client = restClientBuilder.clone().requestFactory(requestFactory).build();
        var request = client.post().uri(server.getServerUrl()).contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON, MediaType.TEXT_EVENT_STREAM);
        if (sessionId != null && !sessionId.isBlank()) request.header("Mcp-Session-Id", sessionId);
        String token = authToken(server.getAuthEnv());
        if (token != null) request.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        return request.body(body).retrieve().toEntity(String.class);
    }

    private boolean sseReachable(McpServer server) {
        try {
            SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
            requestFactory.setConnectTimeout(timeoutMs);
            requestFactory.setReadTimeout(timeoutMs);
            RestClient client = restClientBuilder.clone().requestFactory(requestFactory).build();
            var request = client.head().uri(server.getServerUrl());
            String token = authToken(server.getAuthEnv());
            if (token != null) request.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
            request.retrieve().toBodilessEntity();
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private Map<String, Object> initializeRequest() {
        return Map.of(
                "jsonrpc", "2.0",
                "id", 1,
                "method", "initialize",
                "params", Map.of(
                        "protocolVersion", "2024-11-05",
                        "capabilities", Map.of(),
                        "clientInfo", Map.of("name", "intra-copilot-admin", "version", "1.0")));
    }

    private Map<String, Object> toolsListRequest() {
        return Map.of("jsonrpc", "2.0", "id", 2, "method", "tools/list", "params", Map.of());
    }

    private Discovery parseDiscovery(String initializeBody, String toolsBody) throws Exception {
        JsonNode initialize = parseResponse(initializeBody);
        JsonNode toolsResponse = parseResponse(toolsBody);
        JsonNode tools = toolsResponse.path("result").path("tools");
        List<Map<String, Object>> interfaces = new ArrayList<>();
        if (tools.isArray()) {
            for (JsonNode tool : tools) {
                interfaces.add(mapper.convertValue(tool, Map.class));
            }
        }
        String capabilities = mapper.writeValueAsString(initialize.path("result").path("capabilities"));
        return new Discovery(interfaces, capabilities);
    }

    private JsonNode parseResponse(String body) throws Exception {
        if (body == null || body.isBlank()) return mapper.createObjectNode();
        String candidate = body.trim();
        // SSE MCP transports wrap JSON-RPC responses in one or more data lines.
        for (String line : candidate.split("\\R")) {
            if (line.startsWith("data:")) {
                String data = line.substring(5).trim();
                if (!data.isBlank() && !"[DONE]".equals(data)) candidate = data;
            }
        }
        return mapper.readTree(candidate);
    }

    private String authToken(String envName) {
        if (envName == null || envName.isBlank()) return null;
        String value = System.getenv(envName.trim());
        return value == null || value.isBlank() ? null : value;
    }

    private String safeMessage(Exception error) {
        if (error instanceof RestClientException && error.getMessage() != null) {
            return error.getMessage().replaceAll("(?i)(authorization|bearer)\\s+[^\\s]+", "$1 [redacted]");
        }
        return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
    }

    private void validate(McpServer server) {
        if (server == null || server.getName() == null || server.getName().isBlank()) {
            throw new IllegalArgumentException("MCP 服务名称不能为空");
        }
        if (server.getServerUrl() == null || server.getServerUrl().isBlank()) {
            throw new IllegalArgumentException("MCP 服务地址不能为空");
        }
        URI uri;
        try { uri = URI.create(server.getServerUrl().trim()); }
        catch (IllegalArgumentException error) { throw new IllegalArgumentException("MCP 服务地址格式无效"); }
        if (uri.getScheme() == null || !List.of("http", "https").contains(uri.getScheme().toLowerCase()) || uri.getHost() == null) {
            throw new IllegalArgumentException("MCP 服务仅支持 HTTP 或 HTTPS 地址");
        }
        if (uri.getUserInfo() != null || isCloudMetadata(uri.getHost())) {
            throw new IllegalArgumentException("MCP 服务地址不能包含凭据或云实例元数据地址");
        }
        if (!allowPrivateNetwork && resolvesToPrivateAddress(uri.getHost())) {
            throw new IllegalArgumentException("当前配置禁止访问内网或本机 MCP 服务");
        }
        if (server.getTransport() == null || !List.of("SSE", "STREAMABLE_HTTP").contains(server.getTransport().toUpperCase())) {
            throw new IllegalArgumentException("MCP 传输方式仅支持 SSE 或 Streamable HTTP");
        }
    }

    private void ensureNameAvailable(String name, String excludingId) {
        boolean duplicate = repository.findAll().stream().anyMatch(item -> !item.getId().equals(excludingId)
                && item.getName() != null && item.getName().trim().equalsIgnoreCase(name.trim()));
        if (duplicate) throw new IllegalArgumentException("MCP 服务名称已存在");
    }

    private boolean isCloudMetadata(String host) {
        String normalized = host.toLowerCase().replace("[", "").replace("]", "");
        return normalized.equals("169.254.169.254") || normalized.equals("metadata.google.internal")
                || normalized.equals("metadata.google.com");
    }

    private boolean resolvesToPrivateAddress(String host) {
        try {
            for (InetAddress address : InetAddress.getAllByName(host)) {
                if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                        || address.isSiteLocalAddress()) return true;
            }
        } catch (Exception ignored) {
            // DNS failures are surfaced by the health check instead of rejecting a valid hostname.
        }
        return false;
    }

    private record Discovery(List<Map<String, Object>> interfaces, String capabilitiesJson) {}
}
