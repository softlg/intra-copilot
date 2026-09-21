package com.intra.copilot.application.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.domain.agent.AgentDefinition;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.ai.tool.ToolCallback;
import com.intra.copilot.domain.agent.Agent;

class SystemAgentBrokerTest {

    @Test
    void resolvesSharedBrowserCapabilityForGeneralCaller() {
        AgentRegistry registry = mock(AgentRegistry.class);
        when(registry.findPublished(SystemAgentCatalog.BROWSER_OPERATOR))
                .thenReturn(Optional.of(browserOperator()));
        SystemAgentBroker broker =
                new SystemAgentBroker(
                        new SystemAgentCatalog(), registry, new ObjectMapper());
        AgentDefinition caller = agent("finance-agent", "DOMAIN");
        String input =
                """
                {
                  "capability":"browser.operate",
                  "goal":"填写报工单并提交",
                  "businessContext":{"workOrder":"WO-1"},
                  "constraints":{"allowedActions":["TYPE","CLICK"],"maxRisk":"medium","maxSteps":6},
                  "successCriteria":["页面出现提交成功"]
                }
                """;

        ToolCallback callback = broker.callbackFor(caller);
        assertNotNull(callback);
        assertEquals(
                SystemAgentCatalog.DELEGATION_TOOL_NAME,
                callback.getToolDefinition().name());
        assertTrue(callback.call(input).startsWith(SystemAgentBroker.TASK_PREFIX));

        SystemAgentBroker.ResolvedTask task = broker.resolve(caller, input);
        assertEquals(SystemAgentCatalog.BROWSER_OPERATOR, task.target().getId());
        assertEquals("DELEGATE", task.request().mode());
        assertEquals(6, task.request().constraints().maxSteps());
        assertTrue(task.allowsAction("CLICK", "medium"));
        assertFalse(task.allowsAction("CLICK", "high"));
        assertFalse(task.allowsAction("NAVIGATE", "medium"));
        assertTrue(task.allowsAction("SNAPSHOT", "low"));
    }

    @Test
    void doesNotExposeCapabilityToItself() {
        AgentRegistry registry = mock(AgentRegistry.class);
        when(registry.findPublished(SystemAgentCatalog.BROWSER_OPERATOR))
                .thenReturn(Optional.of(browserOperator()));
        SystemAgentBroker broker =
                new SystemAgentBroker(
                        new SystemAgentCatalog(), registry, new ObjectMapper());
        AgentDefinition caller = agent(SystemAgentCatalog.BROWSER_OPERATOR, "GENERAL");

        assertFalse(broker.canDelegate(caller));
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        broker.resolve(
                                caller,
                                """
                                {"capability":"browser.operate","goal":"重复调用"}
                                """));
    }

    @Test
    void exposesAllRegisteredCapabilitiesInSchema() {
        AgentRegistry registry = mock(AgentRegistry.class);
        when(registry.findPublished(SystemAgentCatalog.BROWSER_OPERATOR))
                .thenReturn(Optional.of(browserOperator()));
        SystemAgentBroker broker =
                new SystemAgentBroker(
                        new SystemAgentCatalog(), registry, new ObjectMapper());

        String schema = broker.callbackFor(agent("general-1", "GENERAL")).getToolDefinition().inputSchema();

        assertTrue(schema.contains(SystemAgentCatalog.BROWSER_OPERATE));
        assertTrue(schema.contains(SystemAgentCatalog.BROWSER_EXTRACT));
        assertTrue(schema.contains("\"maxSteps\""));
        assertTrue(schema.contains("\"HANDOFF\""));
    }

    @Test
    void fallsBackToNextPublishedProviderForSameCapability() {
        SystemAgentCatalog catalog =
                new SystemAgentCatalog(
                        List.of(
                                spec("primary-operator", 10),
                                spec("secondary-operator", 20)));
        AgentRegistry registry = mock(AgentRegistry.class);
        when(registry.findPublished("primary-operator")).thenReturn(Optional.empty());
        when(registry.findPublished("secondary-operator"))
                .thenReturn(
                        Optional.of(
                                browserOperator("secondary-operator", "备用浏览器助手")));
        SystemAgentBroker broker = new SystemAgentBroker(catalog, registry, new ObjectMapper());

        SystemAgentBroker.ResolvedTask task =
                broker.resolve(
                        agent("general-1", "GENERAL"),
                        """
                        {"capability":"browser.operate","goal":"执行页面任务"}
                        """);

        assertEquals("secondary-operator", task.target().getId());
    }

    private AgentDefinition browserOperator() {
        return browserOperator(
                SystemAgentCatalog.BROWSER_OPERATOR, "浏览器操作助手");
    }

    private AgentDefinition browserOperator(String id, String displayName) {
        AgentDefinition definition = agent(id, "GENERAL");
        definition.setDisplayName(displayName);
        definition.setMaxPlanSteps(10);
        definition.setSystemAgent(true);
        definition.setOwnerType(SystemAgentGuard.SYSTEM_OWNER);
        definition.setManagementMode(SystemAgentGuard.SYSTEM_LOCKED);
        return definition;
    }

    private SystemAgentCatalog.Spec spec(String id, int priority) {
        return new SystemAgentCatalog.Spec(
                id,
                id,
                "测试系统 Agent",
                "执行系统任务",
                "GENERAL",
                false,
                priority,
                "AUTO",
                10,
                List.of(),
                false,
                false,
                true,
                List.of(
                        new SystemAgentCatalog.Capability(
                                SystemAgentCatalog.BROWSER_OPERATE, "浏览器操作")),
                Set.of("GENERAL", "DOMAIN"),
                SystemAgentCatalog.MAX_DELEGATION_DEPTH,
                SystemAgentCatalog.REVISION);
    }

    private AgentDefinition agent(String id, String role) {
        AgentDefinition definition = new AgentDefinition();
        definition.setId(id);
        definition.setRole(role);
        definition.setDisplayName(id);
        definition.setSystemPrompt("prompt");
        definition.setEnabled(true);
        definition.setPublished(true);
        definition.setPublishedVersion(1);
        return definition;
    }
}
