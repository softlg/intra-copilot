package com.intra.copilot.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.model.AgentSkillBinding;
import com.intra.copilot.model.SkillAuditLog;
import com.intra.copilot.model.SkillDefinition;
import com.intra.copilot.model.SkillDefinitionVersion;
import com.intra.copilot.model.SkillToolBinding;
import com.intra.copilot.model.ToolDefinition;
import com.intra.copilot.repo.AgentDefinitionRepository;
import com.intra.copilot.repo.AgentSkillBindingRepository;
import com.intra.copilot.repo.SkillAuditLogRepository;
import com.intra.copilot.repo.SkillDefinitionRepository;
import com.intra.copilot.repo.SkillDefinitionVersionRepository;
import com.intra.copilot.repo.SkillToolBindingRepository;
import com.intra.copilot.repo.ToolDefinitionRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Owns the Skill lifecycle. Draft edits never change what production executes; only immutable
 * published snapshots are resolved by {@link SkillPromptAssembler}.
 */
@Service
public class SkillManagementService {
    private static final String DRAFT = "DRAFT";
    private static final String PUBLISHED = "PUBLISHED";
    private static final Set<String> ACTIVATION_MODES = Set.of("ALWAYS", "KEYWORD");
    private static final Set<String> FORBIDDEN_PROMPT_MARKERS =
            Set.of("<<<SKILL_PROMPT>>>", "<<<END_SKILL_PROMPT>>>");

    private final SkillDefinitionRepository skills;
    private final SkillDefinitionVersionRepository versions;
    private final SkillToolBindingRepository toolBindings;
    private final AgentSkillBindingRepository agentBindings;
    private final SkillAuditLogRepository audits;
    private final ToolDefinitionRepository tools;
    private final AgentDefinitionRepository agents;
    private final SkillPromptAssembler assembler;
    private final ObjectMapper json;

    public SkillManagementService(
            SkillDefinitionRepository skills,
            SkillDefinitionVersionRepository versions,
            SkillToolBindingRepository toolBindings,
            AgentSkillBindingRepository agentBindings,
            SkillAuditLogRepository audits,
            ToolDefinitionRepository tools,
            AgentDefinitionRepository agents,
            SkillPromptAssembler assembler,
            ObjectMapper json) {
        this.skills = skills;
        this.versions = versions;
        this.toolBindings = toolBindings;
        this.agentBindings = agentBindings;
        this.audits = audits;
        this.tools = tools;
        this.agents = agents;
        this.assembler = assembler;
        this.json = json;
    }

    public List<SkillDefinition> list() {
        List<SkillDefinition> values =
                skills.findAll()
                        .stream()
                        .sorted(
                                Comparator.comparingInt(SkillDefinition::getPriority)
                                        .thenComparing(
                                                SkillDefinition::getName,
                                                Comparator.nullsLast(String::compareToIgnoreCase)))
                        .toList();
        return enrich(values);
    }

    public SkillDefinition get(String id) {
        SkillDefinition skill =
                skills.findById(id)
                        .orElseThrow(() -> new NoSuchElementException("Skill 不存在：" + id));
        return enrich(List.of(skill)).get(0);
    }

    @Transactional
    public SkillDefinition create(SkillDefinition input, String actor) {
        SkillDefinition skill = normalize(input);
        skill.setStatus(DRAFT);
        skill.setEnabled(false);
        skill.setPublishedVersion(0);
        skill.setInvocationCount(0);
        skill.setLastUsedAt(null);
        skill.setLockVersion(0);
        skill.setCreatedAt(Instant.now());
        skill.setUpdatedAt(Instant.now());
        skill.setUpdatedBy(actor);
        validate(skill);
        ensureNameAvailable(skill.getName(), null);
        skills.save(skill);
        toolBindings.replace(skill.getId(), skill.getToolIds());
        appendAudit(skill.getId(), "CREATE_DRAFT", actor, null, skill);
        return get(skill.getId());
    }

