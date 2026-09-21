package com.intra.copilot.application.capability;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.intra.copilot.domain.agent.AgentSkillBinding;
import com.intra.copilot.domain.capability.SkillDefinition;
import com.intra.copilot.domain.capability.SkillDefinitionVersion;
import com.intra.copilot.infrastructure.persistence.agent.AgentSkillBindingRepository;
import com.intra.copilot.infrastructure.persistence.capability.SkillDefinitionRepository;
import com.intra.copilot.infrastructure.persistence.capability.SkillDefinitionVersionRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class SkillPromptAssemblerTest {

    @Test
    void runtimeUsesPublishedSnapshotInsteadOfMutableDraft() {
        SkillDefinitionRepository skills = mock(SkillDefinitionRepository.class);
        SkillDefinitionVersionRepository versions = mock(SkillDefinitionVersionRepository.class);
        AgentSkillBindingRepository bindings = mock(AgentSkillBindingRepository.class);
        SkillDefinition skill = skill("draft prompt", "ALWAYS", "{}");
        skill.setActivationMode("KEYWORD");
        skill.setActivationConfig("{\"keywords\":[\"refund\"]}");
        SkillDefinitionVersion published = version("published prompt", "[\"tool-1\"]");

        when(skills.findById("skill-1")).thenReturn(Optional.of(skill));
        when(versions.findBySkillIdAndVersion("skill-1", 1L)).thenReturn(Optional.of(published));
        AgentSkillBinding binding = new AgentSkillBinding();
        binding.setAgentId("agent-1");
        binding.setSkillId("skill-1");
        binding.setEnabled(true);
        when(bindings.findByAgentId("agent-1")).thenReturn(List.of(binding));

        SkillPromptAssembler assembler =
                new SkillPromptAssembler(skills, versions, bindings, 24000);
        SkillPromptAssembler.Assembly assembly =
                assembler.assembleForAgent("agent-1", List.of(), "base", "hello", true);

        assertTrue(assembly.systemPrompt().contains("published prompt"));
        assertFalse(assembly.systemPrompt().contains("draft prompt"));
        assertEquals(List.of("tool-1"), assembly.toolIds());
        assertEquals(1, assembly.appliedSkills().size());
        verify(skills).incrementUsage(eq("skill-1"), any(Instant.class));
    }

    @Test
    void keywordActivationSkipsNonMatchingInput() {
        SkillDefinitionRepository skills = mock(SkillDefinitionRepository.class);
        SkillDefinitionVersionRepository versions = mock(SkillDefinitionVersionRepository.class);
        AgentSkillBindingRepository bindings = mock(AgentSkillBindingRepository.class);
        SkillDefinition skill = skill("draft", "KEYWORD", "{\"keywords\":[\"退款\"]}");
        when(skills.findById("skill-1")).thenReturn(Optional.of(skill));

        SkillPromptAssembler assembler =
                new SkillPromptAssembler(skills, versions, bindings, 24000);
        SkillPromptAssembler.Assembly assembly =
                assembler.assemble(List.of("skill-1"), "base", "普通咨询", false);

        assertTrue(assembly.appliedSkills().isEmpty());
        assertEquals("base", assembly.systemPrompt());
    }

    @Test
    void promptBudgetSkipsOversizedSkillWithWarning() {
        SkillDefinitionRepository skills = mock(SkillDefinitionRepository.class);
        SkillDefinitionVersionRepository versions = mock(SkillDefinitionVersionRepository.class);
        AgentSkillBindingRepository bindings = mock(AgentSkillBindingRepository.class);
        SkillDefinition skill = skill("prompt is too long", "ALWAYS", "{}");
        skill.setMaxPromptChars(4);
        SkillDefinitionVersion published = version("prompt is too long", "[]");
        published.setSnapshot(
                "{\"activationMode\":\"ALWAYS\",\"activationConfig\":\"{}\",\"maxPromptChars\":4,\"priority\":100}");
        when(skills.findById("skill-1")).thenReturn(Optional.of(skill));
        when(versions.findBySkillIdAndVersion(any(), anyLong())).thenReturn(Optional.of(published));

        SkillPromptAssembler assembler =
                new SkillPromptAssembler(skills, versions, bindings, 24000);
        SkillPromptAssembler.Assembly assembly =
                assembler.assemble(List.of("skill-1"), "base", "hello", false);

        assertTrue(assembly.appliedSkills().isEmpty());
        assertEquals(1, assembly.warnings().size());
    }

    @Test
    void previewUsesCurrentDraftActivationSettings() {
        SkillDefinitionRepository skills = mock(SkillDefinitionRepository.class);
        SkillDefinitionVersionRepository versions = mock(SkillDefinitionVersionRepository.class);
        AgentSkillBindingRepository bindings = mock(AgentSkillBindingRepository.class);
        SkillDefinition skill = skill("draft prompt", "KEYWORD", "{\"keywords\":[\"refund\"]}");

        SkillPromptAssembler assembler =
                new SkillPromptAssembler(skills, versions, bindings, 24000);
        SkillPromptAssembler.Assembly assembly =
                assembler.assembleForSkill(skill, "base", "How do I request a refund?");

        assertEquals(1, assembly.appliedSkills().size());
        assertTrue(assembly.systemPrompt().contains("draft prompt"));
    }

    @Test
    void legacySnapshotWithStringToolIdsStillRunsPublishedPrompt() {
        SkillDefinitionRepository skills = mock(SkillDefinitionRepository.class);
        SkillDefinitionVersionRepository versions = mock(SkillDefinitionVersionRepository.class);
        AgentSkillBindingRepository bindings = mock(AgentSkillBindingRepository.class);
        SkillDefinition skill = skill("draft", "ALWAYS", "{}");
        SkillDefinitionVersion published = version("legacy prompt", "[\"tool-1\"]");
        published.setSnapshot(
                "{\"id\":\"skill-1\",\"prompt\":\"legacy prompt\",\"toolIds\":\"[\\\"tool-1\\\"]\",\"version\":\"1.0.0\",\"enabled\":false}");
        when(skills.findById("skill-1")).thenReturn(Optional.of(skill));
        when(versions.findBySkillIdAndVersion("skill-1", 1L)).thenReturn(Optional.of(published));

        SkillPromptAssembler assembler =
                new SkillPromptAssembler(skills, versions, bindings, 24000);
        SkillPromptAssembler.Assembly assembly =
                assembler.assemble(List.of("skill-1"), "base", "hello", false);

        assertEquals(1, assembly.appliedSkills().size());
        assertTrue(assembly.systemPrompt().contains("legacy prompt"));
        assertEquals(List.of("tool-1"), assembly.toolIds());
    }

    private SkillDefinition skill(String prompt, String activationMode, String config) {
        SkillDefinition skill = new SkillDefinition();
        skill.setId("skill-1");
        skill.setName("测试 Skill");
        skill.setPrompt(prompt);
        skill.setEnabled(true);
        skill.setPublishedVersion(1);
        skill.setVersion("1.0.0");
        skill.setActivationMode(activationMode);
        skill.setActivationConfig(config);
        skill.setMaxPromptChars(8000);
        return skill;
    }

    private SkillDefinitionVersion version(String prompt, String toolIds) {
        SkillDefinitionVersion version = new SkillDefinitionVersion();
        version.setSkillId("skill-1");
        version.setVersion(1);
        version.setVersionLabel("1.0.0");
        version.setStatus("PUBLISHED");
        version.setPrompt(prompt);
        version.setToolIds(toolIds);
        version.setSnapshot(
                "{\"activationMode\":\"ALWAYS\",\"activationConfig\":\"{}\",\"maxPromptChars\":8000,\"priority\":100}");
        return version;
    }
}
