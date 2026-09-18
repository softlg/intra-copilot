package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AdminCopilotBuildPlanTest {
    @Test
    void buildPlanContainsNestedStepsAndManualConfirmation() {
        Map<String, Object> state =
                Map.of(
                        "displayName",
                        "合同审阅助手",
                        "goal",
                        "输出合同风险清单",
                        "responseStyle",
                        "STRUCTURED",
                        "actionPolicy",
                        "CONFIRM_WRITE",
                        "resourcePlan",
                        List.of("KNOWLEDGE_BASE"),
                        "defaultsConfirmed",
                        true);

        Map<String, Object> plan = AdminCopilotService.buildAgentGenerationPlan(state);

        assertEquals("AWAITING_CONFIRMATION", plan.get("status"));
        assertEquals(Boolean.TRUE, plan.get("requiresConfirmation"));
        List<?> steps = (List<?>) plan.get("steps");
        assertEquals(5, steps.size());
        Map<?, ?> saveStep = (Map<?, ?>) steps.get(4);
        List<?> substeps = (List<?>) saveStep.get("substeps");
        Map<?, ?> applySubstep = (Map<?, ?>) substeps.get(1);
        assertEquals(Boolean.TRUE, applySubstep.get("requiresConfirmation"));
    }

    @Test
    void guidedQuestionCombinesOptionsWithCustomInput() {
        Map<String, Object> question = AdminCopilotService.guidedBuildQuestion("role");

        assertEquals("role", question.get("field"));
        assertEquals(Boolean.TRUE, question.get("required"));
        assertEquals(Boolean.TRUE, question.get("allowCustom"));
        List<?> options = (List<?>) question.get("options");
        assertEquals(3, options.size());
        assertFalse(String.valueOf(question.get("placeholder")).isBlank());

        Map<String, Object> resources = AdminCopilotService.guidedBuildQuestion("resourcePlan");
        assertTrue(Boolean.TRUE.equals(resources.get("multiple")));
    }
}