    @Transactional
    public SkillDefinition update(String id, SkillDefinition input, String actor) {
        SkillDefinition existing =
                skills.findById(id)
                        .orElseThrow(() -> new NoSuchElementException("Skill 不存在：" + id));
        long expectedVersion = input == null ? 0 : input.getLockVersion();
        if (expectedVersion > 0 && expectedVersion != existing.getLockVersion()) {
            throw new IllegalArgumentException("Skill 已被其他管理员修改，请刷新后重试");
        }

        SkillDefinition updated = normalize(input);
        updated.setId(id);
        updated.setCreatedAt(existing.getCreatedAt());
        updated.setPublishedVersion(existing.getPublishedVersion());
        updated.setInvocationCount(existing.getInvocationCount());
        updated.setLastUsedAt(existing.getLastUsedAt());
        updated.setEnabled(existing.isEnabled());
        updated.setStatus(DRAFT);
        updated.setLockVersion(existing.getLockVersion());
        updated.setUpdatedAt(Instant.now());
        updated.setUpdatedBy(actor);
        validate(updated);
        ensureNameAvailable(updated.getName(), id);

        updated.touch();
        if (!skills.updateIfLockVersionMatches(updated, existing.getLockVersion())) {
            throw new IllegalArgumentException("Skill 已被其他管理员修改，请刷新后重试");
        }
        toolBindings.replace(id, updated.getToolIds());
        appendAudit(id, "UPDATE_DRAFT", actor, existing, updated);
        return get(id);
    }

    @Transactional
    public SkillDefinition publish(
            String id, String releaseNote, long expectedVersion, String actor) {
        SkillDefinition skill = requireCurrent(id, expectedVersion);
        return publishInternal(skill, releaseNote, actor);
    }

    @Transactional
    public SkillDefinition rollback(
            String id, long targetVersion, long expectedVersion, String actor) {
        SkillDefinition current = requireCurrent(id, expectedVersion);
        SkillDefinitionVersion target =
                versions.findBySkillIdAndVersion(id, targetVersion)
                        .orElseThrow(() -> new IllegalArgumentException("Skill 版本不存在"));
        try {
            SkillDefinition snapshot = json.readValue(target.getSnapshot(), SkillDefinition.class);
            copyEditableFields(snapshot, current);
            current.setLockVersion(expectedVersion);
            current.setUpdatedAt(Instant.now());
            current.setUpdatedBy(actor);
            return publishInternal(
                    current,
                    "回滚到版本 " + target.getVersionLabel() + "（v" + targetVersion + "）",
                    actor);
        } catch (IllegalArgumentException error) {
            throw error;
        } catch (Exception error) {
            throw new IllegalArgumentException("Skill 版本快照无法恢复");
        }
    }

    @Transactional
    public SkillDefinition setEnabled(
            String id, boolean enabled, long expectedVersion, String actor) {
        SkillDefinition skill = requireCurrent(id, expectedVersion);
        if (enabled && skill.getPublishedVersion() <= 0) {
            throw new IllegalArgumentException("Skill 尚未发布，不能启用");
        }
        boolean before = skill.isEnabled();
        if (before == enabled) return get(id);
        skill.setEnabled(enabled);
        skill.setUpdatedAt(Instant.now());
        skill.setUpdatedBy(actor);
        skill.touch();
        if (!skills.updateIfLockVersionMatches(skill, expectedVersion)) {
            throw new IllegalArgumentException("Skill 已被其他管理员修改，请刷新后重试");
        }
        appendAudit(id, enabled ? "ENABLE" : "DISABLE", actor, null, skill);
        return get(id);
    }

    @Transactional
    public void delete(String id, String actor) {
        SkillDefinition skill =
                skills.findById(id)
                        .orElseThrow(() -> new NoSuchElementException("Skill 不存在：" + id));
        if (skill.isEnabled()) {
            throw new IllegalArgumentException("Skill 处于启用状态，请先停用后再删除");
        }
        if (agentBindings.countBySkillId(id) > 0) {
            throw new IllegalArgumentException("Skill 仍被 Agent 引用，请先解除绑定");
        }
        appendAudit(id, "DELETE", actor, skill, null);
        toolBindings.delete(Wrappers.<SkillToolBinding>query().eq("skill_id", id));
        skills.deleteById(id);
    }

    public List<SkillDefinitionVersion> versions(String id) {
        get(id);
        return versions.findBySkillId(id);
    }

    public List<SkillAuditLog> audit(String id) {
        get(id);
        return audits.findBySkillId(id);
    }

