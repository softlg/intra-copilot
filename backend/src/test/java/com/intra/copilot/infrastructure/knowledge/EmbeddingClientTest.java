package com.intra.copilot.infrastructure.knowledge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.application.knowledge.EmbeddingProfileService;
import com.intra.copilot.domain.knowledge.EmbeddingProfile;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class EmbeddingClientTest {
    private HttpServer server;
    private EmbeddingClient client;

    @BeforeEach
    void setUp() throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.start();
        client =
                new EmbeddingClient(
                        new ObjectMapper(),
                        new MockEnvironment(),
                        mock(EmbeddingProfileService.class),
                        mock(EmbeddingRateLimiter.class));
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    @Test
    void usesTheProfileBaseUrlAndApiKey() {
        AtomicReference<String> authorization = new AtomicReference<>();
        AtomicReference<String> body = new AtomicReference<>();
        server.createContext(
                "/embeddings",
                exchange -> {
                    authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
                    body.set(
                            new String(
                                    exchange.getRequestBody().readAllBytes(),
                                    StandardCharsets.UTF_8));
                    respond(exchange, "{\"data\":[{\"embedding\":[0.1,0.2]}]}");
                });

        EmbeddingProfile profile = new EmbeddingProfile();
        profile.setName("自定义模型");
        profile.setProvider("custom");
        profile.setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
        profile.setModel("custom-embedding");
        profile.setApiKey("custom-key");
        profile.setDimension(2);

        List<Double> embedding = client.embed("hello", profile);

        assertEquals(List.of(0.1, 0.2), embedding);
        assertEquals("Bearer custom-key", authorization.get());
        assertTrue(body.get().contains("\"model\":\"custom-embedding\""));
        assertTrue(body.get().contains("\"input\":\"hello\""));
    }

    private void respond(HttpExchange exchange, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
