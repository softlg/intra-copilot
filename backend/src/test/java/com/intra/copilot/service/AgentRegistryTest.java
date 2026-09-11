package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.intra.copilot.model.AgentChildBinding;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.repo.AgentChildBindingRepository;
import com.intra.copilot.repo.AgentDefinitionRepository;
import java.util.List;
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

        AgentRegistry registry = new AgentRegistry(definitions, bindings);

        assertEquals("finance", registry.allDefinitions().get(0).getParentAgentId());
    }
}
