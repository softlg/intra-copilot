package com.intra.copilot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.McpServer;
import com.intra.copilot.model.ToolDefinition;
import com.intra.copilot.repo.AgentDefinitionRepository;
import com.intra.copilot.repo.McpServerRepository;
import com.intra.copilot.repo.SkillToolBindingRepository;
import com.intra.copilot.repo.ToolDefinitionRepository;
import com.intra.copilot.util.EntityIdGenerator;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Deque;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Registers MCP servers, performs a safe initialize / tools-list discovery, and invokes tools via
 * {@link #callTool}.
 *
 * <p>Supports three transports:
 *
 * <ul>
 *   <li>Streamable HTTP — single endpoint, JSON-RPC over HTTP with optional SSE responses;
 *   <li>legacy HTTP+SSE — a GET stream that advertises a message endpoint, then JSON-RPC over POST;
 *   <li>STDIO — spawns a local subprocess and exchanges newline-delimited JSON-RPC over its
 *       stdin/stdout (gated behind {@code mcp.allow-stdio}, default false, because it executes a
 *       local command).
 * </ul>
 *
 * <p>To avoid re-establishing transport state on every agent turn, a per-server session is cached:
 * STDIO keeps the subprocess alive across calls (initialize runs once), and Streamable HTTP reuses
 * the negotiated {@code Mcp-Session-Id} to skip the initialize round-trip. Sessions are evicted
 * after {@code mcp.session-idle-ms} of inactivity (SSE stays per-call, as its long-lived GET stream
 * is fragile to reuse).
 */
@Service
public class McpServerService {
    private static final String PROTOCOL_VERSION = "2024-11-05";
    private static final Logger log = LoggerFactory.getLogger(McpServerService.class);

    private final McpServerRepository repository;
    private final ToolDefinitionRepository toolRepository;
    private final AgentDefinitionRepository agents;
    private final SkillToolBindingRepository skillToolBindings;
    private final ObjectMapper mapper;
    private final RestClient.Builder restClientBuilder;
    private final int timeoutMs;
    private final boolean allowPrivateNetwork;
    private final boolean allowStdio;
    private final long sessionIdleMs;
    /** Per-server cached transport session (live STDIO process or HTTP session id). */
    private final ConcurrentHashMap<String, McpSession> sessions = new ConcurrentHashMap<>();

    public McpServerService(
            McpServerRepository repository,
            ToolDefinitionRepository toolRepository,
            AgentDefinitionRepository agents,
            SkillToolBindingRepository skillToolBindings,
            ObjectMapper mapper,
            RestClient.Builder restClientBuilder,
            @Value("${mcp.timeout-ms:8000}") int timeoutMs,
            @Value("${mcp.allow-private-network:true}") boolean allowPrivateNetwork,
            @Value("${mcp.allow-stdio:false}") boolean allowStdio,
            @Value("${mcp.session-idle-ms:300000}") long sessionIdleMs) {
        this.repository = repository;
        this.toolRepository = toolRepository;
        this.agents = agents;
        this.skillToolBindings = skillToolBindings;
        this.mapper = mapper;
        this.restClientBuilder = restClientBuilder;
        this.timeoutMs = Math.max(1000, Math.min(30000, timeoutMs));
        this.allowPrivateNetwork = allowPrivateNetwork;
        this.allowStdio = allowStdio;
        this.sessionIdleMs = Math.max(5000, sessionIdleMs);
    }

    public List<McpServer> list() {
        return repository.findAll();
    }

    public McpServer get(String id) {
        return repository.findById(id).orElseThrow(() -> new IllegalArgumentException("MCP 服务不存在"));
    }

    public McpServer create(McpServer server) {
        validate(server);
        ensureNameAvailable(server.getName(), null);
        String actor =
                com.intra.copilot.service.auth.RequestContext.currentOrAnonymous().actorLabel();
        server.setCreatedBy(actor);
        server.setUpdatedBy(actor);
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
        current.setUpdatedBy(
                com.intra.copilot.service.auth.RequestContext.currentOrAnonymous().actorLabel());
        current.setName(value.getName().trim());
        current.setDescription(value.getDescription());
        current.setServerUrl(value.getServerUrl().trim());
        current.setTransport(value.getTransport().toUpperCase());
        current.setAuthEnv(value.getAuthEnv());
        current.setEnabled(value.isEnabled());
        boolean configChanged =
                !Objects.equals(current.getTransport(), value.getTransport().toUpperCase())
                        || !Objects.equals(current.getServerUrl(), value.getServerUrl().trim());
        current.touch();
        McpServer saved = repository.save(current);
        syncToolEnabledState(saved);
        if (configChanged) {
            // 传输方式或地址变了，缓存的连接/进程已失效，立即逐出。
            evictSession(current.getId());
        }
        return saved;
    }

    public void delete(String id) {
        McpServer server = get(id);
        if (server.isEnabled()) {
            throw new IllegalArgumentException("MCP 服务处于启用状态，请先停用后再删除");
        }
        List<ToolDefinition> mirroredTools =
                toolRepository
                        .findAll()
                        .stream()
                        .filter(
                                t ->
                                        "MCP".equalsIgnoreCase(t.getType())
                                                && server.getId().equals(t.getMcpServerId()))
                        .toList();
        for (ToolDefinition tool : mirroredTools) {
            ensureToolNotReferenced(tool.getId());
        }
        evictSession(id);
        mirroredTools.forEach(t -> toolRepository.deleteById(t.getId()));
        repository.deleteById(id);
    }

    public McpServer checkHealth(String id) {
        McpServer server = get(id);
        // Re-validate the resolved address at request time to mitigate DNS rebinding.
        // STDIO 传输以命令启动本地进程，不涉及网络地址，跳过校验。
        if (!"STDIO".equals(server.getTransport())) {
            enforceSsrf(server.getServerUrl());
        }
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
        server.setLastLatencyMs(
                (int)
                        Math.min(
                                Integer.MAX_VALUE,
                                Duration.between(started, Instant.now()).toMillis()));
        server.touch();
        McpServer saved = repository.save(server);
        // Keep the agent-callable tool catalogue in sync with the discovered interface list.
        syncTools(server, discoveredInterfaces);
        return saved;
    }

    /**
     * 周期性重新发现每个已启用的 MCP 服务，使镜像到 tool_definition 的 Tool 目录与服务端保持一致 （新增/移除 Tool、能力漂移）。单个服务的失败由
     * checkHealth 记录在其自身的行上，循环不会整体中断。
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
     * Invokes a tool on the given MCP server. Returns the textual tool result, or throws on
     * transport / JSON-RPC errors so the caller can surface a message.
     */
    public String callTool(McpServer server, String toolName, String argumentsJson) {
        String transport = server.getTransport() == null ? "" : server.getTransport().toUpperCase();
        if (!"STDIO".equals(transport)) {
            enforceSsrf(server.getServerUrl());
        }
        try {
            if ("SSE".equals(transport)) {
                return callToolSse(server, toolName, argumentsJson);
            }
            if ("STDIO".equals(transport)) {
                return callToolStdio(server, toolName, argumentsJson);
            }
            return callToolStreamableHttp(server, toolName, argumentsJson);
        } catch (Exception error) {
            throw new McpProtocolException("Tool 调用失败：" + safeMessage(error));
        }
    }

    private Discovery discover(McpServer server) throws Exception {
        String transport = server.getTransport() == null ? "" : server.getTransport().toUpperCase();
        if ("SSE".equals(transport)) {
            return discoverSse(server);
        }
        if ("STDIO".equals(transport)) {
            return discoverStdio(server);
        }
        return discoverStreamableHttp(server);
    }

    /**
     * Mirrors the discovered MCP tools into {@link ToolDefinition} rows (type = MCP) so the agent
     * loop can resolve and invoke them. Existing rows bound to this server are upserted; tools that
     * disappeared from the server are removed; stale rows from other servers are left untouched.
     */
    private void syncTools(McpServer server, List<Map<String, Object>> interfaces) {
        List<ToolDefinition> existing =
                toolRepository
                        .findAll()
                        .stream()
                        .filter(
                                t ->
                                        "MCP".equalsIgnoreCase(t.getType())
                                                && server.getId().equals(t.getMcpServerId()))
                        .collect(Collectors.toList());
        Map<String, ToolDefinition> byRemoteName =
                existing.stream()
                        .filter(t -> t.getRemoteName() != null && !t.getRemoteName().isBlank())
                        .collect(
                                Collectors.toMap(
                                        ToolDefinition::getRemoteName,
                                        t -> t,
                                        (left, right) -> left));
        Set<String> incomingNames =
                interfaces
                        .stream()
                        .map(t -> String.valueOf(t.get("name")))
                        .collect(Collectors.toCollection(HashSet::new));

        for (ToolDefinition t : existing) {
            String remoteName =
                    t.getRemoteName() == null || t.getRemoteName().isBlank()
                            ? t.getName()
                            : t.getRemoteName();
            if (!incomingNames.contains(remoteName)) {
                if (isToolReferenced(t.getId())) {
                    t.setEnabled(false);
                    t.touch();
                    toolRepository.save(t);
                } else {
                    toolRepository.deleteById(t.getId());
                }
            }
        }

        Set<String> claimedRemoteNames = new HashSet<>();
        for (Map<String, Object> tool : interfaces) {
            String remoteName = String.valueOf(tool.get("name"));
            if (remoteName.isBlank() || !claimedRemoteNames.add(remoteName)) continue;
            String description =
                    tool.get("description") == null ? "" : String.valueOf(tool.get("description"));
            Object schema = tool.get("inputSchema");
            String schemaJson;
            try {
                schemaJson = schema == null ? "{}" : mapper.writeValueAsString(schema);
            } catch (Exception ignored) {
                schemaJson = "{}";
            }
            ToolDefinition def = byRemoteName.get(remoteName);
            if (def == null) {
                def = new ToolDefinition();
                def.setId(EntityIdGenerator.next("TL"));
            }
            String functionName = uniqueFunctionName(remoteName, def.getId());
            def.setName(functionName);
            def.setRemoteName(remoteName);
            def.setType("MCP");
            def.setDescription(
                    remoteName.equals(functionName)
                            ? description
                            : "MCP 原名："
                                    + remoteName
                                    + (description.isBlank() ? "" : "\n" + description));
            def.setMcpServerId(server.getId());
            def.setParameterSchema(schemaJson);
            def.setTimeoutMs(def.getTimeoutMs() == null ? 10000 : def.getTimeoutMs());
            def.setEnabled(server.isEnabled());
            def.touch();
            toolRepository.save(def);
        }
        syncToolEnabledState(server);
    }

    private void syncToolEnabledState(McpServer server) {
        for (ToolDefinition tool : toolRepository.findAll()) {
            if ("MCP".equalsIgnoreCase(tool.getType())
                    && server.getId().equals(tool.getMcpServerId())
                    && tool.isEnabled() != server.isEnabled()) {
                tool.setEnabled(server.isEnabled());
                tool.touch();
                toolRepository.save(tool);
            }
        }
    }

    private String uniqueFunctionName(String remoteName, String toolId) {
        String base = sanitizeFunctionName(remoteName);
        boolean conflict =
                toolRepository
                        .findAll()
                        .stream()
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

    private boolean isToolReferenced(String toolId) {
        return agents.findAll()
                        .stream()
                        .anyMatch(agent -> containsToolId(agent.getToolIds(), toolId))
                || !skillToolBindings.findByToolId(toolId).isEmpty();
    }

    private void ensureToolNotReferenced(String toolId) {
        List<String> agentNames =
                agents.findAll()
                        .stream()
                        .filter(agent -> containsToolId(agent.getToolIds(), toolId))
                        .map(
                                agent ->
                                        agent.getDisplayName() == null
                                                ? agent.getId()
                                                : agent.getDisplayName())
                        .toList();
        List<String> skillIds =
                skillToolBindings
                        .findByToolId(toolId)
                        .stream()
                        .map(binding -> binding.getSkillId())
                        .distinct()
                        .toList();
        if (agentNames.isEmpty() && skillIds.isEmpty()) return;
        StringBuilder message = new StringBuilder("MCP Tool 仍被引用，无法删除（请先解除绑定）：");
        if (!agentNames.isEmpty())
            message.append(" Agent[").append(String.join("、", agentNames)).append("]");
        if (!skillIds.isEmpty())
            message.append(" Skill[").append(String.join("、", skillIds)).append("]");
        throw new IllegalArgumentException(message.toString());
    }

    private boolean containsToolId(String toolIdsJson, String toolId) {
        if (toolIdsJson == null || toolIdsJson.isBlank()) return false;
        try {
            JsonNode root = mapper.readTree(toolIdsJson);
            if (!root.isArray()) return false;
            for (JsonNode value : root) {
                if (toolId.equals(value.asText())) return true;
            }
        } catch (Exception ignored) {
            return false;
        }
        return false;
    }

    // ---- Session cache (connection / process reuse) ----------------------

    private McpSession sessionFor(McpServer server) {
        return sessions.computeIfAbsent(
                server.getId(), id -> new McpSession(server.getTransport()));
    }

    /** Drop a cached session, but only if it is not currently in use (a later sweep retries). */
    private void evictSession(String serverId) {
        McpSession session = sessions.get(serverId);
        if (session == null) return;
        if (!session.lock.tryLock()) return;
        try {
            sessions.remove(serverId);
            session.close();
        } finally {
            session.lock.unlock();
        }
    }

    /** Invalidate cached transport state after a failed call so the next attempt re-establishes. */
    private void invalidate(McpSession session) {
        if (session.stdio != null) {
            try {
                session.stdio.close();
            } catch (Exception ignored) {
            }
        }
        session.stdio = null;
        session.sessionId = null;
        session.initialized = false;
    }

    /** Close sessions idle longer than mcp.session-idle-ms; skips sessions in use by a call. */
    @Scheduled(fixedDelay = 60000)
    public void evictIdleSessions() {
        long now = System.currentTimeMillis();
        for (Entry<String, McpSession> entry : sessions.entrySet()) {
            McpSession session = entry.getValue();
            if (now - session.lastUsedAt < sessionIdleMs) continue;
            if (!session.lock.tryLock()) continue;
            try {
                sessions.remove(entry.getKey());
                session.close();
            } finally {
                session.lock.unlock();
            }
        }
    }

    private String ensureSessionStreamableHttp(
            McpServer server, McpSession session, RestClient client) throws Exception {
        if (session.sessionId != null && !session.sessionId.isBlank()) {
            return session.sessionId;
        }
        ResponseEntity<String> initResp =
                rpc(client, server, null, session.nextId(), initParams(), "initialize");
        String sessionId = initResp.getHeaders().getFirst("Mcp-Session-Id");
        notifyInitialized(client, server, sessionId);
        session.sessionId = sessionId;
        session.initialized = true;
        session.lastUsedAt = System.currentTimeMillis();
        return sessionId;
    }

    private StdioChannel acquireStdio(McpServer server, McpSession session) throws Exception {
        if (session.stdio != null && session.stdio.process.isAlive() && session.initialized) {
            return session.stdio;
        }
        if (session.stdio != null) {
            try {
                session.stdio.close();
            } catch (Exception ignored) {
            }
            session.stdio = null;
            session.initialized = false;
        }
        StdioChannel ch = openStdio(server);
        try {
            int initId = session.nextId();
            writeStdio(ch, rpcMsg(initId, "initialize", initParams()));
            String initBody = waitFor(ch.queue, ch.buffer, e -> matchId(e, initId), timeoutMs);
            writeStdio(ch, rpcMsg(null, "notifications/initialized", Map.of()));
            session.capabilitiesJson =
                    mapper.writeValueAsString(
                            parseRpc(initBody).path("result").path("capabilities"));
            session.stdio = ch;
            session.initialized = true;
            return ch;
        } catch (Exception error) {
            try {
                ch.close();
            } catch (Exception ignored) {
            }
            throw error;
        }
    }

    // ---- Streamable HTTP -------------------------------------------------

    private Discovery discoverStreamableHttp(McpServer server) throws Exception {
        McpSession session = sessionFor(server);
        session.lock.lock();
        try {
            // Discovery re-initializes every run (infrequent: health check / create / update) so it
            // always captures current capabilities, and refreshes the cached session id for calls.
            RestClient client = buildClient();
            ResponseEntity<String> initResp =
                    rpc(client, server, null, session.nextId(), initParams(), "initialize");
            String sessionId = initResp.getHeaders().getFirst("Mcp-Session-Id");
            notifyInitialized(client, server, sessionId);
            ResponseEntity<String> listResp =
                    rpc(client, server, sessionId, session.nextId(), Map.of(), "tools/list");
            JsonNode initJson = parseRpc(initResp.getBody());
            JsonNode listJson = parseRpc(listResp.getBody());
            session.sessionId = sessionId;
            session.initialized = true;
            session.lastUsedAt = System.currentTimeMillis();
            return buildDiscovery(initJson, listJson);
        } catch (Exception error) {
            invalidate(session);
            throw error;
        } finally {
            session.lock.unlock();
        }
    }

    private String callToolStreamableHttp(McpServer server, String toolName, String argumentsJson)
            throws Exception {
        McpSession session = sessionFor(server);
        session.lock.lock();
        try {
            // Reuse the cached session id to skip the initialize round-trip on every tool call.
            RestClient client = buildClient();
            String sessionId = ensureSessionStreamableHttp(server, session, client);
            int id = session.nextId();
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("name", toolName);
            params.put("arguments", parseArguments(argumentsJson));
            ResponseEntity<String> callResp =
                    rpc(client, server, sessionId, id, params, "tools/call");
            session.lastUsedAt = System.currentTimeMillis();
            return formatToolResult(parseRpc(callResp.getBody()));
        } catch (Exception error) {
            invalidate(session);
            throw error;
        } finally {
            session.lock.unlock();
        }
    }

    private RestClient buildClient() {
        SimpleClientHttpRequestFactory factory =
                new SimpleClientHttpRequestFactory() {
                    @Override
                    protected void prepareConnection(
                            HttpURLConnection connection, String httpMethod) throws IOException {
                        super.prepareConnection(connection, httpMethod);
                        // Disable redirect following to prevent SSRF via 302 to cloud metadata /
                        // internal hosts.
                        connection.setInstanceFollowRedirects(false);
                    }
                };
        factory.setConnectTimeout(timeoutMs);
        factory.setReadTimeout(timeoutMs);
        return restClientBuilder.clone().requestFactory(factory).build();
    }

    private ResponseEntity<String> rpc(
            RestClient client,
            McpServer server,
            String sessionId,
            int id,
            Map<String, Object> params,
            String method) {
        var req =
                client.post()
                        .uri(server.getServerUrl())
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
        return req.body(
                        Map.of(
                                "jsonrpc", "2.0",
                                "id", id,
                                "method", method,
                                "params", params))
                .retrieve()
                .toEntity(String.class);
    }

    private void notifyInitialized(RestClient client, McpServer server, String sessionId) {
        try {
            var req =
                    client.post()
                            .uri(server.getServerUrl())
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
            req.body(
                            Map.of(
                                    "jsonrpc", "2.0",
                                    "method", "notifications/initialized",
                                    "params", Map.of()))
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception ignored) {
            // Notifications are best-effort; some servers ignore them.
        }
    }

    // ---- STDIO (local subprocess, newline-delimited JSON-RPC) ------------

    private Discovery discoverStdio(McpServer server) throws Exception {
        McpSession session = sessionFor(server);
        session.lock.lock();
        try {
            // Reuses the cached live subprocess; re-initializes only when the channel is cold.
            StdioChannel ch = acquireStdio(server, session);
            int id = session.nextId();
            writeStdio(ch, rpcMsg(id, "tools/list", Map.of()));
            String listBody = waitFor(ch.queue, ch.buffer, e -> matchId(e, id), timeoutMs);
            JsonNode listJson = parseRpc(listBody);
            session.lastUsedAt = System.currentTimeMillis();
            return new Discovery(buildInterfaces(listJson), session.capabilitiesJson);
        } catch (Exception error) {
            invalidate(session);
            throw error;
        } finally {
            session.lock.unlock();
        }
    }

    private String callToolStdio(McpServer server, String toolName, String argumentsJson)
            throws Exception {
        McpSession session = sessionFor(server);
        session.lock.lock();
        try {
            // Reuses the cached live subprocess across calls; never re-spawns per invocation.
            StdioChannel ch = acquireStdio(server, session);
            int id = session.nextId();
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("name", toolName);
            params.put("arguments", parseArguments(argumentsJson));
            writeStdio(ch, rpcMsg(id, "tools/call", params));
            String callBody = waitFor(ch.queue, ch.buffer, e -> matchId(e, id), timeoutMs);
            JsonNode callJson = parseRpc(callBody);
            session.lastUsedAt = System.currentTimeMillis();
            return formatToolResult(callJson);
        } catch (Exception error) {
            invalidate(session);
            throw error;
        } finally {
            session.lock.unlock();
        }
    }

    private StdioChannel openStdio(McpServer server) throws Exception {
        String commandLine = server.getServerUrl().trim();
        List<String> args =
                Arrays.stream(commandLine.split("\\s+"))
                        .filter(s -> !s.isBlank())
                        .collect(Collectors.toList());
        if (args.isEmpty()) {
            throw new McpProtocolException("STDIO 启动命令为空");
        }
        ProcessBuilder pb = new ProcessBuilder(args);
        pb.redirectErrorStream(false);
        Map<String, String> env = pb.environment();
        String token = authToken(server.getAuthEnv());
        if (token != null && server.getAuthEnv() != null && !server.getAuthEnv().isBlank()) {
            // 将解析到的令牌以环境变量形式注入子进程，MCP 服务可自行读取。
            env.put(server.getAuthEnv().trim(), token);
        }
        Process process = pb.start();
        BlockingQueue<String> queue = new LinkedBlockingQueue<>();
        Deque<String> buffer = new ArrayDeque<>();
        AtomicBoolean closed = new AtomicBoolean(false);
        BufferedWriter writer =
                new BufferedWriter(
                        new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8));
        ExecutorService reader = Executors.newSingleThreadExecutor();
        reader.submit(
                () -> {
                    try (BufferedReader br =
                            new BufferedReader(
                                    new InputStreamReader(
                                            process.getInputStream(), StandardCharsets.UTF_8))) {
                        String line;
                        while (!closed.get() && (line = br.readLine()) != null) {
                            if (!line.isBlank()) queue.add(line);
                        }
                    } catch (Exception ignored) {
                        // 子进程退出或流关闭，discover/call 会在超时后抛出。
                    } finally {
                        closed.set(true);
                    }
                });
        ExecutorService errReader = Executors.newSingleThreadExecutor();
        errReader.submit(
                () -> {
                    try (BufferedReader br =
                            new BufferedReader(
                                    new InputStreamReader(
                                            process.getErrorStream(), StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = br.readLine()) != null) {
                            log.debug("[mcp-stderr] {}: {}", server.getName(), line);
                        }
                    } catch (Exception ignored) {
                    }
                });
        return new StdioChannel(process, writer, queue, buffer, closed, reader, errReader);
    }

    private void writeStdio(StdioChannel ch, Map<String, Object> message) throws IOException {
        ch.writer.write(mapper.writeValueAsString(message));
        ch.writer.write("\n");
        ch.writer.flush();
    }

    private boolean matchId(String line, int id) {
        try {
            JsonNode node = mapper.readTree(line);
            return node.path("id").asInt(-1) == id && (node.has("result") || node.has("error"));
        } catch (Exception ignored) {
            return false;
        }
    }

    private Map<String, Object> rpcMsg(Integer id, String method, Object params) {
        Map<String, Object> message = new LinkedHashMap<>();
        message.put("jsonrpc", "2.0");
        if (id != null) message.put("id", id);
        message.put("method", method);
        message.put("params", params);
        return message;
    }

    // ---- Legacy HTTP+SSE (double channel) --------------------------------

    private Discovery discoverSse(McpServer server) throws Exception {
        String token = authToken(server.getAuthEnv());
        try (SseChannel ch = openSse(server, token)) {
            String initBody = sseRequest(ch.postUrl, token, null, 1, initParams(), "initialize");
            String sessionId = ch.connection.getHeaderField("Mcp-Session-Id");
            sseRequest(ch.postUrl, token, sessionId, null, Map.of(), "notifications/initialized");
            sseRequest(ch.postUrl, token, sessionId, 2, Map.of(), "tools/list");

            String toolEvent =
                    waitFor(
                            ch.events,
                            ch.buffer,
                            e -> {
                                try {
                                    JsonNode n = parseEvent(e);
                                    return n.path("id").asInt(-1) == 2 && n.has("result");
                                } catch (Exception ex) {
                                    return false;
                                }
                            },
                            timeoutMs);

            JsonNode initJson = parseRpc(initBody);
            JsonNode listJson = parseEvent(toolEvent);
            return buildDiscovery(initJson, listJson);
        }
    }

    private String callToolSse(McpServer server, String toolName, String argumentsJson)
            throws Exception {
        String token = authToken(server.getAuthEnv());
        try (SseChannel ch = openSse(server, token)) {
            sseRequest(ch.postUrl, token, null, 1, initParams(), "initialize");
            String sessionId = ch.connection.getHeaderField("Mcp-Session-Id");
            sseRequest(ch.postUrl, token, sessionId, null, Map.of(), "notifications/initialized");

            Map<String, Object> params = new LinkedHashMap<>();
            params.put("name", toolName);
            params.put("arguments", parseArguments(argumentsJson));
            sseRequest(ch.postUrl, token, sessionId, 3, params, "tools/call");

            String callEvent =
                    waitFor(
                            ch.events,
                            ch.buffer,
                            e -> {
                                try {
                                    JsonNode n = parseEvent(e);
                                    return n.path("id").asInt(-1) == 3 && n.has("result");
                                } catch (Exception ex) {
                                    return false;
                                }
                            },
                            timeoutMs);
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
        reader.submit(
                () -> {
                    try (BufferedReader br =
                            new BufferedReader(
                                    new InputStreamReader(
                                            conn.getInputStream(), StandardCharsets.UTF_8))) {
                        StringBuilder block = new StringBuilder();
                        String line;
                        while (!closed.get() && (line = br.readLine()) != null) {
                            if (line.isEmpty()) {
                                if (block.length() > 0) {
                                    events.put(block.toString());
                                    block.setLength(0);
                                }
                            } else if (line.startsWith("event:")) {
                                block.append("event:")
                                        .append(line.substring(6).trim())
                                        .append("\n");
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

        String endpointEvent =
                waitFor(events, buffer, e -> e.contains("event:endpoint"), timeoutMs);
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
            String url,
            String token,
            String sessionId,
            Integer id,
            Map<String, Object> params,
            String method)
            throws Exception {
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
        try (BufferedReader r =
                new BufferedReader(
                        new InputStreamReader(
                                code < 400 ? c.getInputStream() : c.getErrorStream(),
                                StandardCharsets.UTF_8))) {
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
            BlockingQueue<String> queue,
            Deque<String> buffer,
            Predicate<String> predicate,
            long timeoutMs)
            throws Exception {
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
            throw new McpProtocolException("Tool 返回错误：" + sb);
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
        return new Discovery(
                buildInterfaces(listJson),
                mapper.writeValueAsString(initJson.path("result").path("capabilities")));
    }

    private List<Map<String, Object>> buildInterfaces(JsonNode listJson) {
        JsonNode tools = listJson.path("result").path("tools");
        List<Map<String, Object>> interfaces = new ArrayList<>();
        if (tools.isArray()) {
            for (JsonNode tool : tools) {
                interfaces.add(mapper.convertValue(tool, Map.class));
            }
        }
        return interfaces;
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
        String transport = server.getTransport() == null ? "" : server.getTransport().toUpperCase();
        if ("STDIO".equals(transport)) {
            if (!allowStdio) {
                throw new IllegalArgumentException("当前配置禁止 STDIO 传输（需开启 mcp.allow-stdio）");
            }
            // serverUrl 作为本地启动命令，不校验 URL / SSRF；命令经 ProcessBuilder 以参数数组执行，无 shell 注入风险。
            return;
        }
        URI uri;
        try {
            uri = URI.create(server.getServerUrl().trim());
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("MCP 服务地址格式无效");
        }
        if (uri.getScheme() == null
                || !List.of("http", "https").contains(uri.getScheme().toLowerCase())
                || uri.getHost() == null) {
            throw new IllegalArgumentException("MCP 服务仅支持 HTTP 或 HTTPS 地址");
        }
        if (uri.getUserInfo() != null || isCloudMetadata(uri.getHost())) {
            throw new IllegalArgumentException("MCP 服务地址不能包含凭据或云实例元数据地址");
        }
        if (!allowPrivateNetwork && resolvesToPrivateAddress(uri.getHost())) {
            throw new IllegalArgumentException("当前配置禁止访问内网或本机 MCP 服务");
        }
        if (!List.of("SSE", "STREAMABLE_HTTP").contains(transport)) {
            throw new IllegalArgumentException("MCP 传输方式仅支持 SSE、Streamable HTTP 或 STDIO");
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
        boolean duplicate =
                repository
                        .findAll()
                        .stream()
                        .anyMatch(
                                item ->
                                        !item.getId().equals(excludingId)
                                                && item.getName() != null
                                                && item.getName()
                                                        .trim()
                                                        .equalsIgnoreCase(name.trim()));
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
                if (address.isAnyLocalAddress()
                        || address.isLoopbackAddress()
                        || address.isLinkLocalAddress()
                        || address.isSiteLocalAddress()) {
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

    /**
     * Cached transport session for one MCP server, keyed by server id in {@link #sessions}. Holds
     * either a live STDIO subprocess (for the STDIO transport) or a cached HTTP session id (for
     * Streamable HTTP). A per-session lock serializes all calls on the stateful channel; the idle
     * sweeper closes sessions that have not been used recently.
     */
    private static final class McpSession implements AutoCloseable {
        final String transport;
        final ReentrantLock lock = new ReentrantLock();
        final AtomicInteger requestId = new AtomicInteger(1);
        volatile long lastUsedAt = System.currentTimeMillis();
        volatile boolean initialized = false;
        volatile String sessionId;
        volatile String capabilitiesJson = "{}";
        volatile StdioChannel stdio;

        McpSession(String transport) {
            this.transport = transport == null ? "" : transport.toUpperCase();
        }

        int nextId() {
            return requestId.getAndIncrement();
        }

        @Override
        public void close() {
            if (stdio != null) stdio.close();
            stdio = null;
            sessionId = null;
            initialized = false;
        }
    }

    private static final class StdioChannel implements AutoCloseable {
        final Process process;
        final BufferedWriter writer;
        final BlockingQueue<String> queue;
        final Deque<String> buffer;
        final AtomicBoolean closed;
        final ExecutorService reader;
        final ExecutorService errReader;

        StdioChannel(
                Process process,
                BufferedWriter writer,
                BlockingQueue<String> queue,
                Deque<String> buffer,
                AtomicBoolean closed,
                ExecutorService reader,
                ExecutorService errReader) {
            this.process = process;
            this.writer = writer;
            this.queue = queue;
            this.buffer = buffer;
            this.closed = closed;
            this.reader = reader;
            this.errReader = errReader;
        }

        @Override
        public void close() {
            closed.set(true);
            try {
                writer.close();
            } catch (IOException ignored) {
            }
            if (process.isAlive()) process.destroyForcibly();
            reader.shutdownNow();
            errReader.shutdownNow();
        }
    }

    private static final class SseChannel implements AutoCloseable {
        final HttpURLConnection connection;
        final BlockingQueue<String> events;
        final Deque<String> buffer;
        final AtomicBoolean closed;
        final ExecutorService reader;
        final String postUrl;

        SseChannel(
                HttpURLConnection connection,
                BlockingQueue<String> events,
                Deque<String> buffer,
                AtomicBoolean closed,
                ExecutorService reader,
                String postUrl) {
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
