package com.intra.copilot.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.intra.copilot.model.SkillToolBinding;
import com.intra.copilot.model.ToolDefinition;
import com.intra.copilot.repo.AgentDefinitionRepository;
import com.intra.copilot.repo.SkillDefinitionRepository;
import com.intra.copilot.repo.SkillToolBindingRepository;
import com.intra.copilot.repo.ToolDefinitionRepository;
import com.intra.copilot.service.ToolExecutor;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class ToolSkillAdminControllerTest {

    @Test
    void togglesEnabledWithoutValidatingDuplicateLegacyNames() {
        ToolDefinitionRepository tools = mock(ToolDefinitionRepository.class);
        ToolDefinition first = tool("tool-1", "2", true);
        ToolDefinition duplicate = tool("tool-2", "2", true);
        when(tools.findById("tool-1")).thenReturn(Optional.of(first));
        when(tools.findAll()).thenReturn(List.of(first, duplicate));
        when(tools.save(any(ToolDefinition.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        ToolSkillAdminController controller = controller(tools);

        ToolDefinition updated =
                controller.toggleTool("tool-1", new ToolSkillAdminController.EnabledRequest(false));

        assertFalse(updated.isEnabled());
        verify(tools).save(first);
        verify(tools, never()).findAll();
    }

    @Test
    void createStillRejectsDuplicateToolNames() {
        ToolDefinitionRepository tools = mock(ToolDefinitionRepository.class);
        when(tools.findAll()).thenReturn(List.of(tool("tool-1", "2", true)));
        ToolSkillAdminController controller = controller(tools);

        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> controller.createTool(tool("tool-2", "2", true)));

        assertEquals("工具名称已存在", error.getMessage());
    }

    @Test
    void deleteRejectsToolReferencedBySkillBinding() {
        ToolDefinitionRepository tools = mock(ToolDefinitionRepository.class);
        SkillDefinitionRepository skills = mock(SkillDefinitionRepository.class);
        SkillToolBindingRepository skillToolBindings = mock(SkillToolBindingRepository.class);
        ToolDefinition disabledTool = tool("tool-1", "tool", false);
        SkillToolBinding binding = new SkillToolBinding();
        binding.setSkillId("skill-1");
        binding.setToolId("tool-1");
        when(tools.findById("tool-1")).thenReturn(Optional.of(disabledTool));
        when(skillToolBindings.findByToolId("tool-1")).thenReturn(List.of(binding));
        when(skills.findAll()).thenReturn(List.of());
        ToolSkillAdminController controller =
                new ToolSkillAdminController(
                        tools,
                        skills,
                        skillToolBindings,
                        mock(AgentDefinitionRepository.class),
                        mock(ToolExecutor.class),
                        true,
                        true);

        assertThrows(IllegalArgumentException.class, () -> controller.deleteTool("tool-1"));
    }

    @Test
    void updatePreservesExecutionFieldsAndCreatedAtWhenOmitted() {
        ToolDefinitionRepository tools = mock(ToolDefinitionRepository.class);
        ToolDefinition current = tool("tool-1", "existing_tool", true);
        current.setType("HTTP");
        current.setMethod("POST");
        current.setEndpoint("https://example.com/items");
        String schema =
                "{\"type\":\"object\",\"required\":[\"name\"],\"properties\":{\"name\":{\"type\":\"string\"}}}";
        current.setParameterSchema(schema);
        current.setTimeoutMs(4500);
        var createdAt = current.getCreatedAt();
        when(tools.findById("tool-1")).thenReturn(Optional.of(current));
        when(tools.findAll()).thenReturn(List.of(current));
        when(tools.save(any(ToolDefinition.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        ToolSkillAdminController controller = controller(tools);
        ToolDefinition update = new ToolDefinition();
        update.setName("renamed_tool");
        update.setDescription("Updated");
        update.setType("http");
        update.setMethod("get");
        update.setEndpoint("https://example.com/items/{id}");
        update.setEnabled(true);

        ToolDefinition saved = controller.updateTool("tool-1", update);

        assertSame(current, saved);
        assertEquals("HTTP", saved.getType());
        assertEquals("GET", saved.getMethod());
        assertEquals("https://example.com/items/{id}", saved.getEndpoint());
        assertEquals(schema, saved.getParameterSchema());
        assertEquals(4500, saved.getTimeoutMs());
        assertSame(createdAt, saved.getCreatedAt());
    }

    @Test
    void createNormalizesEditableFields() {
        ToolDefinitionRepository tools = mock(ToolDefinitionRepository.class);
        when(tools.findAll()).thenReturn(List.of());
        when(tools.save(any(ToolDefinition.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        ToolSkillAdminController controller = controller(tools);
        ToolDefinition create = new ToolDefinition();
        create.setName("  my_tool  ");
        create.setDescription("  test tool  ");
        create.setType("http");
        create.setMethod("post");
        create.setEndpoint("  https://example.com/items  ");
        create.setEnabled(true);

        ToolDefinition saved = controller.createTool(create);

        assertEquals("my_tool", saved.getName());
        assertEquals("test tool", saved.getDescription());
        assertEquals("HTTP", saved.getType());
        assertEquals("POST", saved.getMethod());
        assertEquals("https://example.com/items", saved.getEndpoint());
        assertEquals("{}", saved.getParameterSchema());
        assertEquals(10000, saved.getTimeoutMs());
    }

    @Test
    void createRejectsInvalidToolConfiguration() {
        ToolDefinitionRepository tools = mock(ToolDefinitionRepository.class);
        when(tools.findAll()).thenReturn(List.of());
        ToolSkillAdminController controller = controller(tools);

        ToolDefinition invalidName = tool("tool-1", "invalid name", true);
        invalidName.setType("BROWSER_PROPOSAL");
        assertThrows(IllegalArgumentException.class, () -> controller.createTool(invalidName));

        ToolDefinition invalidSchema = tool("tool-2", "schema_tool", true);
        invalidSchema.setType("BROWSER_PROPOSAL");
        invalidSchema.setParameterSchema("[]");
        assertThrows(IllegalArgumentException.class, () -> controller.createTool(invalidSchema));

        ToolDefinition invalidAuth = tool("tool-3", "auth_tool", true);
        invalidAuth.setType("HTTP");
        invalidAuth.setEndpoint("https://example.com/items");
        invalidAuth.setAuthHeaderName("Authorization");
        assertThrows(IllegalArgumentException.class, () -> controller.createTool(invalidAuth));

        ToolDefinition invalidAuthorityPlaceholder =
                tool("tool-4", "placeholder_tool", true);
        invalidAuthorityPlaceholder.setType("HTTP");
        invalidAuthorityPlaceholder.setEndpoint("https://{host}/items");
        assertThrows(
                IllegalArgumentException.class,
                () -> controller.createTool(invalidAuthorityPlaceholder));
    }

    @Test
    void testEndpointReturnsExecutorResult() {
        ToolDefinitionRepository tools = mock(ToolDefinitionRepository.class);
        ToolExecutor executor = mock(ToolExecutor.class);
        ToolDefinition tool = tool("tool-1", "test_tool", true);
        tool.setType("HTTP");
        when(tools.findById("tool-1")).thenReturn(Optional.of(tool));
        when(executor.executeDetailed(tool, "{\"id\":1}"))
                .thenReturn(new ToolExecutor.ToolExecutionResult(true, "ok"));
        ToolSkillAdminController controller = controller(tools, executor);

        var result =
                controller.testTool(
                        "tool-1", new ToolSkillAdminController.ToolTestRequest("{\"id\":1}"));

        assertEquals(true, result.get("success"));
        assertEquals("ok", result.get("output"));
    }

    private ToolSkillAdminController controller(ToolDefinitionRepository tools) {
        return controller(tools, mock(ToolExecutor.class));
    }

    private ToolSkillAdminController controller(
            ToolDefinitionRepository tools, ToolExecutor toolExecutor) {
        return new ToolSkillAdminController(
                tools,
                mock(SkillDefinitionRepository.class),
                mock(SkillToolBindingRepository.class),
                mock(AgentDefinitionRepository.class),
                toolExecutor,
                true,
                true);
    }

    private ToolDefinition tool(String id, String name, boolean enabled) {
        ToolDefinition tool = new ToolDefinition();
        tool.setId(id);
        tool.setName(name);
        tool.setEnabled(enabled);
        return tool;
    }
}