    public SkillTestResult test(String id, String message, String baseSystemPrompt) {
        SkillDefinition skill = get(id);
        SkillPromptAssembler.Assembly assembly =
                assembler.assembleForSkill(
                        skill,
                        baseSystemPrompt == null || baseSystemPrompt.isBlank()
                                ? "你是页面助手。"
                                : baseSystemPrompt.trim(),
                        message == null ? "" : message.trim());
        return new SkillTestResult(
                assembly.systemPrompt(),
                assembly.toolIds(),
                assembly.appliedSkills(),
                assembly.warnings(),
                skill.getPromptChars(),
                skill.getPromptTokenEstimate());
    }

    private SkillDefinition publishInternal(
            SkillDefinition skill, String releaseNote, String actor) {
        validate(skill);
        long nextVersion =
                versions.findBySkillId(skill.getId())
                                .stream()
                                .mapToLong(SkillDefinitionVersion::getVersion)
                                .max()
                                .orElse(0)
                        + 1;
        skill.setStatus(PUBLISHED);
        skill.setEnabled(true);
        skill.setPublishedVersion(nextVersion);
        skill.setUpdatedAt(Instant.now());
        skill.setUpdatedBy(actor);
        skill.touch();
        if (!skills.updateIfLockVersionMatches(skill, skill.getLockVersion() - 1)) {
            throw new IllegalArgumentException("Skill 已被其他管理员修改，请刷新后重试");
        }

        SkillDefinitionVersion version = new SkillDefinitionVersion();
        version.setSkillId(skill.getId());
        version.setVersion(nextVersion);
        version.setVersionLabel(skill.getVersion());
        version.setStatus(PUBLISHED);
        version.setPrompt(skill.getPrompt());
        version.setToolIds(writeJson(skill.getToolIds()));
        version.setSnapshot(writeSnapshot(skill));
        version.setChangeNote(
                releaseNote == null || releaseNote.isBlank() ? "发布 Skill" : releaseNote.trim());
        version.setCreatedBy(actor);
        version.setCreatedAt(Instant.now());
        versions.save(version);
        appendAudit(skill.getId(), "PUBLISH", actor, null, skill);
        return get(skill.getId());
    }

    private SkillDefinition requireCurrent(String id, long expectedVersion) {
        SkillDefinition skill =
                skills.findById(id)
                        .orElseThrow(() -> new NoSuchElementException("Skill 不存在：" + id));
        if (expectedVersion > 0 && expectedVersion != skill.getLockVersion()) {
            throw new IllegalArgumentException("Skill 已被其他管理员修改，请刷新后重试");
        }
        return skill;
    }

    private SkillDefinition normalize(SkillDefinition input) {
        if (input == null) throw new IllegalArgumentException("Skill 配置不能为空");
        SkillDefinition value = new SkillDefinition();
        value.setName(trim(input.getName()));
        value.setDescription(trim(input.getDescription()));
        value.setPrompt(input.getPrompt() == null ? "" : input.getPrompt().trim());
        value.setVersion(
                input.getVersion() == null || input.getVersion().isBlank()
                        ? "1.0.0"
                        : input.getVersion().trim());
        value.setActivationMode(
                input.getActivationMode() == null
                        ? "ALWAYS"
                        : input.getActivationMode().trim().toUpperCase(Locale.ROOT));
        value.setActivationConfig(normalizeActivationConfig(input));
        value.setPriority(input.getPriority());
        value.setMaxPromptChars(input.getMaxPromptChars());
        value.setToolIds(input.getToolIds());
        value.setEnabled(input.isEnabled());
        value.setLockVersion(input.getLockVersion());
        value.setChangeNote(trim(input.getChangeNote()));
        value.setLegacyToolIds(writeJson(value.getToolIds()));
        return value;
    }

    private String normalizeActivationConfig(SkillDefinition input) {
        String mode =
                input.getActivationMode() == null
                        ? "ALWAYS"
                        : input.getActivationMode().trim().toUpperCase(Locale.ROOT);
        if ("ALWAYS".equals(mode)) return "{}";
        if (!"KEYWORD".equals(mode)) throw new IllegalArgumentException("Skill 激活方式无效");
        try {
            JsonNode config =
                    json.readTree(
                            input.getActivationConfig() == null
                                    ? "{}"
                                    : input.getActivationConfig());
            JsonNode keywords = config.path("keywords");
            if (!keywords.isArray()) {
                throw new IllegalArgumentException("关键词激活至少需要一个有效关键词");
            }
            LinkedHashSet<String> normalized = new LinkedHashSet<>();
            for (JsonNode item : keywords) {
                String keyword = item.asText("").trim();
                if (!keyword.isBlank()) normalized.add(keyword);
                if (normalized.size() >= 50) break;
            }
            if (normalized.isEmpty()) {
                throw new IllegalArgumentException("关键词激活至少需要一个有效关键词");
            }
            return json.writeValueAsString(Map.of("keywords", normalized));
        } catch (IllegalArgumentException error) {
            throw error;
        } catch (Exception error) {
            throw new IllegalArgumentException("关键词配置必须是合法 JSON");
        }
    }

