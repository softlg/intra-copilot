package com.intra.copilot.infrastructure.agent;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.application.agent.BrowserRuntime;
import com.intra.copilot.domain.agent.BrowserInteractionMode;
import com.intra.copilot.domain.agent.BrowserActionValidator;
import com.intra.copilot.domain.agent.BrowserTask;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

@EnabledIfEnvironmentVariable(named = "RUN_BROWSER_RUNTIME_TESTS", matches = "true")
class SeleniumBrowserRuntimeIntegrationTest {

    @Test
    void observesAndTypesInRealChrome() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/",
                exchange -> {
                    byte[] body =
                            "<html><body><input id='name' aria-label='name'><button>Run</button></body></html>"
                                    .getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().add("Content-Type", "text/html; charset=UTF-8");
                    exchange.sendResponseHeaders(200, body.length);
                    exchange.getResponseBody().write(body);
                    exchange.close();
                });
        server.start();
        String startUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/";
        SeleniumBrowserRuntime runtime =
                new SeleniumBrowserRuntime(
                        new ObjectMapper(),
                        true,
                        true,
                        30,
                        System.getProperty("browser.selenium.driver-path", ""),
                        "");
        BrowserTask task = new BrowserTask();
        task.setTaskId("BT-SELENIUM-TEST");
        task.setStartUrl(startUrl);
        task.setInteractionMode(BrowserInteractionMode.VISIBLE_VIRTUAL.name());

        BrowserRuntime.Observation observation = runtime.observe(task);
        String elementId = observation.frames().get(0).get("elements") instanceof java.util.List<?> values
                ? String.valueOf(((Map<?, ?>) values.get(0)).get("elementId"))
                : "sel_1";
        BrowserActionValidator.NormalizedAction action =
                BrowserActionValidator.normalize(
                        """
                        {
                          "type":"TYPE",
                          "target":{"snapshotId":"%s","frameId":0,"elementId":"%s"},
                          "arguments":{"value":"Codex"},
                          "reason":"填写输入框",
                          "risk":"medium",
                          "postcondition":{"valueEquals":"Codex"}
                        }
                        """
                                .formatted(observation.snapshotId(), elementId));

        BrowserRuntime.ActionResult result = runtime.execute(task, action);

        assertTrue(result.ok());
        assertTrue(result.verified());
        runtime.close(task);
        server.stop(0);
    }
}
