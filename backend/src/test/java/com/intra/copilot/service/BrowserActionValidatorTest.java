package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class BrowserActionValidatorTest {

    private static final String SCHEMA =
            """
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "type": {"type": "string", "enum": ["CLICK", "FILL", "NAVIGATE", "SET_EDITOR"]},
                "target": {"type": "string"},
                "arguments": {"type": "object"},
                "reason": {"type": "string", "minLength": 1},
                "risk": {"type": "string", "enum": ["low", "medium", "high"]}
              },
              "required": ["type", "reason", "risk"]
            }
            """;

    @Test
    void acceptsTheSharedBrowserActionSchema() {
        BrowserActionValidator.validateSchema(SCHEMA);
    }

    @Test
    void rejectsSchemaWithoutClosedArguments() {
        String invalid = SCHEMA.replace("\"additionalProperties\": false,", "");

        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> BrowserActionValidator.validateSchema(invalid));

        assertTrue(error.getMessage().contains("additionalProperties=false"));
    }

    @Test
    void normalizesArgumentsRegardlessOfPropertyOrder() {
        BrowserActionValidator.NormalizedAction action =
                BrowserActionValidator.normalize(
                        """
                        {
                          "reason": "fill the editor",
                          "arguments": {"value": "package main"},
                          "target": "ref_12",
                          "risk": "low",
                          "type": "fill"
                        }
                        """);

        assertEquals("FILL", action.type());
        assertEquals("ref_12", action.target());
        assertEquals("medium", action.risk());
        assertEquals("{\"value\":\"package main\"}", action.argumentsJson());
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
}
