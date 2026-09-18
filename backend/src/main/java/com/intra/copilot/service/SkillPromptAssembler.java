package com.intra.copilot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.AgentSkillBinding;
import com.intra.copilot.model.SkillDefinition;
import com.intra.copilot.model.SkillDefinitionVersion;
import com.intra.copilot.repo.AgentSkillBindingRepository;
import com.intra.copilot.repo.SkillDefinitionRepository;
import com.intra.copilot.repo.SkillDefinitionVersionRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Builds the effective Skill context used by both real chat execution and the admin test endpoint.
 * This keeps preview and production behavior aligned.
 */
@Service
public class SkillPromptAssembler {
    private final SkillDefinitionRepository skills;
    private final SkillDefinitionVersionRepository versions;
    private final AgentSkillBindingRepository agentBindings;
    private final ObjectMapper json = new ObjectMapper();
    private final int globalPromptBudgetChars;

    public SkillPromptAssembler(
            SkillDefinitionRepository skills,
            SkillDefinitionVersionRepository versions,
            AgentSkillBindingRepository agentBindings,
            @Value("${skills.global-prompt-budget-chars:24000}") int globalPromptBudgetChars) {
        this.skills = skills;
        this.versions = versions;
        this.agentBindings = agentBindings;
        this.globalPromptBudgetChars = Math.max(2000, globalPromptBudgetChars);
    }

    public Assembly assembleForAgent(
            String agentId,
            List<String> legacySkillIds,
            String baseSystemPrompt,
            String userInput,
            boolean recordUsage) {
        List<AgentSkillBinding> storedBindings =
                agentId == null || agentId.isBlank()
                        ? List.of()
                        : agentBindings.findByAgentId(agentId);
        List<AgentSkillBinding> bindings =
                storedBindings.stream().filter(AgentSkillBinding::isEnabled).toList();
        LinkedHashSet<String> ordered = new LinkedHashSet<>();
        bindings.forEach(binding -> ordered.add(binding.getSkillId()));
        if (storedBindings.isEmpty() && legacySkillIds != null) {
            ordered.addAll(legacySkillIds);
        }
        return assemble(ordered.stream().toList(), baseSystemPrompt, userInput, recordUsage);
    }

    public Assembly assembleForSkill(
            SkillDefinition draft, String baseSystemPrompt, String userInput) {
        SkillDefinition normalized = draft == null ? null : draft;
        if (normalized == null) {
            return new Assembly(baseSystemPrompt, List.of(), List.of(), List.of("Skill 不存在"));
        }
        return assembleDefinitions(List.of(normalized), baseSystemPrompt, userInput, false, false);
    }

    public Assembly assemble(
            List<String> skillIds, String baseSystemPrompt, String userInput, boolean recordUsage) {
        if (skillIds == null || skillIds.isEmpty()) {
            return new Assembly(baseSystemPrompt, List.of(), List.of(), List.of());
        }
        List<SkillDefinition> definitions = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        for (String skillId : skillIds) {
            SkillDefinition skill = skills.findById(skillId).orElse(null);
            if (skill == null) {
                warnings.add("Skill 不存在：" + skillId);
                continue;
            }
            if (!skill.isEnabled()) continue;
            definitions.add(skill);
        }
        return assembleDefinitions(definitions, baseSystemPrompt, userInput, recordUsage, true);
    }

    private Assembly assembleDefinitions(
            List<SkillDefinition> definitions,
            String baseSystemPrompt,
            String userInput,
            boolean recordUsage,
            boolean requirePublishedVersion) {
        StringBuilder systemPrompt =
                new StringBuilder(baseSystemPrompt == null ? "" : baseSystemPrompt);
        List<AppliedSkill> applied = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        LinkedHashSet<String> toolIds = new LinkedHashSet<>();
        int totalPromptChars = 0;

        List<ResolvedSkill> resolved = new ArrayList<>();
        for (int index = 0; index < definitions.size(); index++) {
            SkillDefinition skill = definitions.get(index);
            EffectivePrompt effective =
                    effectivePrompt(skill, requirePublishedVersion, recordUsage).orElse(null);
            if (effective == null) {
                if (requirePublishedVersion) {
                    warnings.add("Skill 尚未发布，已跳过：" + skill.getName());
                }
                continue;
            }
            resolved.add(new ResolvedSkill(index, skill, effective));
        }
        resolved.sort(
                Comparator.comparingInt(
                                (ResolvedSkill item) -> item.effective().priority())
                        .thenComparingInt(ResolvedSkill::index));

        for (ResolvedSkill item : resolved) {
            SkillDefinition skill = item.skill();
            EffectivePrompt effective = item.effective();
            if (!activationMatches(
                    effective.activationMode(), effective.activationConfig(), userInput)) {
                continue;
            }
            int maxPromptChars = Math.max(1, effective.maxPromptChars());
            if (effective.prompt().length() > maxPromptChars) {
                warnings.add(
                        "Skill 提示词超过单条预算，已跳过："
                                + skill.getName()
                                + "（"
                                + effective.prompt().length()
                                + "/"
                                + maxPromptChars
                                + "）");
                continue;
            }
            if (totalPromptChars + effective.prompt().length() > globalPromptBudgetChars) {
                warnings.add(
                        "Skill 总提示词预算已满，后续 Skill 已跳过："
                                + skill.getName()
                                + "（上限 "
                                + globalPromptBudgetChars
                                + "）");
                break;
            }

            systemPrompt
                    .append("\n\n[Skill")
                    .append(" id=\"")
                    .append(safe(skill.getId()))
                    .append("\"")
                    .append(" name=\"")
                    .append(safe(skill.getName()))
                    .append("\"")
                    .append(" version=\"")
                    .append(safe(effective.versionLabel()))
                    .append("\"]\n")
                    .append("<<<SKILL_PROMPT>>>\n")
                    .append(effective.prompt())
                    .append("\n<<<END_SKILL_PROMPT>>>");

            totalPromptChars += effective.prompt().length();
            toolIds.addAll(effective.toolIds());
            applied.add(
                    new AppliedSkill(
                            skill.getId(),
                            skill.getName(),
                            effective.versionNumber(),
                            effective.versionLabel(),
                            effective.prompt().length(),
                            estimateTokens(effective.prompt())));
            if (recordUsage) {
                skills.incrementUsage(skill.getId(), Instant.now());
            }
        }

        return new Assembly(
                systemPrompt.toString(),
                List.copyOf(toolIds),
                List.copyOf(applied),
                List.copyOf(warnings));
    }

