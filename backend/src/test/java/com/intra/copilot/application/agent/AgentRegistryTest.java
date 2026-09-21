package com.intra.copilot.application.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.domain.agent.AgentChildBinding;
import com.intra.copilot.domain.agent.AgentConfigVersion;
import com.intra.copilot.domain.agent.AgentDefinition;
import com.intra.copilot.infrastructure.persistence.agent.AgentChildBindingRepository;
import com.intra.copilot.infrastructure.persistence.agent.AgentConfigVersionRepository;
import com.intra.copilot.infrastructure.persistence.agent.AgentDefinitionRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class AgentRegistryTest {

    @Test
    void derivesParentAgentIdFromChildBinding() {
        AgentDefinitionRepository definitions = mock(AgentDefinitionRepository.class);
        AgentChildBindingRepository bindings = mock(AgentChildBindingRepository.class);
        AgentDefinition child = new AgentDefinition();
        child.setId("expense");
        child.setRole("SUB");
        AgentChildBinding binding = new AgentChildBinding();
        binding.setParentAgentId("finance");
        binding.setChildAgentId("expense");

        when(definitions.findAll()).thenReturn(List.of(child));
        when(bindings.findAll()).thenReturn(List.of(binding));

        AgentRegistry registry =
                new AgentRegistry(
                        definitions,
                        bindings,
                        mock(AgentConfigVersionRepository.class),
                        new AgentReleaseSnapshotCodec(new ObjectMapper().findAndRegisterModules()));

        AgentDefinition copied = registry.allDefinitions().get(0);
        assertEquals("SUB", copied.getRole());
        assertEquals("finance", copied.getParentAgentId());
    }

    @Test
    void allDefinitionsPreservesAgentRoleWhenCopyingCachedValues() {
        AgentDefinitionRepository definitions = mock(AgentDefinitionRepository.class);
        AgentChildBindingRepository bindings = mock(AgentChildBindingRepository.class);
        AgentDefinition general = agent("assistant", "general prompt");
        general.setRole("GENERAL");

        when(definitions.findAll()).thenReturn(List.of(general));
        when(bindings.findAll()).thenReturn(List.of());

        AgentRegistry registry =
                new AgentRegistry(
                        definitions,
                        bindings,
                        mock(AgentConfigVersionRepository.class),
                        new AgentReleaseSnapshotCodec(new ObjectMapper().findAndRegisterModules()));

        assertEquals("GENERAL", registry.allDefinitions().get(0).getRole());
    }

    @Test
    void draftChangesDoNotReplaceThePublishedRuntimeSnapshot() {
        AgentDefinitionRepository definitions = mock(AgentDefinitionRepository.class);
        AgentChildBindingRepository bindings = mock(AgentChildBindingRepository.class);
        AgentConfigVersionRepository versions = mock(AgentConfigVersionRepository.class);
        AgentReleaseSnapshotCodec codec =
                new AgentReleaseSnapshotCodec(new ObjectMapper().findAndRegisterModules());

        AgentDefinition draft = agent("finance", "v3 draft");
        draft.setPublishedVersion(2);
        draft.setPublished(false);
        draft.setVersion(3);
        AgentConfigVersion release = new AgentConfigVersion();
        release.setAgentId("finance");
        release.setVersion(2);
        release.setStatus("PUBLISHED");
        release.setSnapshot(codec.encode(agent("finance", "v2 published"), List.of()));

        when(definitions.findById("finance")).thenReturn(Optional.of(draft));
        when(versions.findByAgentIdAndVersion("finance", 2)).thenReturn(Optional.of(release));

        AgentRegistry registry = new AgentRegistry(definitions, bindings, versions, codec);

        AgentDefinition effective = registry.findPublished("finance").orElseThrow();
        assertEquals("v2 published", effective.getSystemPrompt());
        assertEquals(2, effective.getPublishedVersion());
        assertTrue(effective.isPublished());
    }

    @Test
    void neverPublishedAgentIsNotAvailableAtRuntime() {
        AgentDefinitionRepository definitions = mock(AgentDefinitionRepository.class);
        AgentChildBindingRepository bindings = mock(AgentChildBindingRepository.class);
        AgentConfigVersionRepository versions = mock(AgentConfigVersionRepository.class);
        AgentDefinition draft = agent("draft-agent", "draft");
        draft.setPublished(false);
        draft.setPublishedVersion(0);

        when(definitions.findAll()).thenReturn(List.of(draft));
        when(bindings.findAll()).thenReturn(List.of());

        AgentRegistry registry =
                new AgentRegistry(
                        definitions,
                        bindings,
                        versions,
                        new AgentReleaseSnapshotCodec(new ObjectMapper().findAndRegisterModules()));

        assertTrue(registry.enabledDefinitions().isEmpty());
        assertTrue(registry.findEnabled("draft-agent").isEmpty());
    }

    @Test
    void publishedChildBindingsComeFromTheReleaseSnapshot() {
        AgentDefinitionRepository definitions = mock(AgentDefinitionRepository.class);
        AgentChildBindingRepository bindings = mock(AgentChildBindingRepository.class);
        AgentConfigVersionRepository versions = mock(AgentConfigVersionRepository.class);
        AgentReleaseSnapshotCodec codec =
                new AgentReleaseSnapshotCodec(new ObjectMapper().findAndRegisterModules());

        AgentDefinition domain = agent("finance", "domain");
        domain.setRole("DOMAIN");
        domain.setPublishedVersion(4);
        AgentChildBinding snapshotBinding = binding("finance", "expense-v1");
        AgentConfigVersion release = new AgentConfigVersion();
        release.setAgentId("finance");
        release.setVersion(4);
        release.setStatus("PUBLISHED");
        release.setSnapshot(codec.encode(domain, List.of(snapshotBinding)));

        when(definitions.findById("finance")).thenReturn(Optional.of(domain));
        when(versions.findByAgentIdAndVersion("finance", 4)).thenReturn(Optional.of(release));

        AgentRegistry registry = new AgentRegistry(definitions, bindings, versions, codec);

        assertEquals(
                "expense-v1",
                registry.findPublishedChildBindings("finance").get(0).getChildAgentId());
    }

    private AgentDefinition agent(String id, String prompt) {
        AgentDefinition definition = new AgentDefinition();
        definition.setId(id);
        definition.setDisplayName(id);
        definition.setSystemPrompt(prompt);
        definition.setRole("GENERAL");
        definition.setEnabled(true);
        definition.setPublished(true);
        definition.setPublishedVersion(1);
        return definition;
    }

    private AgentChildBinding binding(String parentId, String childId) {
        AgentChildBinding binding = new AgentChildBinding();
        binding.setParentAgentId(parentId);
        binding.setChildAgentId(childId);
        binding.setEnabled(true);
        return binding;
    }
}
