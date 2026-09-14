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
                        new ObjectMapper());

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
                        new ObjectMapper());

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
                        new ObjectMapper());

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
