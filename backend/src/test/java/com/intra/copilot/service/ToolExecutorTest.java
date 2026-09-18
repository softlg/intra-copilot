package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.ToolDefinition;
import com.intra.copilot.repo.McpServerRepository;
import com.intra.copilot.repo.ToolDefinitionRepository;
import com.intra.copilot.service.network.NetworkAddressPolicy;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class ToolExecutorTest {
    private HttpServer server;
    private ToolExecutor executor;
    private String baseUrl;

    @BeforeEach
    void setUp() throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
        executor =
                new ToolExecutor(
                        mock(ToolDefinitionRepository.class),
                        mock(McpServerRepository.class),
                        mock(McpServerService.class),
                        RestClient.builder(),
                        new ObjectMapper(),
                        new NetworkAddressPolicy(true));
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    @Test
    void getResolvesPathPlaceholdersAndQueryParameters() {
        AtomicReference<String> path = new AtomicReference<>();
        AtomicReference<String> query = new AtomicReference<>();
        server.createContext(
                "/items",
                exchange -> {
                    path.set(exchange.getRequestURI().getPath());
                    query.set(exchange.getRequestURI().getRawQuery());
                    respond(exchange, 200, "ok");
                });
        ToolDefinition tool = httpTool("GET", baseUrl + "/items/{id}");
        tool.setParameterSchema(
                "{\"type\":\"object\",\"required\":[\"id\"],\"properties\":{\"id\":{\"type\":\"integer\"},\"tag\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}}}}");

        ToolExecutor.ToolExecutionResult result =
                executor.executeDetailed(tool, "{\"id\":7,\"tag\":[\"a\",\"b\"]}");

        assertTrue(result.success());
        assertEquals("ok", result.output());
        assertEquals("/items/7", path.get());
        assertEquals("tag=a&tag=b", query.get());
    }

    @Test
    void postSendsRemainingArgumentsAsJsonBody() {
        AtomicReference<String> body = new AtomicReference<>();
        server.createContext(
                "/items",
                exchange -> {
                    body.set(
                            new String(
                                    exchange.getRequestBody().readAllBytes(),
                                    StandardCharsets.UTF_8));
                    respond(exchange, 201, "{\"id\":1}");
                });
        ToolDefinition tool = httpTool("POST", baseUrl + "/items");
        tool.setParameterSchema(
                "{\"type\":\"object\",\"required\":[\"name\"],\"properties\":{\"name\":{\"type\":\"string\"}}}");

        ToolExecutor.ToolExecutionResult result =
                executor.executeDetailed(tool, "{\"name\":\"example\"}");

        assertTrue(result.success());
        assertEquals("{\"name\":\"example\"}", body.get());
    }

    @Test
    void rejectsArgumentsThatDoNotMatchSchema() {
        ToolDefinition tool = httpTool("POST", baseUrl + "/items");
        tool.setParameterSchema(
                "{\"type\":\"object\",\"required\":[\"name\"],\"properties\":{\"name\":{\"type\":\"string\"}}}");

        ToolExecutor.ToolExecutionResult result = executor.executeDetailed(tool, "{\"name\":42}");

        assertFalse(result.success());
        assertTrue(result.output().contains("类型应为 string"));
    }

    @Test
    void doesNotFollowRedirects() {
        server.createContext(
                "/redirect",
                exchange -> {
                    exchange.getResponseHeaders().set("Location", "/items/1");
                    exchange.sendResponseHeaders(302, -1);
                    exchange.close();
                });
        server.createContext("/items/1", exchange -> respond(exchange, 200, "followed"));
        ToolDefinition tool = httpTool("GET", baseUrl + "/redirect");

        ToolExecutor.ToolExecutionResult result = executor.executeDetailed(tool, "{}");

        assertFalse(result.success());
        assertTrue(result.output().contains("HTTP 302"));
    }

    @Test
    void rejectsPlaceholdersInEndpointAuthority() {
        ToolDefinition tool = httpTool("GET", "http://{host}/items");

        ToolExecutor.ToolExecutionResult result =
                executor.executeDetailed(tool, "{\"host\":\"127.0.0.1\"}");

        assertFalse(result.success());
        assertTrue(result.output().contains("占位符只能用于路径或查询参数"));
    }

    @Test
    void normalizesBrowserProposalArguments() {
        ToolDefinition tool = new ToolDefinition();
        tool.setName("browser_action");
        tool.setType("BROWSER_PROPOSAL");
        tool.setParameterSchema(
                """
                {
                  "type": "object",
                  "additionalProperties": false,
                  "properties": {
                    "type": {"type": "string", "enum": ["CLICK", "FILL", "NAVIGATE", "SET_EDITOR"]},
                    "target": {"type": "string"},
                    "arguments": {"type": "object"},
                    "reason": {"type": "string"},
                    "risk": {"type": "string", "enum": ["low", "medium", "high"]}
                  },
                  "required": ["type", "reason", "risk"]
                }
                """);
        tool.setEnabled(true);

        ToolExecutor.ToolExecutionResult result =
                executor.executeDetailed(
                        tool,
                        """
                        {"reason":"fill","arguments":{"value":"ok"},"target":"ref_1","risk":"low","type":"fill","postcondition":{"valueEquals":"ok"}}
                        """);

        assertTrue(result.success());
        assertTrue(result.output().startsWith("BROWSER_PROPOSAL:"));
        assertTrue(result.output().contains("\"type\":\"FILL\""));
        assertTrue(result.output().contains("\"risk\":\"medium\""));
    }

    @Test
    void redactsNestedSensitiveArguments() {
        ToolDefinition tool = httpTool("POST", baseUrl + "/items");

        String redacted =
                executor.redactArguments(
                        tool,
                        "{\"name\":\"visible\",\"credentials\":{\"apiToken\":\"secret-value\"},\"password\":\"pw\"}");

        assertTrue(redacted.contains("\"name\":\"visible\""));
        assertTrue(redacted.contains("\"credentials\":\"[REDACTED]\""));
        assertTrue(redacted.contains("\"password\":\"[REDACTED]\""));
        assertFalse(redacted.contains("secret-value"));
        assertFalse(redacted.contains("\"pw\""));
    }

    private ToolDefinition httpTool(String method, String endpoint) {
        ToolDefinition tool = new ToolDefinition();
        tool.setName("test_tool");
        tool.setType("HTTP");
        tool.setMethod(method);
        tool.setEndpoint(endpoint);
        tool.setTimeoutMs(5000);
        tool.setEnabled(true);
        return tool;
    }

    private void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
