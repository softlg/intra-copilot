package com.intra.copilot.domain.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class BrowserActionValidatorTest {

    @Test
    void normalizesAndForcesMinimumRiskForWriteActions() {
        BrowserActionValidator.NormalizedAction action =
                BrowserActionValidator.normalize(
                        """
                        {
                          "reason": "fill the editor",
                          "arguments": {"value": "package main"},
                          "target": "ref_12",
                          "risk": "low",
                          "type": "fill",
                          "postcondition": {"valueEquals": "package main"}
                        }
                        """);

        assertEquals("FILL", action.type());
        assertEquals("ref_12", action.target());
        assertEquals("medium", action.risk());
        assertEquals("{\"value\":\"package main\"}", action.argumentsJson());
        assertFalse(action.readOnly());
    }

    @Test
    void acceptsStableSnapshotTargetAndPostcondition() {
        BrowserActionValidator.NormalizedAction action =
                BrowserActionValidator.normalize(
                        """
                        {
                          "type":"CLICK",
                          "target":{"snapshotId":"snap_1","frameId":2,"elementId":"el_7"},
                          "arguments":{},
                          "reason":"点击运行按钮",
                          "risk":"medium",
                          "postcondition":{"textVisible":"测试通过"}
                        }
                        """);

        assertTrue(action.target().contains("\"frameId\":2"));
        assertTrue(action.fullJson().contains("\"postcondition\""));
        assertEquals("medium", action.risk());
    }

    @Test
    void readOnlyActionsDefaultToLowRisk() {
        BrowserActionValidator.NormalizedAction action =
                BrowserActionValidator.normalize(
                        """
                        {"type":"SNAPSHOT","arguments":{},"reason":"读取页面状态"}
                        """);

        assertTrue(action.readOnly());
        assertEquals("low", action.risk());
    }

    @Test
    void rejectsIncompleteFillAction() {
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        BrowserActionValidator.normalize(
                                """
                                {"type":"FILL","target":"ref_1","arguments":{},"reason":"test","risk":"medium"}
                                """));
    }

    @Test
    void rejectsWriteActionWithoutPostcondition() {
        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () ->
                                BrowserActionValidator.normalize(
                                        """
                                        {"type":"CLICK","target":"ref_1","arguments":{},"reason":"test","risk":"medium"}
                                        """));
        assertTrue(error.getMessage().contains("postcondition"));
    }
}
