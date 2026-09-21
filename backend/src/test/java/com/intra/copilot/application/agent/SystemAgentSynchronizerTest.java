package com.intra.copilot.application.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.domain.agent.AgentConfigVersion;
import com.intra.copilot.domain.agent.AgentDefinition;
import com.intra.copilot.domain.capability.SkillDefinition;
import com.intra.copilot.domain.capability.SkillToolBinding;
import com.intra.copilot.domain.capability.ToolDefinition;
import com.intra.copilot.infrastructure.persistence.agent.AgentConfigVersionRepository;
import com.intra.copilot.infrastructure.persistence.agent.AgentDefinitionRepository;
import com.intra.copilot.infrastructure.persistence.agent.AgentSkillBindingRepository;
import com.intra.copilot.infrastructure.persistence.capability.SkillDefinitionRepository;
import com.intra.copilot.infrastructure.persistence.capability.SkillToolBindingRepository;
import com.intra.copilot.infrastructure.persistence.capability.ToolDefinitionRepository;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class SystemAgentSynchronizerTest {

    @Test
    void createsAndAutoPublishesAllSystemAgents() {
        Fixture fixture = fixture();
        when(fixture.definitions.findById(any())).thenReturn(Optional.empty());
        when(fixture.definitions.findAll()).thenReturn(List.of());
        when(fixture.versions.findByAgentId(any())).thenReturn(List.of());

        fixture.synchronizer.synchronize();

        ArgumentCaptor<AgentDefinition> definitions =
                ArgumentCaptor.forClass(AgentDefinition.class);
        verify(fixture.definitions, times(3)).save(definitions.capture());
        assertEquals(3, definitions.getAllValues().size());
        assertTrue(
                definitions
                        .getAllValues()
                        .stream()
                        .allMatch(
                                definition ->
                                        definition.isSystemAgent()
                                                && SystemAgentGuard.SYSTEM_LOCKED.equals(
                                                        definition.getManagementMode())
                                                && definition.isEnabled()
                                                && definition.isPublished()));
        assertTrue(
                definitions
                        .getAllValues()
                        .stream()
                        .anyMatch(
                                definition ->
                                        SystemAgentCatalog.BROWSER_OPERATOR.equals(
                                                        definition.getId())
                                                && definition
                                                        .getToolIds()
                                                        .contains("browser_act")));
    }

    @Test
    void repeatedSynchronizationDoesNotCreateDuplicateRelease() throws Exception {
        Fixture fixture = fixture();
        Map<String, AgentDefinition> existing = definitionsAtCurrentRevision(fixture.json);
        when(fixture.definitions.findById(any()))
                .thenAnswer(
                        invocation -> Optional.ofNullable(existing.get(invocation.getArgument(0))));
        when(fixture.definitions.findAll()).thenReturn(List.of());
        when(fixture.versions.findByAgentId(any()))
                .thenAnswer(invocation -> List.of(release(invocation.getArgument(0), 1)));

        fixture.synchronizer.synchronize();

        verify(fixture.versions, never()).save(any());
        verify(fixture.definitions, times(3)).save(any());
    }

    @Test
    void higherRevisionArchivesOldReleaseAndPublishesNewRelease() throws Exception {
        Fixture fixture = fixture();
        Map<String, AgentDefinition> existing = definitionsAtCurrentRevision(fixture.json);
        existing.values()
                .forEach(
                        definition ->
                                definition.setSystemRevision(definition.getSystemRevision() - 1));
        when(fixture.definitions.findById(any()))
                .thenAnswer(
                        invocation -> Optional.ofNullable(existing.get(invocation.getArgument(0))));
        when(fixture.definitions.findAll()).thenReturn(List.of());
        Map<String, AgentConfigVersion> oldReleases = new HashMap<>();
        when(fixture.versions.findByAgentId(any()))
                .thenAnswer(
                        invocation ->
                                List.of(
                                        oldReleases.computeIfAbsent(
                                                invocation.getArgument(0), id -> release(id, 1))));

        fixture.synchronizer.synchronize();

        assertTrue(
                oldReleases
                        .values()
                        .stream()
                        .allMatch(item -> "ARCHIVED".equals(item.getStatus())));
        ArgumentCaptor<AgentConfigVersion> releases =
                ArgumentCaptor.forClass(AgentConfigVersion.class);
        verify(fixture.versions, times(6)).save(releases.capture());
        List<AgentConfigVersion> published =
                releases.getAllValues()
                        .stream()
                        .filter(item -> "PUBLISHED".equals(item.getStatus()))
                        .toList();
        assertEquals(3, published.size());
        assertTrue(published.stream().allMatch(item -> item.getVersion() == 2));
    }

    @Test
    void disablesLegacyBrowserToolSkillAndAgentBindings() {
        Fixture fixture = fixture();
        ToolDefinition legacyTool = new ToolDefinition();
        legacyTool.setId("legacy-browser-tool");
        legacyTool.setType("BROWSER_PROPOSAL");
        legacyTool.setEnabled(true);
        SkillToolBinding skillTool = new SkillToolBinding();
        skillTool.setSkillId("legacy-browser-skill");
        skillTool.setToolId("legacy-browser-tool");
        SkillDefinition legacySkill = new SkillDefinition();
        legacySkill.setId("legacy-browser-skill");
        legacySkill.setEnabled(true);
        legacySkill.setLegacyToolIds("[\"legacy-browser-tool\"]");
        AgentDefinition userAgent = new AgentDefinition();
        userAgent.setId("custom-agent");
        userAgent.setDisplayName("Custom");
        userAgent.setSystemPrompt("custom");
        userAgent.setOwnerType(SystemAgentGuard.USER_OWNER);
        userAgent.setManagementMode(SystemAgentGuard.USER_MANAGED);
        userAgent.setToolIds("[\"legacy-browser-tool\"]");
        userAgent.setSkillIds("[\"legacy-browser-skill\"]");
        userAgent.setSupportsBrowserActions(true);
        userAgent.setPublished(true);
        userAgent.setPublishedVersion(3);
        AgentConfigVersion oldRelease = release("custom-agent", 3);
        oldRelease.setSnapshot("old");
        AgentDefinition oldDefinition = new AgentDefinition();
        oldDefinition.setId("custom-agent");
        oldDefinition.setSupportsBrowserActions(true);
        oldDefinition.setToolIds("[\"legacy-browser-tool\"]");
        oldDefinition.setSkillIds("[\"legacy-browser-skill\"]");

        when(fixture.tools.findAll()).thenReturn(List.of(legacyTool));
        when(fixture.skillToolBindings.findByToolId("legacy-browser-tool"))
                .thenReturn(List.of(skillTool));
        when(fixture.skills.findAll()).thenReturn(List.of(legacySkill));
        when(fixture.definitions.findAll()).thenReturn(List.of(userAgent));
        when(fixture.versions.findByAgentIdAndVersion("custom-agent", 3))
                .thenReturn(Optional.of(oldRelease));
        when(fixture.versions.findByAgentId("custom-agent")).thenReturn(List.of(oldRelease));
        when(fixture.codec.decode("old"))
                .thenReturn(
                        new AgentReleaseSnapshotCodec.Decoded(oldDefinition, List.of(), true, 1));
        when(fixture.definitions.findById(any())).thenReturn(Optional.empty());

        fixture.synchronizer.synchronize();

        assertFalse(legacyTool.isEnabled());
        assertFalse(legacySkill.isEnabled());
        assertEquals("[]", userAgent.getToolIds());
        assertEquals("[]", userAgent.getSkillIds());
        assertFalse(userAgent.isSupportsBrowserActions());
        verify(fixture.tools).save(legacyTool);
        verify(fixture.skills).save(legacySkill);
        verify(fixture.skillToolBindings).deleteByToolId("legacy-browser-tool");
        verify(fixture.agentSkillBindings).detachSkill("legacy-browser-skill");
        verify(fixture.agentSkillBindings).replace("custom-agent", List.of());
        assertEquals(4, userAgent.getPublishedVersion());
        ArgumentCaptor<AgentConfigVersion> releases =
                ArgumentCaptor.forClass(AgentConfigVersion.class);
        verify(fixture.versions, times(5)).save(releases.capture());
        assertEquals(
                4,
                releases.getAllValues()
                        .stream()
                        .filter(
                                item ->
                                        "custom-agent".equals(item.getAgentId())
                                                && "PUBLISHED".equals(item.getStatus()))
                        .findFirst()
                        .orElseThrow()
                        .getVersion());
    }

    @Test
    void rotatesReleaseWhenPublishedSnapshotStillHasLegacyBrowserBinding() {
        Fixture fixture = fixture();
        AgentDefinition userAgent = new AgentDefinition();
        userAgent.setId("custom-agent");
        userAgent.setDisplayName("Custom");
        userAgent.setSystemPrompt("custom");
        userAgent.setOwnerType(SystemAgentGuard.USER_OWNER);
        userAgent.setManagementMode(SystemAgentGuard.USER_MANAGED);
        userAgent.setToolIds("[]");
        userAgent.setSkillIds("[]");
        userAgent.setSupportsBrowserActions(false);
        userAgent.setEnabled(true);
        userAgent.setPublished(false);
        userAgent.setPublishedVersion(3);
        AgentDefinition stale = new AgentDefinition();
        stale.setId("custom-agent");
        stale.setSupportsBrowserActions(true);
        stale.setToolIds("[\"legacy-browser-tool\"]");
        stale.setSkillIds("[\"legacy-browser-skill\"]");
        AgentConfigVersion release = release("custom-agent", 3);
        release.setSnapshot("stale");

        when(fixture.definitions.findAll()).thenReturn(List.of(userAgent));
        when(fixture.versions.findByAgentIdAndVersion("custom-agent", 3))
                .thenReturn(Optional.of(release));
        when(fixture.versions.findByAgentId("custom-agent")).thenReturn(List.of(release));
        when(fixture.codec.decode("stale"))
                .thenReturn(new AgentReleaseSnapshotCodec.Decoded(stale, List.of(), true, 1));
        when(fixture.definitions.findById(any())).thenReturn(Optional.empty());

        fixture.synchronizer.synchronize();

        assertEquals(4, userAgent.getPublishedVersion());
        assertFalse(userAgent.isPublished());
        verify(fixture.versions, times(5)).save(any(AgentConfigVersion.class));
    }

    private Fixture fixture() {
        return new Fixture();
    }

    private Map<String, AgentDefinition> definitionsAtCurrentRevision(ObjectMapper json)
            throws Exception {
        Map<String, AgentDefinition> result = new LinkedHashMap<>();
        for (SystemAgentCatalog.Spec spec : new SystemAgentCatalog().all()) {
            AgentDefinition definition = new AgentDefinition();
            definition.setId(spec.id());
            definition.setDisplayName(spec.displayName());
            definition.setDescription(spec.description());
            definition.setSystemPrompt(spec.systemPrompt());
            definition.setRole(spec.role());
            definition.setSupportsBrowserActions(spec.supportsBrowserActions());
            definition.setPriority(spec.priority());
            definition.setPlanningMode(spec.planningMode());
            definition.setMaxPlanSteps(spec.maxPlanSteps());
            definition.setToolIds(json.writeValueAsString(spec.builtInToolIds()));
            definition.setEnabled(true);
            definition.setPublished(true);
            definition.setPublishedVersion(1);
            definition.setSystemAgent(true);
            definition.setOwnerType(SystemAgentGuard.SYSTEM_OWNER);
            definition.setManagementMode(SystemAgentGuard.SYSTEM_LOCKED);
            definition.setSystemRevision(SystemAgentCatalog.REVISION);
            result.put(spec.id(), definition);
        }
        return result;
    }

    private AgentConfigVersion release(String agentId, long version) {
        AgentConfigVersion release = new AgentConfigVersion();
        release.setAgentId(agentId);
        release.setVersion(version);
        release.setStatus("PUBLISHED");
        release.setSnapshot("{}");
        return release;
    }

    private static final class Fixture {
        final AgentDefinitionRepository definitions = mock(AgentDefinitionRepository.class);
        final AgentConfigVersionRepository versions = mock(AgentConfigVersionRepository.class);
        final AgentRegistry registry = mock(AgentRegistry.class);
        final AgentReleaseSnapshotCodec codec = mock(AgentReleaseSnapshotCodec.class);
        final ToolDefinitionRepository tools = mock(ToolDefinitionRepository.class);
        final SkillDefinitionRepository skills = mock(SkillDefinitionRepository.class);
        final SkillToolBindingRepository skillToolBindings = mock(SkillToolBindingRepository.class);
        final AgentSkillBindingRepository agentSkillBindings =
                mock(AgentSkillBindingRepository.class);
        final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
        final SystemAgentSynchronizer synchronizer;

        Fixture() {
            synchronizer =
                    new SystemAgentSynchronizer(
                            new SystemAgentCatalog(),
                            definitions,
                            versions,
                            registry,
                            codec,
                            tools,
                            skills,
                            skillToolBindings,
                            agentSkillBindings,
                            json);
            when(codec.encode(any(), any())).thenReturn("{}");
            when(tools.findAll()).thenReturn(List.of());
            when(skills.findAll()).thenReturn(List.of());
        }
    }
}
