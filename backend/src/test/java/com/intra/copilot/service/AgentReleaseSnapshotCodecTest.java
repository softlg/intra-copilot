package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.AgentChildBinding;
import com.intra.copilot.model.AgentDefinition;
import java.util.List;
import org.junit.jupiter.api.Test;

class AgentReleaseSnapshotCodecTest {

    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final AgentReleaseSnapshotCodec codec = new AgentReleaseSnapshotCodec(json);

    @Test
    void roundTripsStructuredSnapshotWithChildBindings() {
        AgentDefinition definition = definition("finance");
        AgentChildBinding binding = new AgentChildBinding();
        binding.setParentAgentId("finance");
        binding.setChildAgentId("expense");

        AgentReleaseSnapshotCodec.Decoded decoded =
                codec.decode(codec.encode(definition, List.of(binding)));

        assertTrue(decoded.structured());
        assertEquals(1, decoded.schemaVersion());
        assertEquals("finance", decoded.definition().getId());
        assertEquals("expense", decoded.childBindings().get(0).getChildAgentId());
    }

    @Test
    void readsLegacyBareAgentDefinitionSnapshot() throws Exception {
        AgentDefinition definition = definition("legacy");

        AgentReleaseSnapshotCodec.Decoded decoded =
                codec.decode(json.writeValueAsString(definition));

        assertFalse(decoded.structured());
        assertEquals("legacy", decoded.definition().getId());
        assertTrue(decoded.childBindings().isEmpty());
    }

    private AgentDefinition definition(String id) {
        AgentDefinition definition = new AgentDefinition();
        definition.setId(id);
        definition.setDisplayName(id);
        definition.setSystemPrompt("prompt");
        definition.setRole("DOMAIN");
        return definition;
    }
}
