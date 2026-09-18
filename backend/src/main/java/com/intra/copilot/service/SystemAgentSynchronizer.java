package com.intra.copilot.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.AgentConfigVersion;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.model.SkillDefinition;
import com.intra.copilot.model.ToolDefinition;
import com.intra.copilot.repo.AgentConfigVersionRepository;
import com.intra.copilot.repo.AgentDefinitionRepository;
import com.intra.copilot.repo.AgentSkillBindingRepository;
import com.intra.copilot.repo.SkillDefinitionRepository;
import com.intra.copilot.repo.SkillToolBindingRepository;
import com.intra.copilot.repo.ToolDefinitionRepository;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Materializes code-owned system Agents into the persisted registry and upgrades them safely. */
@Component
public class SystemAgentSynchronizer {
    private final SystemAgentCatalog catalog;
    private final AgentDefinitionRepository definitions;
    private final AgentConfigVersionRepository versions;
    private final AgentRegistry registry;
    private final AgentReleaseSnapshotCodec snapshotCodec;
    private final ToolDefinitionRepository tools;
    private final SkillDefinitionRepository skills;
    private final SkillToolBindingRepository skillToolBindings;
    private final AgentSkillBindingRepository agentSkillBindings;
    private final ObjectMapper json;

    public SystemAgentSynchronizer(
            SystemAgentCatalog catalog,
            AgentDefinitionRepository definitions,
            AgentConfigVersionRepository versions,
            AgentRegistry registry,
            AgentReleaseSnapshotCodec snapshotCodec,
            ToolDefinitionRepository tools,
            SkillDefinitionRepository skills,
            SkillToolBindingRepository skillToolBindings,
            AgentSkillBindingRepository agentSkillBindings,
            ObjectMapper json) {
        this.catalog = catalog;
        this.definitions = definitions;
        this.versions = versions;
        this.registry = registry;
        this.snapshotCodec = snapshotCodec;
        this.tools = tools;
        this.skills = skills;
        this.skillToolBindings = skillToolBindings;
        this.agentSkillBindings = agentSkillBindings;
        this.json = json;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void synchronize() {
        disableLegacyBrowserConfiguration();
        for (SystemAgentCatalog.Spec spec : catalog.all()) {
            synchronize(spec);
        }
        registry.evict();
    }

    private void synchronize(SystemAgentCatalog.Spec spec) {
        AgentDefinition existing = definitions.findById(spec.id()).orElse(null);
        if (existing != null && existing.getSystemRevision() > spec.revision()) {
            return;
        }

        boolean changed =
                existing == null
                        || existing.getSystemRevision() != spec.revision()
                        || !Objects.equals(existing.getDisplayName(), spec.displayName())
                        || !Objects.equals(existing.getDescription(), spec.description())
                        || !Objects.equals(existing.getSystemPrompt(), spec.systemPrompt())
                        || !Objects.equals(existing.getRole(), spec.role())
                        || existing.isSupportsBrowserActions() != spec.supportsBrowserActions()
                        || existing.getPriority() != spec.priority()
                        || !Objects.equals(existing.getPlanningMode(), spec.planningMode())
                        || existing.getMaxPlanSteps() != spec.maxPlanSteps()
                        || !existing.isEnabled()
                        || !existing.isPublished()
                        || existing.getPublishedVersion() <= 0
                        || !Objects.equals(existing.getToolIds(), toolIdsJson(spec));
        if (existing != null && !changed) {
            enforceOwnership(existing, spec.revision());
            definitions.save(existing);
            return;
        }

        AgentDefinition definition = existing == null ? new AgentDefinition() : existing;
        definition.setId(spec.id());
        definition.setDisplayName(spec.displayName());
        definition.setDescription(spec.description());
        definition.setSystemPrompt(spec.systemPrompt());
        definition.setRole(spec.role());
        definition.setHandlingMode("AUTO");
        definition.setReturnMode("CHILD_DIRECT");
        definition.setSupportsBrowserActions(spec.supportsBrowserActions());
        definition.setPriority(spec.priority());
        definition.setPlanningMode(spec.planningMode());
        definition.setMaxPlanSteps(spec.maxPlanSteps());
        definition.setKnowledgeBaseIds("[]");
        definition.setToolIds(toolIdsJson(spec));
        definition.setSkillIds("[]");
        definition.setEnabled(true);
        definition.setPublished(true);
        enforceOwnership(definition, spec.revision());

        long nextVersion =
                versions.findByAgentId(spec.id()).stream()
                                .mapToLong(AgentConfigVersion::getVersion)
                                .max()
                                .orElse(0L)
                        + 1L;
        for (AgentConfigVersion version : versions.findByAgentId(spec.id())) {
            version.setStatus("ARCHIVED");
            versions.save(version);
        }
        definition.setPublishedVersion(nextVersion);
        definition.setVersion(existing == null ? 1L : existing.getVersion() + 1L);
        if (definition.getCreatedBy() == null || definition.getCreatedBy().isBlank()) {
            definition.setCreatedBy("system");
        }
        definition.setUpdatedBy("system");
        definitions.save(definition);

        AgentConfigVersion release = new AgentConfigVersion();
        release.setAgentId(spec.id());
        release.setVersion(nextVersion);
        release.setStatus("PUBLISHED");
        release.setReleaseNote("系统内置 Agent 自动升级 revision=" + spec.revision());
        release.setPublishedBy("system");
        release.setSnapshot(snapshotCodec.encode(definition, List.of()));
        versions.save(release);
    }

    private void enforceOwnership(AgentDefinition definition, long revision) {
        definition.setSystemAgent(true);
        definition.setOwnerType(SystemAgentGuard.SYSTEM_OWNER);
        definition.setManagementMode(SystemAgentGuard.SYSTEM_LOCKED);
        definition.setSystemRevision(revision);
    }

    private String toolIdsJson(SystemAgentCatalog.Spec spec) {
        try {
            return json.writeValueAsString(spec.builtInToolIds());
        } catch (Exception error) {
            throw new IllegalStateException("无法序列化系统 Agent Tool 列表", error);
        }
    }

    private void disableLegacyBrowserConfiguration() {
        List<ToolDefinition> browserTools =
                tools.findAll().stream()
                        .filter(
                                tool ->
                                        "BROWSER_PROPOSAL".equalsIgnoreCase(tool.getType())
                                                || "BROWSER_ACTION".equalsIgnoreCase(tool.getType()))
                        .toList();
        Set<String> browserToolIds = new LinkedHashSet<>();
        for (ToolDefinition tool : browserTools) {
            browserToolIds.add(tool.getId());
            if (tool.isEnabled()) {
                tool.setEnabled(false);
                tool.touch();
                tools.save(tool);
            }
        }

        Set<String> browserSkillIds = new LinkedHashSet<>();
        for (String toolId : browserToolIds) {
            for (var binding : skillToolBindings.findByToolId(toolId)) {
                browserSkillIds.add(binding.getSkillId());
            }
            skillToolBindings.deleteByToolId(toolId);
        }
        for (SkillDefinition skill : skills.findAll()) {
            boolean referencesBrowserTool =
                    browserToolIds.stream()
                            .anyMatch(toolId -> skill.getLegacyToolIds().contains(toolId));
            if (!browserSkillIds.contains(skill.getId()) && !referencesBrowserTool) continue;
            if (skill.isEnabled()) {
                skill.setEnabled(false);
                skill.touch();
                skills.save(skill);
            }
            agentSkillBindings.detachSkill(skill.getId());
        }

        for (AgentDefinition agent : new ArrayList<>(definitions.findAll())) {
            if (SystemAgentGuard.SYSTEM_OWNER.equalsIgnoreCase(agent.getOwnerType())
                    || agent.isSystemAgent()) {
                continue;
            }
            List<String> toolIds = parseIds(agent.getToolIds());
            List<String> skillIds = parseIds(agent.getSkillIds());
            List<String> keptTools =
                    toolIds.stream().filter(id -> !browserToolIds.contains(id)).toList();
            List<String> keptSkills =
                    skillIds.stream().filter(id -> !browserSkillIds.contains(id)).toList();
            boolean releaseNeedsMigration =
                    publishedBrowserBindingNeedsMigration(agent, keptTools, keptSkills);
            boolean changed =
                    keptTools.size() != toolIds.size()
                            || keptSkills.size() != skillIds.size()
                            || agent.isSupportsBrowserActions()
                            || releaseNeedsMigration;
            if (!changed) continue;
            agent.setToolIds(writeJson(keptTools));
            agent.setSkillIds(writeJson(keptSkills));
            agent.setSupportsBrowserActions(false);
            definitions.save(agent);
            agentSkillBindings.replace(agent.getId(), keptSkills);
            if (releaseNeedsMigration
                    || (agent.isPublished() && agent.getPublishedVersion() > 0)) {
                publishSanitizedRelease(
                        agent, browserToolIds, browserSkillIds);
            }
        }
    }

    private boolean publishedBrowserBindingNeedsMigration(
            AgentDefinition agent, List<String> expectedTools, List<String> expectedSkills) {
        if (agent.getPublishedVersion() <= 0) return false;
        AgentConfigVersion release =
                versions.findByAgentIdAndVersion(agent.getId(), agent.getPublishedVersion())
                        .orElse(null);
        if (release == null) return false;
        AgentDefinition published = snapshotCodec.decode(release.getSnapshot()).definition();
        if (published == null) return false;
        return published.isSupportsBrowserActions()
                || !new LinkedHashSet<>(parseIds(published.getToolIds()))
                        .equals(new LinkedHashSet<>(expectedTools))
                || !new LinkedHashSet<>(parseIds(published.getSkillIds()))
                        .equals(new LinkedHashSet<>(expectedSkills));
    }

    private void publishSanitizedRelease(
            AgentDefinition agent,
            Set<String> browserToolIds,
            Set<String> browserSkillIds) {
        AgentConfigVersion currentRelease =
                versions.findByAgentIdAndVersion(agent.getId(), agent.getPublishedVersion())
                        .orElse(null);
        AgentReleaseSnapshotCodec.Decoded decoded =
                currentRelease == null
                        ? new AgentReleaseSnapshotCodec.Decoded(null, List.of(), false, 0)
                        : snapshotCodec.decode(currentRelease.getSnapshot());
        AgentDefinition base =
                agent.isPublished() || decoded.definition() == null
                        ? json.convertValue(agent, AgentDefinition.class)
                        : json.convertValue(decoded.definition(), AgentDefinition.class);
        base.setToolIds(
                writeJson(
                        parseIds(base.getToolIds()).stream()
                                .filter(id -> !browserToolIds.contains(id))
                                .distinct()
                                .toList()));
        base.setSkillIds(
                writeJson(
                        parseIds(base.getSkillIds()).stream()
                                .filter(id -> !browserSkillIds.contains(id))
                                .distinct()
                                .toList()));
        base.setSupportsBrowserActions(false);

        List<AgentConfigVersion> existingVersions = versions.findByAgentId(agent.getId());
        long next =
                existingVersions.stream()
                                .mapToLong(AgentConfigVersion::getVersion)
                                .max()
                                .orElse(0L)
                        + 1L;
        for (AgentConfigVersion version : existingVersions) {
            version.setStatus("ARCHIVED");
            versions.save(version);
        }

        AgentConfigVersion release = new AgentConfigVersion();
        release.setAgentId(agent.getId());
        release.setVersion(next);
        release.setStatus("PUBLISHED");
        release.setReleaseNote("系统迁移：浏览器操作统一由内置 Browser Operator 提供");
        release.setPublishedBy("system");
        release.setSnapshot(
                snapshotCodec.encode(
                        base,
                        decoded.structured() ? decoded.childBindings() : List.of()));
        versions.save(release);

        agent.setPublishedVersion(next);
        agent.setUpdatedBy("system");
        agent.touch();
        definitions.save(agent);
    }

    private List<String> parseIds(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        try {
            List<String> values =
                    json.readValue(raw, new TypeReference<List<String>>() {});
            return values == null ? List.of() : values;
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private String writeJson(List<String> values) {
        try {
            return json.writeValueAsString(values);
        } catch (Exception error) {
            throw new IllegalStateException("无法更新 Agent 绑定", error);
        }
    }
}
