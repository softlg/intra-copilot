package com.intra.copilot.application.agent;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.intra.copilot.domain.agent.AgentDefinition;
import com.intra.copilot.domain.agent.ConfigurableAgent;
import com.intra.copilot.domain.agent.GeneralAgent;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class RouterAgentTest {
    private final AgentRegistry registry = mock(AgentRegistry.class);
    private final RouterAgent router = new RouterAgent(new GeneralAgent(), registry);

    @Test
    void fallsBackToIntraCopilotWhenNoRoutingRulesConfigured() {
        when(registry.findPublished("route-copilot")).thenReturn(Optional.empty());
        assertEquals("assistant", router.route("页面报错，帮我排查").id());
    }

    @Test
    void asksClarificationWhenUnknown() {
        when(registry.findPublished("route-copilot")).thenReturn(Optional.empty());
        assertEquals("assistant", router.route("你好").id());
    }

    @Test
    void honoursConfiguredRoutingRules() {
        AgentDefinition routeCopilot = new AgentDefinition();
        routeCopilot.setId("route-copilot");
        routeCopilot.setRoutingRules("报销 => finance-agent\n请假 -> hr-agent");
        when(registry.findPublished("route-copilot")).thenReturn(Optional.of(routeCopilot));

        AgentDefinition finance = new AgentDefinition();
        finance.setId("finance-agent");
        finance.setRole("GENERAL");
        finance.setSystemPrompt("finance");
        when(registry.findEnabled("finance-agent"))
                .thenReturn(Optional.of(new ConfigurableAgent(finance)));

        assertEquals("finance-agent", router.route("帮我报销这笔费用").id());
    }

    @Test
    void fallsBackWhenRuleTargetIsNotEnabled() {
        AgentDefinition routeCopilot = new AgentDefinition();
        routeCopilot.setId("route-copilot");
        routeCopilot.setRoutingRules("报销 => finance-agent");
        when(registry.findPublished("route-copilot")).thenReturn(Optional.of(routeCopilot));
        when(registry.findEnabled(anyString())).thenReturn(Optional.empty());

        assertEquals("assistant", router.route("帮我报销这笔费用").id());
    }

    @Test
    void routesBrowserOperationsToSystemOperatorWhenLlmRoutingIsUnavailable() {
        when(registry.findPublished("route-copilot")).thenReturn(Optional.empty());
        AgentDefinition browser = new AgentDefinition();
        browser.setId("browser-operator");
        browser.setRole("GENERAL");
        browser.setSystemPrompt("browser");
        when(registry.findEnabled("browser-operator"))
                .thenReturn(Optional.of(new ConfigurableAgent(browser)));

        assertEquals("browser-operator", router.route("帮我在页面上填写并提交").id());
    }
}
