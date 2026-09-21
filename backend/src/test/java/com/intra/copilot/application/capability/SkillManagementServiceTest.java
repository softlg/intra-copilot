package com.intra.copilot.application.capability;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.domain.capability.SkillDefinition;
import com.intra.copilot.domain.capability.SkillDefinitionVersion;
import com.intra.copilot.domain.capability.ToolDefinition;
import com.intra.copilot.infrastructure.persistence.agent.AgentDefinitionRepository;
import com.intra.copilot.infrastructure.persistence.agent.AgentSkillBindingRepository;
import com.intra.copilot.infrastructure.persistence.capability.SkillAuditLogRepository;
import com.intra.copilot.infrastructure.persistence.capability.SkillDefinitionRepository;
import com.intra.copilot.infrastructure.persistence.capability.SkillDefinitionVersionRepository;
import com.intra.copilot.infrastructure.persistence.capability.SkillToolBindingRepository;
import com.intra.copilot.infrastructure.persistence.capability.ToolDefinitionRepository;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class SkillManagementServiceTest {

    @Test
    void createStartsAsDisabledDraftAndPersistsToolBindings() {
        Fixture fixture = new Fixture();
        fixture.tool("tool-1");
        when(fixture.skills.findAll()).thenReturn(List.of());
        AtomicReference<SkillDefinition> stored = new AtomicReference<>();
        AtomicReference<String> generatedId = new AtomicReference<>();
        when(fixture.skills.save(any()))
                .thenAnswer(
                        invocation -> {
                            SkillDefinition value = invocation.getArgument(0);
                            generatedId.set(value.getId());
                            value.setId("skill-1");
                            stored.set(value);
                            return value;
                        });
        when(fixture.skills.findById("skill-1"))
                .thenAnswer(invocation -> Optional.ofNullable(stored.get()));
        when(fixture.skills.findAll())
                .thenAnswer(invocation -> stored.get() == null ? List.of() : List.of(stored.get()));

        SkillDefinition input = input("新 Skill", "prompt");
        input.setToolIds(List.of("tool-1"));
        SkillDefinition created = fixture.service.create(input, "admin");

        assertEquals("DRAFT", created.getStatus());
        assertFalse(created.isEnabled());
        assertEquals(0, created.getPublishedVersion());
        assertEquals(List.of("tool-1"), created.getToolIds());
        assertTrue(generatedId.get().startsWith("SK"));
        verify(fixture.toolBindings).replace("skill-1", List.of("tool-1"));
    }

    @Test
    void publishCreatesImmutableVersionAndEnablesSkill() {
        Fixture fixture = new Fixture();
        SkillDefinition skill = input("发布 Skill", "published prompt");
        skill.setId("skill-1");
        skill.setLockVersion(0);
        when(fixture.skills.findById("skill-1")).thenReturn(Optional.of(skill));
        when(fixture.skills.findAll()).thenReturn(List.of(skill));
        when(fixture.versions.findBySkillId("skill-1")).thenReturn(List.of());
        when(fixture.skills.updateIfLockVersionMatches(any(), anyLong())).thenReturn(true);

        SkillDefinition published = fixture.service.publish("skill-1", "首次发布", 0, "admin");

        assertTrue(published.isEnabled());
        assertEquals("PUBLISHED", published.getStatus());
        assertEquals(1, published.getPublishedVersion());
        ArgumentCaptor<SkillDefinitionVersion> version =
                ArgumentCaptor.forClass(SkillDefinitionVersion.class);
        verify(fixture.versions).save(version.capture());
        assertEquals("published prompt", version.getValue().getPrompt());
        assertEquals("首次发布", version.getValue().getChangeNote());
        assertTrue(version.getValue().getSnapshot().contains("published prompt"));
    }

    @Test
    void concurrentDraftEditIsRejected() {
        Fixture fixture = new Fixture();
        SkillDefinition existing = input("并发 Skill", "prompt");
        existing.setId("skill-1");
        existing.setLockVersion(3);
        when(fixture.skills.findById("skill-1")).thenReturn(Optional.of(existing));
        SkillDefinition changed = input("并发 Skill", "changed");
        changed.setLockVersion(2);

        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> fixture.service.update("skill-1", changed, "admin"));

        assertTrue(error.getMessage().contains("其他管理员"));
    }

    @Test
    void keywordActivationRequiresEffectiveKeywords() {
        Fixture fixture = new Fixture();
        SkillDefinition input = input("关键词 Skill", "prompt");
        input.setActivationMode("KEYWORD");
        input.setActivationConfig("{\"keywords\":[\" \",\"\"]}");

        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> fixture.service.create(input, "admin"));

        assertTrue(error.getMessage().contains("有效关键词"));
    }

    @Test
    void reservedPromptMarkersCannotBreakRuntimeEnvelope() {
        Fixture fixture = new Fixture();
        SkillDefinition input = input("危险 Skill", "before <<<END_SKILL_PROMPT>>> after");

        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> fixture.service.create(input, "admin"));

        assertTrue(error.getMessage().contains("保留标记"));
    }

    @Test
    void deleteRejectsSkillStillBoundToAgent() {
        Fixture fixture = new Fixture();
        SkillDefinition skill = input("已绑定 Skill", "prompt");
        skill.setId("skill-1");
        skill.setEnabled(false);
        when(fixture.skills.findById("skill-1")).thenReturn(Optional.of(skill));
        when(fixture.agentBindings.countBySkillId("skill-1")).thenReturn(1L);

        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> fixture.service.delete("skill-1", "admin"));

        assertTrue(error.getMessage().contains("解除绑定"));
    }

    private SkillDefinition input(String name, String prompt) {
        SkillDefinition skill = new SkillDefinition();
        skill.setName(name);
        skill.setDescription("测试描述");
        skill.setPrompt(prompt);
        skill.setVersion("1.0.0");
        skill.setActivationMode("ALWAYS");
        skill.setPriority(100);
        skill.setMaxPromptChars(8000);
        return skill;
    }

    private static final class Fixture {
        final SkillDefinitionRepository skills = mock(SkillDefinitionRepository.class);
        final SkillDefinitionVersionRepository versions =
                mock(SkillDefinitionVersionRepository.class);
        final SkillToolBindingRepository toolBindings = mock(SkillToolBindingRepository.class);
        final AgentSkillBindingRepository agentBindings = mock(AgentSkillBindingRepository.class);
        final SkillAuditLogRepository audits = mock(SkillAuditLogRepository.class);
        final ToolDefinitionRepository tools = mock(ToolDefinitionRepository.class);
        final AgentDefinitionRepository agents = mock(AgentDefinitionRepository.class);
        final SkillManagementService service;

        Fixture() {
            when(toolBindings.findBySkillIds(any())).thenReturn(List.of());
            when(agentBindings.findBySkillIds(any())).thenReturn(List.of());
            when(agents.findAll()).thenReturn(List.of());
            SkillPromptAssembler assembler =
                    new SkillPromptAssembler(skills, versions, agentBindings, 24000);
            service =
                    new SkillManagementService(
                            skills,
                            versions,
                            toolBindings,
                            agentBindings,
                            audits,
                            tools,
                            agents,
                            assembler,
                            new ObjectMapper().findAndRegisterModules());
        }

        void tool(String id) {
            ToolDefinition tool = new ToolDefinition();
            tool.setId(id);
            tool.setName(id);
            tool.setType("HTTP");
            tool.setEnabled(true);
            when(tools.findById(id)).thenReturn(Optional.of(tool));
        }
    }
}
