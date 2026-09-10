package com.intra.copilot.agent;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.service.AgentRegistry;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class RouterAgentTest {
    private final AgentRegistry registry = mock(AgentRegistry.class);
    private final RouterAgent router = new RouterAgent(new GeneralAgent(), registry);

    @Test
    void fallsBackToIntraCopilotWhenNoRoutingRulesConfigured() {
        when(registry.allDefinitions()).thenReturn(List.of());
        assertEquals("assistant", router.route("页面报错，帮我排查").id());
    }

    @Test
    void asksClarificationWhenUnknown() {
        when(registry.allDefinitions()).thenReturn(List.of());
        assertEquals("assistant", router.route("你好").id());
    }

    @Test
    void honoursConfiguredRoutingRules() {
        AgentDefinition routeCopilot = new AgentDefinition();
        routeCopilot.setId("route-copilot");
        routeCopilot.setRoutingRules("报销 => finance-agent\n请假 -> hr-agent");
        when(registry.allDefinitions()).thenReturn(List.of(routeCopilot));

        AgentDefinition finance = new AgentDefinition();
        finance.setId("finance-agent");
        finance.setRole("GENERAL");
        finance.setSystemPrompt("finance");
        when(registry.findEnabled("finance-agent")).thenReturn(Optional.of(new ConfigurableAgent(finance)));

        assertEquals("finance-agent", router.route("帮我报销这笔费用").id());
    }

    @Test
    void fallsBackWhenRuleTargetIsNotEnabled() {
        AgentDefinition routeCopilot = new AgentDefinition();
        routeCopilot.setId("route-copilot");
        routeCopilot.setRoutingRules("报销 => finance-agent");
        when(registry.allDefinitions()).thenReturn(List.of(routeCopilot));
        when(registry.findEnabled(anyString())).thenReturn(Optional.empty());

        assertEquals("assistant", router.route("帮我报销这笔费用").id());
    }
}
