package com.intra.copilot.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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
                        true,
                        true);

        assertThrows(IllegalArgumentException.class, () -> controller.deleteTool("tool-1"));
    }

    private ToolSkillAdminController controller(ToolDefinitionRepository tools) {
        return new ToolSkillAdminController(
                tools,
                mock(SkillDefinitionRepository.class),
                mock(SkillToolBindingRepository.class),
                mock(AgentDefinitionRepository.class),
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
