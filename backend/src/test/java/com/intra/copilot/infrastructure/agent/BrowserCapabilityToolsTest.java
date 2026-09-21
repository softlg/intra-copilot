package com.intra.copilot.infrastructure.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class BrowserCapabilityToolsTest {

    private final BrowserCapabilityTools tools = new BrowserCapabilityTools(new ObjectMapper());

    @Test
    void exposesFiveCodeOwnedBrowserTools() {
        assertEquals(5, tools.toolIds().size());
        assertTrue(tools.toolIds().contains("browser_act"));
        assertEquals(5, tools.syntheticDefinitions().size());
    }

    @Test
    void browserActBuildsValidatedActionPayload() {
        String output =
                tools.callback("browser_act")
                        .call(
                                """
                                {
                                  "action":"CLICK",
                                  "target":{"snapshotId":"snap_1","frameId":0,"elementId":"el_2"},
                                  "arguments":{},
                                  "reason":"点击运行按钮",
                                  "risk":"medium",
                                  "postcondition":{"textVisible":"运行结果"}
                                }
                                """);

        assertTrue(output.startsWith("BROWSER_ACTION:"));
        assertTrue(output.contains("\"type\":\"CLICK\""));
    }

    @Test
    void redactsTypedValuesAndUploads() {
        String redacted =
                tools.redactArguments(
                        "browser_act",
                        """
                        {"action":"TYPE","arguments":{"value":"secret"},"reason":"fill","risk":"medium"}
                        """);

        assertTrue(redacted.contains("[REDACTED]"));
        assertFalse(redacted.contains("secret"));
    }
}
