package com.intra.copilot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.McpServer;
import com.intra.copilot.model.ToolDefinition;
import com.intra.copilot.repo.McpServerRepository;
import com.intra.copilot.repo.ToolDefinitionRepository;
import com.intra.copilot.util.EntityIdGenerator;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Predicate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Registers MCP servers, performs a safe initialize / tools-list discovery, and
 * invokes tools via {@link #callTool}.
 *
 * <p>Supports both the Streamable HTTP transport (single endpoint, JSON-RPC over
 * HTTP with optional SSE responses) and the legacy HTTP+SSE transport (a GET
 * stream that advertises a message endpoint, then JSON-RPC over POST).
 */
@Service
public class McpServerService {
    private static final String PROTOCOL_VERSION = "2024-11-05";

    private final McpServerRepository repository;
    private final ToolDefinitionRepository toolRepository;
    private final ObjectMapper mapper;
    private final RestClient.Builder restClientBuilder;
    private final int timeoutMs;
    private final boolean allowPrivateNetwork;

    public McpServerService(
            McpServerRepository repository,
            ToolDefinitionRepository toolRepository,
            ObjectMapper mapper,
            RestClient.Builder restClientBuilder,
            @Value("${mcp.timeout-ms:8000}") int timeoutMs,
            @Value("${mcp.allow-private-network:true}") boolean allowPrivateNetwork) {
        this.repository = repository;
        this.toolRepository = toolRepository;
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
        server.setServerUrl(server.getServerUrl().trim());
        if (server.getTransport() != null) {
            server.setTransport(server.getTransport().toUpperCase());
        }
        // Reset any client-supplied health snapshot to avoid mass assignment.
        server.setStatus("UNKNOWN");
        server.setInterfaceCount(0);
        server.setInterfacesJson("[]");
        server.setCapabilitiesJson("{}");
        server.setLastError(null);
        server.setLastCheckedAt(null);
        server.setLastLatencyMs(null);
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

    public void delete(String id) {
        McpServer server = get(id);
        if (server.isEnabled()) {
            throw new IllegalArgumentException("MCP 服务处于启用状态，请先停用后再删除");
        }
        toolRepository.findAll().stream()
                .filter(t -> "MCP".equalsIgnoreCase(t.getType())
                        && server.getId().equals(t.getMcpServerId()))
                .forEach(t -> toolRepository.deleteById(t.getId()));
        repository.deleteById(id);
    }

    public McpServer checkHealth(String id) {
        McpServer server = get(id);
        // Re-validate the resolved address at request time to mitigate DNS rebinding.
        enforceSsrf(server.getServerUrl());
        Instant started = Instant.now();
        server.setLastCheckedAt(started);
        List<Map<String, Object>> discoveredInterfaces = List.of();
        try {
            Discovery discovery = discover(server);
            discoveredInterfaces = discovery.interfaces();
            server.setStatus(discovery.interfaces().isEmpty() ? "DEGRADED" : "HEALTHY");
            server.setInterfaceCount(discovery.interfaces().size());
            server.setInterfacesJson(mapper.writeValueAsString(discovery.interfaces()));
            server.setCapabilitiesJson(discovery.capabilitiesJson());
            server.setLastError(discovery.interfaces().isEmpty() ? "服务已连接，但未返回可用接口" : null);
        } catch (Exception error) {
            server.setStatus("UNHEALTHY");
            server.setInterfaceCount(0);
            server.setLastError(safeMessage(error));
        }
        server.setLastLatencyMs((int) Math.min(Integer.MAX_VALUE, Duration.between(started, Instant.now()).toMillis()));
        server.touch();
        McpServer saved = repository.save(server);
        // Keep the agent-callable tool catalogue in sync with the discovered interface list.
        syncTools(server, discoveredInterfaces);
        return saved;
    }

    /**
     * 周期性重新发现每个已启用的 MCP 服务，使镜像到 tool_definition 的工具目录与服务端保持一致
     * （新增/移除工具、能力漂移）。单个服务的失败由 checkHealth 记录在其自身的行上，循环不会整体中断。
     */
    @Scheduled(fixedDelayString = "${mcp.health-check-interval-ms:300000}")
    public void scheduledHealthCheck() {
        for (McpServer server : repository.findAll()) {
            if (!server.isEnabled()) continue;
            try {
                checkHealth(server.getId());
            } catch (Exception ignored) {
                // checkHealth 已把失败快照持久化到该行；此处无需额外处理。
            }
        }
    }

    /**
     * Invokes a tool on the given MCP server. Returns the textual tool result, or
     * throws on transport / JSON-RPC errors so the caller can surface a message.
     */
    public String callTool(McpServer server, String toolName, String argumentsJson) {
        enforceSsrf(server.getServerUrl());
        String transport = server.getTransport() == null ? "" : server.getTransport().toUpperCase();
        try {
            if ("SSE".equals(transport)) {
                return callToolSse(server, toolName, argumentsJson);
            }
            return callToolStreamableHttp(server, toolName, argumentsJson);
        } catch (Exception error) {
            throw new McpProtocolException("工具调用失败：" + safeMessage(error));
        }
    }

    private Discovery discover(McpServer server) throws Exception {
        String transport = server.getTransport() == null ? "" : server.getTransport().toUpperCase();
        if ("SSE".equals(transport)) {
            return discoverSse(server);
        }
        return discoverStreamableHttp(server);
    }

    /**
     * Mirrors the discovered MCP tools into {@link ToolDefinition} rows (type = MCP) so the agent
     * loop can resolve and invoke them. Existing rows bound to this server are upserted; tools that
     * disappeared from the server are removed; stale rows from other servers are left untouched.
     */
    private void syncTools(McpServer server, List<Map<String, Object>> interfaces) {
        List<ToolDefinition> existing = toolRepository.findAll().stream()
                .filter(t -> "MCP".equalsIgnoreCase(t.getType())
                        && server.getId().equals(t.getMcpServerId()))
                .collect(Collectors.toList());
        Set<String> incomingNames = interfaces.stream()
                .map(t -> String.valueOf(t.get("name")))
                .collect(Collectors.toCollection(HashSet::new));

        for (ToolDefinition t : existing) {
            if (!incomingNames.contains(t.getName())) {
                toolRepository.deleteById(t.getId());
            }
        }

        for (Map<String, Object> tool : interfaces) {
            String name = String.valueOf(tool.get("name"));
            String description = tool.get("description") == null ? "" : String.valueOf(tool.get("description"));
            Object schema = tool.get("inputSchema");
            String schemaJson;
            try {
                schemaJson = schema == null ? "{}" : mapper.writeValueAsString(schema);
            } catch (Exception ignored) {
                schemaJson = "{}";
            }
            ToolDefinition def = existing.stream()
                    .filter(t -> name.equals(t.getName()))
                    .findFirst()
                    .orElse(null);
            if (def == null) {
                def = new ToolDefinition();
                def.setId(EntityIdGenerator.next("TL"));
            }
            def.setName(name);
            def.setType("MCP");
            def.setDescription(description);
            def.setMcpServerId(server.getId());
            def.setParameterSchema(schemaJson);
            def.setEnabled(server.isEnabled());
            def.touch();
            toolRepository.save(def);
        }
    }

    // ---- Streamable HTTP -------------------------------------------------

    private Discovery discoverStreamableHttp(McpServer server) throws Exception {
        RestClient client = buildClient();
        ResponseEntity<String> initResp = rpc(client, server, null, 1, initParams(), "initialize");
        String sessionId = initResp.getHeaders().getFirst("Mcp-Session-Id");
        notifyInitialized(client, server, sessionId);
        ResponseEntity<String> listResp = rpc(client, server, sessionId, 2, Map.of(), "tools/list");

        JsonNode initJson = parseRpc(initResp.getBody());
        JsonNode listJson = parseRpc(listResp.getBody());
        return buildDiscovery(initJson, listJson);
    }

    private String callToolStreamableHttp(McpServer server, String toolName, String argumentsJson) throws Exception {
        RestClient client = buildClient();
        ResponseEntity<String> initResp = rpc(client, server, null, 1, initParams(), "initialize");
        String sessionId = initResp.getHeaders().getFirst("Mcp-Session-Id");
        notifyInitialized(client, server, sessionId);

        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", toolName);
        params.put("arguments", parseArguments(argumentsJson));
        ResponseEntity<String> callResp = rpc(client, server, sessionId, 3, params, "tools/call");
        JsonNode callJson = parseRpc(callResp.getBody());
        return formatToolResult(callJson);
    }

    private RestClient buildClient() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory() {
            @Override
            protected void prepareConnection(HttpURLConnection connection, String httpMethod) throws IOException {
                super.prepareConnection(connection, httpMethod);
                // Disable redirect following to prevent SSRF via 302 to cloud metadata / internal hosts.
                connection.setInstanceFollowRedirects(false);
            }
        };
        factory.setConnectTimeout(timeoutMs);
        factory.setReadTimeout(timeoutMs);
        return restClientBuilder.clone().requestFactory(factory).build();
    }

    private ResponseEntity<String> rpc(
            RestClient client, McpServer server, String sessionId, int id,
            Map<String, Object> params, String method) {
        var req = client.post().uri(server.getServerUrl())
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON, MediaType.TEXT_EVENT_STREAM)
                .header("MCP-Protocol-Version", PROTOCOL_VERSION);
        if (sessionId != null && !sessionId.isBlank()) {
            req.header("Mcp-Session-Id", sessionId);
        }
        String token = authToken(server.getAuthEnv());
        if (token != null) {
            req.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        }
        return req.body(Map.of(
                        "jsonrpc", "2.0",
                        "id", id,
                        "method", method,
                        "params", params))
                .retrieve()
                .toEntity(String.class);
    }

    private void notifyInitialized(RestClient client, McpServer server, String sessionId) {
        try {
            var req = client.post().uri(server.getServerUrl())
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON, MediaType.TEXT_EVENT_STREAM)
                    .header("MCP-Protocol-Version", PROTOCOL_VERSION);
            if (sessionId != null && !sessionId.isBlank()) {
                req.header("Mcp-Session-Id", sessionId);
            }
            String token = authToken(server.getAuthEnv());
            if (token != null) {
                req.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
            }
            req.body(Map.of(
                            "jsonrpc", "2.0",
                            "method", "notifications/initialized",
                            "params", Map.of()))
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception ignored) {
            // Notifications are best-effort; some servers ignore them.
        }
    }

    // ---- Legacy HTTP+SSE (double channel) --------------------------------

    private Discovery discoverSse(McpServer server) throws Exception {
        String token = authToken(server.getAuthEnv());
        try (SseChannel ch = openSse(server, token)) {
            String initBody = sseRequest(ch.postUrl, token, null, 1, initParams(), "initialize");
            String sessionId = ch.connection.getHeaderField("Mcp-Session-Id");
            sseRequest(ch.postUrl, token, sessionId, null, Map.of(), "notifications/initialized");
            sseRequest(ch.postUrl, token, sessionId, 2, Map.of(), "tools/list");

            String toolEvent = waitFor(ch.events, ch.buffer, e -> {
                try {
                    JsonNode n = parseEvent(e);
                    return n.path("id").asInt(-1) == 2 && n.has("result");
                } catch (Exception ex) {
                    return false;
                }
            }, timeoutMs);

            JsonNode initJson = parseRpc(initBody);
            JsonNode listJson = parseEvent(toolEvent);
            return buildDiscovery(initJson, listJson);
        }
    }

    private String callToolSse(McpServer server, String toolName, String argumentsJson) throws Exception {
        String token = authToken(server.getAuthEnv());
        try (SseChannel ch = openSse(server, token)) {
            sseRequest(ch.postUrl, token, null, 1, initParams(), "initialize");
            String sessionId = ch.connection.getHeaderField("Mcp-Session-Id");
            sseRequest(ch.postUrl, token, sessionId, null, Map.of(), "notifications/initialized");

            Map<String, Object> params = new LinkedHashMap<>();
            params.put("name", toolName);
            params.put("arguments", parseArguments(argumentsJson));
            sseRequest(ch.postUrl, token, sessionId, 3, params, "tools/call");

            String callEvent = waitFor(ch.events, ch.buffer, e -> {
                try {
                    JsonNode n = parseEvent(e);
                    return n.path("id").asInt(-1) == 3 && n.has("result");
                } catch (Exception ex) {
                    return false;
                }
            }, timeoutMs);
            JsonNode callJson = parseEvent(callEvent);
            if (callJson.has("error")) {
                JsonNode err = callJson.get("error");
                String message = err.has("message") ? err.get("message").asText() : err.toString();
                throw new McpProtocolException("MCP 返回错误: " + message);
            }
            return formatToolResult(callJson);
        }
    }

    private SseChannel openSse(McpServer server, String token) throws Exception {
        URI base = URI.create(server.getServerUrl());
        HttpURLConnection conn = (HttpURLConnection) base.toURL().openConnection();
        conn.setInstanceFollowRedirects(false);
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(timeoutMs);
        conn.setReadTimeout(timeoutMs);
        conn.setRequestProperty("Accept", "text/event-stream");
        if (token != null) {
            conn.setRequestProperty("Authorization", "Bearer " + token);
        }
        conn.connect();

        BlockingQueue<String> events = new LinkedBlockingQueue<>();
        Deque<String> buffer = new ArrayDeque<>();
        AtomicBoolean closed = new AtomicBoolean(false);
        ExecutorService reader = Executors.newSingleThreadExecutor();
        reader.submit(() -> {
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                StringBuilder block = new StringBuilder();
                String line;
                while (!closed.get() && (line = br.readLine()) != null) {
                    if (line.isEmpty()) {
                        if (block.length() > 0) {
                            events.put(block.toString());
                            block.setLength(0);
                        }
                    } else if (line.startsWith("event:")) {
                        block.append("event:").append(line.substring(6).trim()).append("\n");
                    } else if (line.startsWith("data:")) {
                        block.append("data:").append(line.substring(5).trim()).append("\n");
                    }
                }
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
            } catch (Exception ignored) {
                // Stream closed or read interrupted; discovery will time out.
            }
        });

        String endpointEvent = waitFor(events, buffer, e -> e.contains("event:endpoint"), timeoutMs);
        String endpointPath = eventData(endpointEvent);
        if (endpointPath.isBlank()) {
            closed.set(true);
            reader.shutdownNow();
            conn.disconnect();
            throw new McpProtocolException("SSE 流未返回 endpoint 事件");
        }
        String postUrl = base.resolve(endpointPath).toString();
        return new SseChannel(conn, events, buffer, closed, reader, postUrl);
    }

    private String sseRequest(
            String url, String token, String sessionId, Integer id,
            Map<String, Object> params, String method) throws Exception {
        HttpURLConnection c = (HttpURLConnection) URI.create(url).toURL().openConnection();
        c.setInstanceFollowRedirects(false);
        c.setRequestMethod("POST");
        c.setConnectTimeout(timeoutMs);
        c.setReadTimeout(timeoutMs);
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/json");
        c.setRequestProperty("Accept", "application/json, text/event-stream");
        c.setRequestProperty("MCP-Protocol-Version", PROTOCOL_VERSION);
        if (sessionId != null && !sessionId.isBlank()) {
            c.setRequestProperty("Mcp-Session-Id", sessionId);
        }
        if (token != null) {
            c.setRequestProperty("Authorization", "Bearer " + token);
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("jsonrpc", "2.0");
        if (id != null) {
            payload.put("id", id);
        }
        payload.put("method", method);
        payload.put("params", params);
        byte[] bytes = mapper.writeValueAsBytes(payload);
        try (OutputStream os = c.getOutputStream()) {
            os.write(bytes);
        }
        int code = c.getResponseCode();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(
                code < 400 ? c.getInputStream() : c.getErrorStream(), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) {
                sb.append(line).append("\n");
            }
            return sb.toString();
        }
    }

    // ---- Shared parsing helpers ------------------------------------------

    private String waitFor(
            BlockingQueue<String> queue, Deque<String> buffer,
            Predicate<String> predicate, long timeoutMs) throws Exception {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            String e;
            while ((e = queue.poll()) != null) {
                buffer.addLast(e);
            }
            for (Iterator<String> it = buffer.iterator(); it.hasNext(); ) {
                String candidate = it.next();
                if (predicate.test(candidate)) {
                    it.remove();
                    return candidate;
                }
            }
            long remaining = deadline - System.currentTimeMillis();
            if (remaining <= 0) {
                break;
            }
            e = queue.poll(remaining, TimeUnit.MILLISECONDS);
            if (e == null) {
                break;
            }
            buffer.addLast(e);
        }
        throw new McpProtocolException("等待 MCP 响应超时（" + timeoutMs + "ms）");
    }

    private String eventData(String eventBlock) {
        for (String line : eventBlock.split("\\R")) {
            if (line.startsWith("data:")) {
                return line.substring(5).trim();
            }
        }
        return "";
    }

    private JsonNode parseEvent(String eventBlock) throws Exception {
        return mapper.readTree(eventData(eventBlock));
    }

    private JsonNode parseRpc(String body) throws Exception {
        JsonNode root = parseResponse(body);
        if (root.has("error")) {
            JsonNode err = root.get("error");
            String message = err.has("message") ? err.get("message").asText() : err.toString();
            throw new McpProtocolException("MCP 返回错误: " + message);
        }
        return root;
    }

    private JsonNode parseResponse(String body) throws Exception {
        if (body == null || body.isBlank()) {
            return mapper.createObjectNode();
        }
        String candidate = body.trim();
        // SSE / Streamable HTTP transports may wrap JSON-RPC responses in data lines.
        for (String line : candidate.split("\\R")) {
            if (line.startsWith("data:")) {
                String data = line.substring(5).trim();
                if (!data.isBlank() && !"[DONE]".equals(data)) {
                    candidate = data;
                }
            }
        }
        return mapper.readTree(candidate);
    }

    private String formatToolResult(JsonNode callJson) {
        JsonNode result = callJson.path("result");
        if (result.path("isError").asBoolean(false)) {
            StringBuilder sb = new StringBuilder();
            for (JsonNode c : result.path("content")) {
                if ("text".equals(c.path("type").asText())) {
                    sb.append(c.path("text").asText());
                }
            }
            throw new McpProtocolException("工具返回错误：" + sb);
        }
        StringBuilder sb = new StringBuilder();
        for (JsonNode c : result.path("content")) {
            if ("text".equals(c.path("type").asText())) {
                sb.append(c.path("text").asText()).append("\n");
            } else {
                sb.append(c.toString()).append("\n");
            }
        }
        return sb.toString().trim();
    }

    private Discovery buildDiscovery(JsonNode initJson, JsonNode listJson) throws Exception {
        JsonNode tools = listJson.path("result").path("tools");
        List<Map<String, Object>> interfaces = new ArrayList<>();
        if (tools.isArray()) {
            for (JsonNode tool : tools) {
                interfaces.add(mapper.convertValue(tool, Map.class));
            }
        }
        String capabilities = mapper.writeValueAsString(initJson.path("result").path("capabilities"));
        return new Discovery(interfaces, capabilities);
    }

    private Map<String, Object> initParams() {
        return Map.of(
                "protocolVersion", PROTOCOL_VERSION,
                "capabilities", Map.of(),
                "clientInfo", Map.of("name", "intra-copilot-admin", "version", "1.0"));
    }

    private Object parseArguments(String argumentsJson) {
        try {
            return mapper.readValue(argumentsJson == null ? "{}" : argumentsJson, Object.class);
        } catch (Exception ignored) {
            return Map.of();
        }
    }

    private String authToken(String envName) {
        if (envName == null || envName.isBlank()) {
            return null;
        }
        String value = System.getenv(envName.trim());
        return value == null || value.isBlank() ? null : value;
    }

    private String safeMessage(Exception error) {
        if (error instanceof McpProtocolException) {
            return error.getMessage();
        }
        if (error instanceof RestClientException && error.getMessage() != null) {
            return error.getMessage()
                    .replaceAll("(?i)(authorization|bearer)\\s+[^\\s]+", "$1 [redacted]");
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
        try {
            uri = URI.create(server.getServerUrl().trim());
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("MCP 服务地址格式无效");
        }
        if (uri.getScheme() == null || !List.of("http", "https").contains(uri.getScheme().toLowerCase())
                || uri.getHost() == null) {
            throw new IllegalArgumentException("MCP 服务仅支持 HTTP 或 HTTPS 地址");
        }
        if (uri.getUserInfo() != null || isCloudMetadata(uri.getHost())) {
            throw new IllegalArgumentException("MCP 服务地址不能包含凭据或云实例元数据地址");
        }
        if (!allowPrivateNetwork && resolvesToPrivateAddress(uri.getHost())) {
            throw new IllegalArgumentException("当前配置禁止访问内网或本机 MCP 服务");
        }
        if (server.getTransport() == null
                || !List.of("SSE", "STREAMABLE_HTTP").contains(server.getTransport().toUpperCase())) {
            throw new IllegalArgumentException("MCP 传输方式仅支持 SSE 或 Streamable HTTP");
        }
    }

    private void enforceSsrf(String serverUrl) {
        try {
            URI uri = URI.create(serverUrl.trim());
            String host = uri.getHost();
            if (host == null) {
                return;
            }
            if (isCloudMetadata(host)) {
                throw new IllegalArgumentException("禁止访问云实例元数据地址");
            }
            if (!allowPrivateNetwork && resolvesToPrivateAddress(host)) {
                throw new IllegalArgumentException("当前配置禁止访问内网或本机 MCP 服务");
            }
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ignored) {
            // DNS resolution failures are surfaced by the actual request.
        }
    }

    private void ensureNameAvailable(String name, String excludingId) {
        boolean duplicate = repository.findAll().stream()
                .anyMatch(item -> !item.getId().equals(excludingId)
                        && item.getName() != null && item.getName().trim().equalsIgnoreCase(name.trim()));
        if (duplicate) {
            throw new IllegalArgumentException("MCP 服务名称已存在");
        }
    }

    private boolean isCloudMetadata(String host) {
        String normalized = host.toLowerCase().replace("[", "").replace("]", "");
        return normalized.equals("169.254.169.254")
                || normalized.equals("metadata.google.internal")
                || normalized.equals("metadata.google.com");
    }

    private boolean resolvesToPrivateAddress(String host) {
        try {
            for (InetAddress address : InetAddress.getAllByName(host)) {
                if (address.isAnyLocalAddress() || address.isLoopbackAddress()
                        || address.isLinkLocalAddress() || address.isSiteLocalAddress()) {
                    return true;
                }
            }
        } catch (Exception ignored) {
            // DNS failures are surfaced by the health check instead of rejecting a valid hostname.
        }
        return false;
    }

    /** Thrown when the MCP handshake or a JSON-RPC error prevents discovery. */
    private static final class McpProtocolException extends RuntimeException {
        McpProtocolException(String message) {
            super(message);
        }
    }

    private record Discovery(List<Map<String, Object>> interfaces, String capabilitiesJson) {}

    private static final class SseChannel implements AutoCloseable {
        final HttpURLConnection connection;
        final BlockingQueue<String> events;
        final Deque<String> buffer;
        final AtomicBoolean closed;
        final ExecutorService reader;
        final String postUrl;

        SseChannel(HttpURLConnection connection, BlockingQueue<String> events, Deque<String> buffer,
                AtomicBoolean closed, ExecutorService reader, String postUrl) {
            this.connection = connection;
            this.events = events;
            this.buffer = buffer;
            this.closed = closed;
            this.reader = reader;
            this.postUrl = postUrl;
        }

        @Override
        public void close() {
            closed.set(true);
            reader.shutdownNow();
            connection.disconnect();
        }
    }
}