    private Optional<EffectivePrompt> effectivePrompt(
            SkillDefinition skill, boolean requirePublishedVersion, boolean recordUsage) {
        if (!requirePublishedVersion && !recordUsage) {
            return Optional.of(
                    new EffectivePrompt(
                            skill.getPrompt(),
                            Math.max(1, skill.getPublishedVersion()),
                            skill.getVersion(),
                            skill.getToolIds(),
                            skill.getActivationMode(),
                            skill.getActivationConfig(),
                            skill.getMaxPromptChars(),
                            skill.getPriority()));
        }
        if (skill.getPublishedVersion() <= 0) return Optional.empty();
        Optional<SkillDefinitionVersion> version =
                versions.findBySkillIdAndVersion(skill.getId(), skill.getPublishedVersion());
        if (version.isEmpty()) return Optional.empty();
        SkillDefinitionVersion snapshot = version.get();
        if (requirePublishedVersion && !"PUBLISHED".equalsIgnoreCase(snapshot.getStatus())) {
            return Optional.empty();
        }
        final JsonNode published;
        try {
            published = json.readTree(snapshot.getSnapshot());
        } catch (Exception error) {
            return Optional.empty();
        }
        JsonNode activationConfig = published.path("activationConfig");
        List<String> toolIds = parseToolIds(snapshot.getToolIds());
        return Optional.of(
                new EffectivePrompt(
                        snapshot.getPrompt(),
                        snapshot.getVersion(),
                        snapshot.getVersionLabel(),
                        toolIds,
                        textValue(published, "activationMode", "ALWAYS"),
                        activationConfig.isMissingNode() || activationConfig.isNull()
                                ? "{}"
                                : activationConfig.isTextual()
                                        ? activationConfig.asText()
                                        : activationConfig.toString(),
                        intValue(published, "maxPromptChars", 8000),
                        intValue(published, "priority", 100)));
    }

    private boolean activationMatches(String modeValue, String configValue, String userInput) {
        String mode = modeValue == null ? "ALWAYS" : modeValue.trim().toUpperCase(Locale.ROOT);
        if ("ALWAYS".equals(mode)) return true;
        if (!"KEYWORD".equals(mode)) return false;
        String input = userInput == null ? "" : userInput.toLowerCase(Locale.ROOT);
        try {
            JsonNode config = json.readTree(configValue == null ? "{}" : configValue);
            if (!config.path("keywords").isArray()) return false;
            for (JsonNode keyword : config.path("keywords")) {
                String value = keyword.asText("").trim().toLowerCase(Locale.ROOT);
                if (!value.isBlank() && input.contains(value)) return true;
            }
        } catch (Exception ignored) {
            return false;
        }
        return false;
    }

    private List<String> parseToolIds(String raw) {
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
                            .distinct()
                            .toList();
        } catch (Exception ignored) {
            return List.of();
        }
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

    private static String safe(String value) {
        return value == null
                ? ""
                : value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ");
    }

    private static String textValue(JsonNode node, String field, String fallback) {
        JsonNode value = node.path(field);
        return value.isTextual() && !value.asText().isBlank() ? value.asText() : fallback;
    }

    private static int intValue(JsonNode node, String field, int fallback) {
        JsonNode value = node.path(field);
        return value.isIntegralNumber() ? value.asInt() : fallback;
    }

    private record EffectivePrompt(
            String prompt,
            long versionNumber,
            String versionLabel,
            List<String> toolIds,
            String activationMode,
            String activationConfig,
            int maxPromptChars,
            int priority) {}

    private record ResolvedSkill(int index, SkillDefinition skill, EffectivePrompt effective) {}

    public record AppliedSkill(
            String id,
            String name,
            long version,
            String versionLabel,
            int promptChars,
            int promptTokenEstimate) {}

    public record Assembly(
            String systemPrompt,
            List<String> toolIds,
            List<AppliedSkill> appliedSkills,
            List<String> warnings) {}
}
