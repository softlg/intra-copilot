package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.model.ToolDefinition;
import com.intra.copilot.repo.AgentPlanRepository;
import com.intra.copilot.repo.AgentPlanStepRepository;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;

class PlanningServiceTest {

    @Test
    void parsesValidPlanAndNormalizesSteps() {
        ToolDefinition tool = new ToolDefinition();
        tool.setName("crm.search");
        String raw =
                """
                {
                  "goal": "查找客户并整理结果",
                  "summary": "先查询再汇总",
                  "steps": [
                    {
                      "title": "查询客户",
                      "description": "按名称查询",
                      "toolNames": ["crm.search"],
                      "dependsOn": [],
                      "successCriteria": "返回客户列表"
                    }
                  ]
                }
                """;

        PlanningService.PlanDraft plan =
                PlanningService.parsePlan(raw, List.of(tool), "agent-1", 6);

        assertNotNull(plan);
        assertEquals("查找客户并整理结果", plan.goal());
        assertEquals(1, plan.steps().size());
        assertEquals("agent-1", plan.steps().get(0).agentId());
        assertEquals(List.of("crm.search"), plan.steps().get(0).toolNames());
    }

    @Test
    void rejectsToolOutsideAgentAllowlist() {
        ToolDefinition tool = new ToolDefinition();
        tool.setName("crm.search");
        String raw =
                """
                {"goal":"查询","steps":[{"title":"越权","toolNames":["admin.delete"]}]}
                """;

        assertNull(PlanningService.parsePlan(raw, List.of(tool), "agent-1", 6));
    }

    @Test
    void rejectsPlansOverConfiguredStepLimit() {
        String raw =
                """
                {"goal":"批量处理","steps":[
                  {"title":"步骤一","toolNames":[]},
                  {"title":"步骤二","toolNames":[]},
                  {"title":"步骤三","toolNames":[]}
                ]}
                """;

        assertNull(PlanningService.parsePlan(raw, List.of(), "agent-1", 2));
    }

    @Test
    void appliesPlanningModeAndTaskComplexity() {
        PlanningService service =
                new PlanningService(
                        mock(LlmClient.class),
                        new ObjectMapper(),
                        mock(PlanningPersistenceService.class),
                        15);
        AgentDefinition definition = new AgentDefinition();
        definition.setId("agent-1");
        definition.setPlanningMode("AUTO");

        assertFalse(service.shouldPlan(definition, "你好", List.of()));
        assertTrue(service.shouldPlan(definition, "请先查询客户，然后整理结果", List.of()));

        definition.setPlanningMode("OFF");
        assertFalse(service.shouldPlan(definition, "请先查询客户，然后整理结果", List.of()));

        definition.setPlanningMode("ALWAYS");
        assertTrue(service.shouldPlan(definition, "你好", List.of()));
    }

    @Test
    void modelPlanningMethodsDoNotOwnDatabaseTransactions() {
        assertTrue(
                java.util.Arrays.stream(PlanningService.class.getDeclaredMethods())
                        .filter(
                                method ->
                                        method.getName().equals("createPlan")
                                                || method.getName().equals("createPlanOutcome")
                                                || method.getName().equals("revisePlan"))
                        .noneMatch(method -> method.isAnnotationPresent(Transactional.class)));
    }
}
