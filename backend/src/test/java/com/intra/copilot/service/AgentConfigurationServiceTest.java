package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.AgentChildBinding;
import com.intra.copilot.model.AgentConfigVersion;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.repo.AgentChildBindingRepository;
import com.intra.copilot.repo.AgentConfigVersionRepository;
import com.intra.copilot.repo.AgentDefinitionRepository;
import com.intra.copilot.repo.AgentSkillBindingRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class AgentConfigurationServiceTest {

    @Test
    void savingSubAgentWithDomainCreatesBindingAutomatically() {
        AgentDefinitionRepository definitions = mock(AgentDefinitionRepository.class);
        AgentConfigVersionRepository versions = mock(AgentConfigVersionRepository.class);
        AgentChildBindingRepository bindings = mock(AgentChildBindingRepository.class);
        AgentRegistry registry = mock(AgentRegistry.class);
        AgentConfigurationService service =
                new AgentConfigurationService(
                        definitions,
                        versions,
                        bindings,
                        mock(AgentSkillBindingRepository.class),
                        registry,
                        new ObjectMapper(),
                        new AgentReleaseSnapshotCodec(new ObjectMapper().findAndRegisterModules()));

        AgentDefinition domain = domain("finance");
        AgentDefinition child = subAgent("expense", "finance");

        when(definitions.findById("finance")).thenReturn(Optional.of(domain));
        when(definitions.findById("expense")).thenReturn(Optional.empty());
        when(definitions.save(child)).thenReturn(child);
        when(bindings.findOneByChild("expense")).thenReturn(Optional.empty());
        when(bindings.findByParent("finance")).thenReturn(List.of());

        service.saveDraft(child);

        ArgumentCaptor<AgentChildBinding> bindingCaptor =
                ArgumentCaptor.forClass(AgentChildBinding.class);
        verify(bindings).insert(bindingCaptor.capture());
        AgentChildBinding binding = bindingCaptor.getValue();
        assertEquals("finance", binding.getParentAgentId());
        assertEquals("expense", binding.getChildAgentId());
        assertEquals(100, binding.getPriority());
    }

    @Test
    void movingSubAgentReplacesItsSingleOwner() {
        AgentDefinitionRepository definitions = mock(AgentDefinitionRepository.class);
        AgentConfigVersionRepository versions = mock(AgentConfigVersionRepository.class);
        AgentChildBindingRepository bindings = mock(AgentChildBindingRepository.class);
        AgentRegistry registry = mock(AgentRegistry.class);
        AgentConfigurationService service =
                new AgentConfigurationService(
                        definitions,
                        versions,
                        bindings,
                        mock(AgentSkillBindingRepository.class),
                        registry,
                        new ObjectMapper(),
                        new AgentReleaseSnapshotCodec(new ObjectMapper().findAndRegisterModules()));

        AgentDefinition newDomain = domain("operations");
        AgentDefinition child = subAgent("expense", "operations");
        AgentChildBinding previous = binding("finance", "expense", 30);

        when(definitions.findById("operations")).thenReturn(Optional.of(newDomain));
        when(definitions.findById("expense")).thenReturn(Optional.empty());
        when(definitions.save(child)).thenReturn(child);
        when(bindings.findOneByChild("expense")).thenReturn(Optional.of(previous));
        when(bindings.findByParent("operations")).thenReturn(List.of());

        service.saveDraft(child);

        verify(bindings).deleteByChild("expense");
        ArgumentCaptor<AgentChildBinding> bindingCaptor =
                ArgumentCaptor.forClass(AgentChildBinding.class);
        verify(bindings).insert(bindingCaptor.capture());
        assertEquals("operations", bindingCaptor.getValue().getParentAgentId());
    }

    @Test
    void domainCannotStealChildOwnedByAnotherDomain() {
        AgentDefinitionRepository definitions = mock(AgentDefinitionRepository.class);
        AgentConfigVersionRepository versions = mock(AgentConfigVersionRepository.class);
        AgentChildBindingRepository bindings = mock(AgentChildBindingRepository.class);
        AgentRegistry registry = mock(AgentRegistry.class);
        AgentConfigurationService service =
                new AgentConfigurationService(
                        definitions,
                        versions,
                        bindings,
                        mock(AgentSkillBindingRepository.class),
                        registry,
                        new ObjectMapper(),
                        new AgentReleaseSnapshotCodec(new ObjectMapper().findAndRegisterModules()));

        AgentDefinition targetDomain = domain("operations");
        AgentDefinition child = subAgent("expense", "finance");
        AgentChildBinding owner = binding("finance", "expense", 10);
        AgentChildBinding request = binding(null, "expense", 20);

        when(definitions.findById("operations")).thenReturn(Optional.of(targetDomain));
        when(definitions.findById("expense")).thenReturn(Optional.of(child));
        when(bindings.findOneByChild("expense")).thenReturn(Optional.of(owner));

        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> service.replaceChildren("operations", List.of(request)));

        assertEquals("一个子 Agent 只能绑定一个领域 Agent", error.getMessage());
        verify(bindings, never()).deleteByParent(any());
        verify(bindings, never()).insert(any(AgentChildBinding.class));
    }

    @Test
    void normalizesPlanningConfiguration() {
        AgentDefinitionRepository definitions = mock(AgentDefinitionRepository.class);
        AgentConfigVersionRepository versions = mock(AgentConfigVersionRepository.class);
        AgentChildBindingRepository bindings = mock(AgentChildBindingRepository.class);
        AgentRegistry registry = mock(AgentRegistry.class);
        AgentConfigurationService service =
                new AgentConfigurationService(
                        definitions,
                        versions,
                        bindings,
                        mock(AgentSkillBindingRepository.class),
                        registry,
                        new ObjectMapper(),
                        new AgentReleaseSnapshotCodec(new ObjectMapper().findAndRegisterModules()));

        AgentDefinition definition = domain("planning");
        definition.setPlanningMode("invalid");
        definition.setMaxPlanSteps(99);

        when(definitions.findById("planning")).thenReturn(Optional.empty());
        when(definitions.save(definition)).thenReturn(definition);

        AgentDefinition saved = service.saveDraft(definition);

        assertEquals("AUTO", saved.getPlanningMode());
        assertEquals(12, saved.getMaxPlanSteps());
    }

    @Test
    void publishCapturesDefinitionAndChildBindingsAsStructuredSnapshot() {
        AgentDefinitionRepository definitions = mock(AgentDefinitionRepository.class);
        AgentConfigVersionRepository versions = mock(AgentConfigVersionRepository.class);
        AgentChildBindingRepository bindings = mock(AgentChildBindingRepository.class);
        AgentSkillBindingRepository skillBindings = mock(AgentSkillBindingRepository.class);
        AgentRegistry registry = mock(AgentRegistry.class);
        AgentReleaseSnapshotCodec codec =
                new AgentReleaseSnapshotCodec(new ObjectMapper().findAndRegisterModules());
        AgentConfigurationService service =
                new AgentConfigurationService(
                        definitions,
                        versions,
                        bindings,
                        skillBindings,
                        registry,
                        new ObjectMapper(),
                        codec);

        AgentDefinition domain = domain("finance");
        domain.setPublishedVersion(2);
        AgentChildBinding child = binding("finance", "expense", 10);
        AgentConfigVersion previous = new AgentConfigVersion();
        previous.setAgentId("finance");
        previous.setVersion(2);
        previous.setStatus("PUBLISHED");
        previous.setSnapshot(codec.encode(domain, List.of(child)));

        when(definitions.findById("finance")).thenReturn(Optional.of(domain));
        when(bindings.findByParent("finance")).thenReturn(List.of(child));
        when(versions.findByAgentId("finance")).thenReturn(List.of(previous));
        when(versions.save(any(AgentConfigVersion.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        AgentConfigVersion published = service.publish("finance", "发布领域 Agent", "alice");

        assertEquals(3, published.getVersion());
        assertEquals("alice", published.getPublishedBy());
        AgentReleaseSnapshotCodec.Decoded decoded = codec.decode(published.getSnapshot());
        assertEquals("finance", decoded.definition().getId());
        assertEquals("expense", decoded.childBindings().get(0).getChildAgentId());
        assertEquals(3, domain.getPublishedVersion());
        verify(skillBindings).replace("finance", List.of());
        verify(registry).evict();
    }

    @Test
    void rollbackRestoresSnapshotBindingsAndCreatesNewRelease() {
        AgentDefinitionRepository definitions = mock(AgentDefinitionRepository.class);
        AgentConfigVersionRepository versions = mock(AgentConfigVersionRepository.class);
        AgentChildBindingRepository bindings = mock(AgentChildBindingRepository.class);
        AgentSkillBindingRepository skillBindings = mock(AgentSkillBindingRepository.class);
        AgentRegistry registry = mock(AgentRegistry.class);
        AgentReleaseSnapshotCodec codec =
                new AgentReleaseSnapshotCodec(new ObjectMapper().findAndRegisterModules());
        AgentConfigurationService service =
                new AgentConfigurationService(
                        definitions,
                        versions,
                        bindings,
                        skillBindings,
                        registry,
                        new ObjectMapper(),
                        codec);

        AgentDefinition oldDefinition = domain("finance");
        oldDefinition.setSystemPrompt("v1 production prompt");
        AgentChildBinding oldChild = binding("finance", "expense-v1", 10);
        AgentConfigVersion target = new AgentConfigVersion();
        target.setAgentId("finance");
        target.setVersion(1);
        target.setStatus("ARCHIVED");
        target.setSnapshot(codec.encode(oldDefinition, List.of(oldChild)));

        AgentDefinition current = domain("finance");
        current.setSystemPrompt("v3 draft prompt");
        current.setEnabled(false);
        current.setVersion(3);
        current.setPublishedVersion(2);
        when(versions.findByAgentId("finance")).thenReturn(List.of(target));
        when(definitions.findById("finance")).thenReturn(Optional.of(current));
        when(versions.save(any(AgentConfigVersion.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        AgentDefinition restored = service.rollback("finance", 1, "bob");

        assertEquals("v1 production prompt", restored.getSystemPrompt());
        assertEquals(2, restored.getPublishedVersion());
        assertEquals(false, restored.isEnabled());
        verify(bindings).deleteByParent("finance");
        verify(bindings).deleteByChild("expense-v1");
        ArgumentCaptor<AgentChildBinding> bindingCaptor =
                ArgumentCaptor.forClass(AgentChildBinding.class);
        verify(bindings).insert(bindingCaptor.capture());
        assertEquals("expense-v1", bindingCaptor.getValue().getChildAgentId());
        verify(registry).evict();
    }

    private AgentDefinition domain(String id) {
        AgentDefinition definition = new AgentDefinition();
        definition.setId(id);
        definition.setDisplayName(id);
        definition.setSystemPrompt("domain prompt");
        definition.setRole("DOMAIN");
        definition.setEnabled(true);
        definition.setPublished(true);
        return definition;
    }

    private AgentDefinition subAgent(String id, String parentId) {
        AgentDefinition definition = new AgentDefinition();
        definition.setId(id);
        definition.setDisplayName(id);
        definition.setSystemPrompt("sub prompt");
        definition.setRole("SUB");
        definition.setParentAgentId(parentId);
        definition.setEnabled(true);
        definition.setPublished(true);
        return definition;
    }

    private AgentChildBinding binding(String parentId, String childId, int priority) {
        AgentChildBinding binding = new AgentChildBinding();
        binding.setParentAgentId(parentId);
        binding.setChildAgentId(childId);
        binding.setPriority(priority);
        binding.setEnabled(true);
        return binding;
    }
}
