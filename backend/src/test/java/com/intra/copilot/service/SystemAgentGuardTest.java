package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.repo.AgentChildBindingRepository;
import com.intra.copilot.repo.AgentConfigVersionRepository;
import com.intra.copilot.repo.AgentDefinitionRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class SystemAgentGuardTest {

    @Test
    void rejectsSystemLockedAgentMutations() {
        AgentDefinition definition = new AgentDefinition();
        definition.setSystemAgent(true);
        definition.setOwnerType(SystemAgentGuard.SYSTEM_OWNER);
        definition.setManagementMode(SystemAgentGuard.SYSTEM_LOCKED);

        assertThrows(
                ResponseStatusException.class,
                () -> SystemAgentGuard.requireUserManaged(definition));
    }

    @Test
    void allowsUserManagedAgentMutations() {
        AgentDefinition definition = new AgentDefinition();
        definition.setOwnerType("USER");
        definition.setManagementMode("USER_MANAGED");

        assertDoesNotThrow(() -> SystemAgentGuard.requireUserManaged(definition));
    }

    @Test
    void deleteReturnsConflictForEnabledSystemAgent() {
        AgentDefinitionRepository definitions = mock(AgentDefinitionRepository.class);
        AgentDefinition definition = new AgentDefinition();
        definition.setId("browser-operator");
        definition.setEnabled(true);
        definition.setSystemAgent(true);
        definition.setOwnerType(SystemAgentGuard.SYSTEM_OWNER);
        definition.setManagementMode(SystemAgentGuard.SYSTEM_LOCKED);
        when(definitions.findById("browser-operator")).thenReturn(Optional.of(definition));
        AgentRegistry registry =
                new AgentRegistry(
                        definitions,
                        mock(AgentChildBindingRepository.class),
                        mock(AgentConfigVersionRepository.class),
                        new AgentReleaseSnapshotCodec(new ObjectMapper()));

        ResponseStatusException error =
                assertThrows(
                        ResponseStatusException.class,
                        () -> registry.delete("browser-operator"));

        org.junit.jupiter.api.Assertions.assertEquals(
                HttpStatus.CONFLICT, error.getStatusCode());
    }
}
