package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.intra.copilot.agent.GeneralAgent;
import com.intra.copilot.agent.RouteCopilotAgent;
import com.intra.copilot.model.AgentConfigVersion;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.repo.AgentConfigVersionRepository;
import com.intra.copilot.repo.AgentDefinitionRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class DefaultAgentSeederTest {

    @Test
    void restoresMissingInitialSnapshotWithoutLosingPublishedVersion() {
        AgentDefinitionRepository definitions = mock(AgentDefinitionRepository.class);
        AgentConfigVersionRepository versions = mock(AgentConfigVersionRepository.class);
        AgentReleaseSnapshotCodec codec = mock(AgentReleaseSnapshotCodec.class);
        AgentDefinition existing = new AgentDefinition();
        existing.setId("assistant");
        existing.setDisplayName("Assistant");
        existing.setSystemPrompt("prompt");
        existing.setPublished(false);
        existing.setPublishedVersion(4);

        when(definitions.existsById("assistant")).thenReturn(true);
        when(definitions.findById("assistant")).thenReturn(Optional.of(existing));
        when(versions.findByAgentId("assistant")).thenReturn(List.of());
        when(codec.encode(any(AgentDefinition.class), any())).thenReturn("{}");

        DefaultAgentSeeder seeder =
                new DefaultAgentSeeder(
                        definitions, new GeneralAgent(), new RouteCopilotAgent(), versions, codec);

        seeder.seed();

        assertTrue(existing.isPublished());
        assertEquals(4, existing.getPublishedVersion());
        ArgumentCaptor<AgentConfigVersion> versionCaptor =
                ArgumentCaptor.forClass(AgentConfigVersion.class);
        verify(versions, org.mockito.Mockito.atLeastOnce()).save(versionCaptor.capture());
        assertTrue(
                versionCaptor.getAllValues().stream()
                        .anyMatch(
                                version ->
                                        "assistant".equals(version.getAgentId())
                                                && version.getVersion() == 4));
    }
}
