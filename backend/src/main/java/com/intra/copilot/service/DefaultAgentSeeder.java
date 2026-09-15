package com.intra.copilot.service;

import com.intra.copilot.agent.GeneralAgent;
import com.intra.copilot.agent.RouteCopilotAgent;
import com.intra.copilot.model.AgentConfigVersion;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.repo.AgentConfigVersionRepository;
import com.intra.copilot.repo.AgentDefinitionRepository;
import java.util.List;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class DefaultAgentSeeder {
    private final AgentDefinitionRepository definitions;
    private final GeneralAgent general;
    private final RouteCopilotAgent routeCopilot;
    private final AgentConfigVersionRepository versions;
    private final AgentReleaseSnapshotCodec snapshotCodec;

    public DefaultAgentSeeder(
            AgentDefinitionRepository definitions,
            GeneralAgent general,
            RouteCopilotAgent routeCopilot,
            AgentConfigVersionRepository versions,
            AgentReleaseSnapshotCodec snapshotCodec) {
        this.definitions = definitions;
        this.general = general;
        this.routeCopilot = routeCopilot;
        this.versions = versions;
        this.snapshotCodec = snapshotCodec;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void seed() {
        removeLegacyAgents();
        seed(
                general.id(),
                general.displayName(),
                general.description(),
                general.systemPrompt(),
                general.supportsBrowserActions(),
                100);
        seed(
                routeCopilot.id(),
                routeCopilot.displayName(),
                routeCopilot.description(),
                routeCopilot.systemPrompt(),
                routeCopilot.supportsBrowserActions(),
                10);
    }

    private void removeLegacyAgents() {
        definitions.deleteById("diagnosis");
        definitions.deleteById("tms-manual");
    }

    private void seed(
            String id,
            String name,
            String description,
            String prompt,
            boolean browserActions,
            int priority) {
        if (definitions.existsById(id)) {
            AgentDefinition existing = definitions.findById(id).orElseThrow();
            if (versions.findByAgentId(id).isEmpty()) {
                long initialVersion = Math.max(1, existing.getPublishedVersion());
                existing.setPublished(true);
                existing.setPublishedVersion(initialVersion);
                definitions.save(existing);
                createInitialVersion(existing);
            }
            return;
        }
        AgentDefinition definition =
                new AgentDefinition(id, name, description, prompt, browserActions, priority);
        definition.setSystemAgent(true);
        definition.setRole("route-copilot".equals(id) ? "MAIN" : "GENERAL");
        definition.setPublished(true);
        definition.setPublishedVersion(1);
        definitions.save(definition);
        createInitialVersion(definition);
    }

    private void createInitialVersion(AgentDefinition definition) {
        AgentConfigVersion version = new AgentConfigVersion();
        version.setAgentId(definition.getId());
        version.setVersion(Math.max(1, definition.getPublishedVersion()));
        version.setStatus("PUBLISHED");
        version.setReleaseNote("系统初始化版本");
        version.setPublishedBy("system");
        version.setSnapshot(snapshotCodec.encode(definition, List.of()));
        versions.save(version);
    }
}