    private void validate(SkillDefinition skill) {
        if (skill.getName() == null
                || skill.getName().length() < 2
                || skill.getName().length() > 80) {
            throw new IllegalArgumentException("Skill 名称长度必须为 2-80 个字符");
        }
        if (skill.getDescription() == null || skill.getDescription().isBlank()) {
            throw new IllegalArgumentException("Skill 描述不能为空");
        }
        if (skill.getDescription().length() > 500) {
            throw new IllegalArgumentException("Skill 描述不能超过 500 个字符");
        }
        if (skill.getPrompt() == null || skill.getPrompt().isBlank()) {
            throw new IllegalArgumentException("Skill 提示词不能为空");
        }
        if (skill.getPrompt().length() > 50000) {
            throw new IllegalArgumentException("Skill 提示词不能超过 50000 个字符");
        }
        for (String marker : FORBIDDEN_PROMPT_MARKERS) {
            if (skill.getPrompt().contains(marker)) {
                throw new IllegalArgumentException("Skill 提示词不能包含系统保留标记：" + marker);
            }
        }
        if (!skill.getVersion().matches("[A-Za-z0-9][A-Za-z0-9._-]{0,31}")) {
            throw new IllegalArgumentException("版本标签只能使用 1-32 位字母、数字、点、下划线或连字符");
        }
        if (!ACTIVATION_MODES.contains(skill.getActivationMode())) {
            throw new IllegalArgumentException("Skill 激活方式无效");
        }
        if (skill.getPriority() < 0 || skill.getPriority() > 10000) {
            throw new IllegalArgumentException("优先级必须在 0-10000 之间");
        }
        if (skill.getMaxPromptChars() < 100 || skill.getMaxPromptChars() > 50000) {
            throw new IllegalArgumentException("单条提示词预算必须在 100-50000 之间");
        }
        if (skill.getPrompt().length() > skill.getMaxPromptChars()) {
            throw new IllegalArgumentException("提示词超过单条预算，请提高预算或精简内容");
        }

        LinkedHashSet<String> unique = new LinkedHashSet<>();
        for (String toolId : skill.getToolIds()) {
            if (toolId == null || toolId.isBlank()) continue;
            if (!unique.add(toolId.trim())) continue;
            ToolDefinition tool =
                    tools.findById(toolId.trim())
                            .orElseThrow(() -> new IllegalArgumentException("绑定 Tool 不存在：" + toolId));
            if ("MCP".equalsIgnoreCase(tool.getType())) {
                throw new IllegalArgumentException("MCP Tool 请在 MCP 服务中绑定，Skill 仅支持普通 Tool");
            }
        }
        skill.setToolIds(new ArrayList<>(unique));
        skill.setLegacyToolIds(writeJson(skill.getToolIds()));
    }

    private void ensureNameAvailable(String name, String excludingId) {
        boolean duplicate =
                skills.findAll()
                        .stream()
                        .anyMatch(
                                item ->
                                        !item.getId().equals(excludingId)
                                                && item.getName() != null
                                                && item.getName().trim().equalsIgnoreCase(name));
        if (duplicate) throw new IllegalArgumentException("Skill 名称已存在");
    }

    private List<SkillDefinition> enrich(List<SkillDefinition> values) {
        if (values.isEmpty()) return List.of();
        List<String> skillIds = values.stream().map(SkillDefinition::getId).toList();
        Map<String, List<String>> toolIdsBySkill = new LinkedHashMap<>();
        for (SkillToolBinding binding : toolBindings.findBySkillIds(skillIds)) {
            toolIdsBySkill
                    .computeIfAbsent(binding.getSkillId(), ignored -> new ArrayList<>())
                    .add(binding.getToolId());
        }

        Map<String, AgentDefinition> agentById =
                agents.findAll()
                        .stream()
                        .collect(
                                Collectors.toMap(
                                        AgentDefinition::getId,
                                        Function.identity(),
                                        (left, right) -> left));
        Map<String, List<String>> agentIdsBySkill = new LinkedHashMap<>();
        for (AgentSkillBinding binding : agentBindings.findBySkillIds(skillIds)) {
            if (!binding.isEnabled()) continue;
            agentIdsBySkill
                    .computeIfAbsent(binding.getSkillId(), ignored -> new ArrayList<>())
                    .add(binding.getAgentId());
        }

        return values.stream()
                .peek(
                        skill -> {
                            List<String> toolIds =
                                    toolIdsBySkill.getOrDefault(
                                            skill.getId(), parseIds(skill.getLegacyToolIds()));
                            skill.setToolIds(toolIds);
                            skill.setLegacyToolIds(writeJson(toolIds));
                            skill.setToolCount(toolIds.size());
                            List<String> agentIds =
                                    agentIdsBySkill.getOrDefault(skill.getId(), List.of());
                            skill.setAgentIds(agentIds);
                            skill.setAgentCount(agentIds.size());
                            skill.setAgentNames(
                                    agentIds.stream()
                                            .map(agentById::get)
                                            .filter(java.util.Objects::nonNull)
                                            .map(
                                                    agent ->
                                                            agent.getDisplayName() == null
                                                                    ? agent.getId()
                                                                    : agent.getDisplayName())
                                            .toList());
                            skill.setPromptChars(
                                    skill.getPrompt() == null ? 0 : skill.getPrompt().length());
                            skill.setPromptTokenEstimate(estimateTokens(skill.getPrompt()));
                        })
                .toList();
    }

    private void copyEditableFields(SkillDefinition source, SkillDefinition target) {
        target.setName(source.getName());
        target.setDescription(source.getDescription());
        target.setPrompt(source.getPrompt());
        target.setVersion(source.getVersion());
        target.setActivationMode(source.getActivationMode());
        target.setActivationConfig(source.getActivationConfig());
        target.setPriority(source.getPriority());
        target.setMaxPromptChars(source.getMaxPromptChars());
        target.setToolIds(source.getToolIds());
        target.setLegacyToolIds(writeJson(source.getToolIds()));
    }

    private String writeSnapshot(SkillDefinition skill) {
        try {
            return json.writeValueAsString(skill);
        } catch (Exception error) {
            throw new IllegalArgumentException("Skill 快照无法生成");
        }
    }

    private String writeJson(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (Exception error) {
            throw new IllegalArgumentException("Skill 配置无法序列化");
        }
    }

    private List<String> parseIds(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        try {
            List<String> values =
                    json.readValue(
                            raw,
                            json.getTypeFactory()
                                    .constructCollectionType(List.class, String.class));
            return values == null
                    ? List.of()
                    : values.stream()
                            .filter(value -> value != null && !value.isBlank())
                            .map(String::trim)
                            .distinct()
                            .toList();
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private void appendAudit(
            String skillId,
            String action,
            String actor,
            SkillDefinition before,
            SkillDefinition after) {
        SkillAuditLog audit = new SkillAuditLog();
        audit.setSkillId(skillId);
        audit.setAction(action);
        audit.setActor(actor == null || actor.isBlank() ? "unknown" : actor);
        audit.setBeforeConfig(before == null ? null : writeSnapshot(before));
        audit.setAfterConfig(after == null ? null : writeSnapshot(after));
        audit.setCreatedAt(Instant.now());
        audits.append(audit);
    }

    private static int estimateTokens(String prompt) {
        if (prompt == null || prompt.isBlank()) return 0;
        int cjk = 0;
        int other = 0;
        for (int index = 0; index < prompt.length(); index++) {
            if (Character.UnicodeScript.of(prompt.charAt(index)) == Character.UnicodeScript.HAN) {
                cjk++;
            } else {
                other++;
            }
        }
        return cjk + Math.max(1, (int) Math.ceil(other / 4.0));
    }

    private static String trim(String value) {
        return value == null ? null : value.trim();
    }

    public record SkillTestResult(
            String systemPrompt,
            List<String> toolIds,
            List<SkillPromptAssembler.AppliedSkill> appliedSkills,
            List<String> warnings,
            int promptChars,
            int promptTokenEstimate) {}
}
