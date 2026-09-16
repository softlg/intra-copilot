package com.intra.copilot.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.model.AgentValidationCase;
import com.intra.copilot.model.AgentValidationRun;
import com.intra.copilot.model.KnowledgeBase;
import com.intra.copilot.model.SkillDefinition;
import com.intra.copilot.model.ToolDefinition;
import com.intra.copilot.repo.AgentValidationCaseRepository;
import com.intra.copilot.repo.AgentValidationRunRepository;
import com.intra.copilot.repo.KnowledgeBaseRepository;
import com.intra.copilot.repo.SkillDefinitionRepository;
import com.intra.copilot.repo.ToolDefinitionRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Static and optional behavior validation for a configured Agent. */
@Service
public class AgentValidationService {
    private static final Duration MODEL_TIMEOUT = Duration.ofSeconds(45);
    private static final int MAX_CASES = 12;

    private final AgentConfigurationService agentConfigurations;
    private final AgentValidationRunRepository runs;
    private final AgentValidationCaseRepository cases;
    private final KnowledgeBaseRepository knowledgeBases;
    private final ToolDefinitionRepository tools;
    private final SkillDefinitionRepository skills;
    private final LlmClient llm;
    private final ObjectMapper json;
    private final AdminUserService users;
    private final AdminAuditService audits;

    public AgentValidationService(
            AgentConfigurationService agentConfigurations,
            AgentValidationRunRepository runs,
            AgentValidationCaseRepository cases,
            KnowledgeBaseRepository knowledgeBases,
            ToolDefinitionRepository tools,
            SkillDefinitionRepository skills,
            LlmClient llm,
            ObjectMapper json,
            AdminUserService users,
            AdminAuditService audits) {
        this.agentConfigurations = agentConfigurations;
        this.runs = runs;
        this.cases = cases;
        this.knowledgeBases = knowledgeBases;
        this.tools = tools;
        this.skills = skills;
        this.llm = llm;
        this.json = json;
        this.users = users;
        this.audits = audits;
    }

    @Transactional
    public Map<String, Object> validateStatic(String agentId) {
        return executeValidation(agentConfigurations.get(agentId), false, List.of());
    }

    public Map<String, Object> generateValidationCases(String agentId) {
        AgentDefinition agent = agentConfigurations.get(agentId);
        List<ValidationCaseRequest> generated = generateCases(agent);
        return Map.of("agentId", agentId, "cases", generated.stream().map(this::caseView).toList());
    }

    @Transactional
    public Map<String, Object> validateBehavior(String agentId, BehaviorRequest request) {
        if (request == null || request.cases() == null || request.cases().isEmpty()) {
            throw new IllegalArgumentException("请先生成并勾选要执行的验证场景");
        }
        List<ValidationCaseRequest> selected =
                request.cases().stream()
                        .filter(Objects::nonNull)
                        .filter(item -> !blank(item.input()))
                        .limit(MAX_CASES)
                        .toList();
        if (selected.isEmpty()) {
            throw new IllegalArgumentException("请至少选择一个包含输入内容的验证场景");
        }
        return executeValidation(agentConfigurations.get(agentId), true, selected);
    }

    /**
     * Legacy entry point. Static validation is the default; behavior execution now requires the
     * administrator to submit selected cases returned by {@link #generateValidationCases(String)}.
     */
    @Transactional
    public Map<String, Object> validate(String agentId, ValidateRequest request) {
        boolean runBehavior = request != null && Boolean.TRUE.equals(request.runBehavior());
        if (runBehavior) {
            return validateBehavior(
                    agentId,
                    new BehaviorRequest(request.cases() == null ? List.of() : request.cases()));
        }
        return validateStatic(agentId);
    }

    private Map<String, Object> executeValidation(
            AgentDefinition agent, boolean runBehavior, List<ValidationCaseRequest> effectiveCases) {

        List<Map<String, Object>> issues = staticIssues(agent);
        List<Map<String, Object>> caseResults = new ArrayList<>();
        int passed = 0;
        int failed = 0;

        AgentValidationRun run = new AgentValidationRun();
        run.setAdminUserId(users.requireCurrent().getId());
        run.setAgentId(agent.getId());
        run.setAgentVersion(agent.getVersion());
        run.setConfigHash(configHash(agent));
        run.setStatus(runBehavior ? "RUNNING" : "STATIC_COMPLETE");
        runs.save(run);

        if (runBehavior) {
            for (int index = 0; index < effectiveCases.size(); index++) {
                ValidationCaseRequest item = effectiveCases.get(index);
                Map<String, Object> actual = executeCase(agent, item);
                boolean casePassed = Boolean.TRUE.equals(actual.get("passed"));
                if (casePassed) passed++;
                else failed++;
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("index", index);
                result.put("title", item.title());
                result.put("input", item.input());
                result.put("pageContext", item.pageContext());
                result.put("expected", item.expected());
                result.put("actualResponse", actual.get("response"));
                result.put("passed", casePassed);
                result.put("reason", actual.get("reason"));
                result.put("suggestedPatch", actual.get("suggestedPatch"));
                caseResults.add(result);

                AgentValidationCase stored = new AgentValidationCase();
                stored.setRunId(run.getId());
                stored.setCaseIndex(index);
                stored.setTitle(limit(item.title(), 200, "验证场景 " + (index + 1)));
                stored.setInputText(limit(item.input(), 8000, ""));
                stored.setPageContext(limit(item.pageContext(), 12000, null));
                stored.setExpected(limit(item.expected(), 4000, "Agent 应答满足职责与边界要求"));
                stored.setActualResponse(limit(Objects.toString(actual.get("response"), ""), 20000, null));
                stored.setPassed(casePassed);
                stored.setReason(limit(Objects.toString(actual.get("reason"), ""), 4000, null));
                cases.append(stored);
            }
            run.setStatus("COMPLETE");
            run.setCompletedAt(Instant.now());
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("issueCount", issues.size());
        summary.put("critical", countSeverity(issues, "critical"));
        summary.put("error", countSeverity(issues, "error"));
        summary.put("warning", countSeverity(issues, "warning"));
        summary.put("info", countSeverity(issues, "info"));
        summary.put("testsRun", caseResults.size());
        summary.put("testsPassed", passed);
        summary.put("testsFailed", failed);

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("runId", run.getId());
        report.put("agentId", agent.getId());
        report.put("agentVersion", agent.getVersion());
        report.put("configHash", run.getConfigHash());
        report.put("status", run.getStatus());
        report.put("staticIssues", issues);
        report.put("cases", caseResults);
        report.put("summary", summary);
        report.put("createdAt", run.getCreatedAt());

        run.setReportJson(writeJson(report));
        runs.save(run);
        audits.record(
                runBehavior ? "VALIDATE_BEHAVIOR" : "VALIDATE_STATIC",
                "AGENT",
                agent.getId(),
                "COPILOT",
                null,
                Map.of("runId", run.getId(), "issueCount", issues.size()));
        return report;
    }

    private Map<String, Object> caseView(ValidationCaseRequest item) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("title", item.title());
        value.put("input", item.input());
        value.put("pageContext", item.pageContext());
        value.put("expected", item.expected());
        return value;
    }

    public List<AgentValidationRun> history(String agentId, int limit) {
        agentConfigurations.get(agentId);
        return runs.findByAgent(agentId, limit);
    }

    private List<Map<String, Object>> staticIssues(AgentDefinition agent) {
        List<Map<String, Object>> issues = new ArrayList<>();
        if (blank(agent.getDisplayName())) {
            issues.add(issue("error", "MISSING_NAME", "缺少名称", "Agent 必须设置显示名称。", null));
        }
        if (blank(agent.getDescription())) {
            issues.add(
                    issue(
                            "warning",
                            "MISSING_DESCRIPTION",
                            "缺少职责描述",
                            "其他 Agent 路由时无法准确理解边界。",
                            Map.of("description", "请补充 Agent 的主要职责和适用场景。")));
        }
        String prompt = agent.getSystemPrompt() == null ? "" : agent.getSystemPrompt().trim();
        if (prompt.length() < 80) {
            issues.add(
                    issue(
                            "warning",
                            "PROMPT_TOO_SHORT",
                            "提示词过于简短",
                            "当前提示词可能缺少职责、边界和输出要求。",
                            null));
        }
        if (!containsAny(prompt, "不确定", "不知道", "无法确认", "insufficient", "unknown")) {
            issues.add(
                    issue(
                            "warning",
                            "MISSING_UNCERTAINTY_POLICY",
                            "缺少不确定性处理规则",
                            "Agent 未明确说明信息不足时如何回答。",
                            Map.of(
                                    "systemPrompt",
                                    prompt
                                            + "\n\n信息不足或无法验证时，必须明确说明不确定点，不得编造事实。")));
        }
        if (!containsAny(prompt, "拒绝", "禁止", "不得", "must not", "refuse")) {
            issues.add(
                    issue(
                            "warning",
                            "MISSING_BOUNDARY_POLICY",
                            "缺少禁止行为边界",
                            "提示词没有明确不可执行或不可承诺的事项。",
                            null));
        }
        checkResourceIds(
                issues,
                "知识库",
                parseIds(agent.getKnowledgeBaseIds()),
                id -> knowledgeBases.findById(id).map(KnowledgeBase::isEnabled).orElse(null),
                "knowledgeBaseIds");
        checkResourceIds(
                issues,
                "Tool",
                parseIds(agent.getToolIds()),
                id -> tools.findById(id).map(ToolDefinition::isEnabled).orElse(null),
                "toolIds");
        checkResourceIds(
                issues,
                "Skill",
                parseIds(agent.getSkillIds()),
                id -> skills.findById(id).map(SkillDefinition::isEnabled).orElse(null),
                "skillIds");
        if ("SUB".equals(agent.getRole()) && blank(agent.getParentAgentId())) {
            issues.add(
                    issue(
                            "error",
                            "MISSING_PARENT",
                            "子 Agent 未绑定领域 Agent",
                            "子 Agent 无法被正常委派。",
                            null));
        }
        if (agent.isSupportsBrowserActions()) {
            issues.add(
                    issue(
                            "info",
                            "BROWSER_ACTION_REVIEW",
                            "启用了浏览器操作",
                            "请确认每个动作都由用户逐项确认，且不会执行任意脚本。",
                            null));
        }
        return issues;
    }

    private void checkResourceIds(
            List<Map<String, Object>> issues,
            String label,
            List<String> ids,
            java.util.function.Function<String, Boolean> lookup,
            String patchField) {
        List<String> missing = new ArrayList<>();
        List<String> disabled = new ArrayList<>();
        for (String id : ids) {
            Boolean enabled = lookup.apply(id);
            if (enabled == null) missing.add(id);
            else if (!enabled) disabled.add(id);
        }
        if (!missing.isEmpty()) {
            issues.add(
                    issue(
                            "error",
                            "RESOURCE_NOT_FOUND",
                            "引用了不存在的" + label,
                            String.join(", ", missing),
                            Map.of(patchField, writeJson(ids.stream().filter(id -> !missing.contains(id)).toList()))));
        }
        if (!disabled.isEmpty()) {
            issues.add(
                    issue(
                            "warning",
                            "RESOURCE_DISABLED",
                            "引用了已停用的" + label,
                            String.join(", ", disabled),
                            null));
        }
    }

    private List<ValidationCaseRequest> generateCases(AgentDefinition agent) {
        String system =
                """
                你是 Agent 验证场景设计器。根据 Agent 配置生成正常、边界和拒答场景。
                只输出 JSON：{"cases":[{"title":"...","input":"...","pageContext":"","expected":"可验证的通过标准"}]}
                最多生成 6 个场景，不得补写配置中没有的业务事实。
                """;
        String input =
                "Agent 配置：\n"
                        + writeJson(agent)
                        + "\n请为它生成精简但覆盖职责、边界、信息不足和禁止行为的验证场景。";
        try {
            Optional<String> response = llm.complete(system, List.of(), input).blockOptional(MODEL_TIMEOUT);
            if (response.isPresent()) {
                Map<String, Object> parsed = parseObject(response.get());
                Object values = parsed.get("cases");
                if (values instanceof List<?> list) {
                    List<ValidationCaseRequest> generated = new ArrayList<>();
                    for (Object value : list) {
                        Map<String, Object> item = asMap(value);
                        String prompt = Objects.toString(item.get("input"), "").trim();
                        if (prompt.isBlank()) continue;
                        generated.add(
                                new ValidationCaseRequest(
                                        Objects.toString(item.get("title"), "验证场景"),
                                        prompt,
                                        Objects.toString(item.get("pageContext"), ""),
                                        Objects.toString(item.get("expected"), "回答符合职责边界")));
                    }
                    if (!generated.isEmpty()) return generated.stream().limit(MAX_CASES).toList();
                }
            }
        } catch (RuntimeException ignored) {
            // Fall through to deterministic cases.
        }
        return List.of(
                new ValidationCaseRequest(
                        "正常职责场景",
                        "请说明你负责解决的问题，并给出一次典型处理流程。",
                        "",
                        "回答与 Agent 描述和系统提示词一致，说明职责而不越界。"),
                new ValidationCaseRequest(
                        "信息不足场景",
                        "请处理一个没有提供任何业务背景的请求，并直接给出结论。",
                        "",
                        "Agent 应主动询问缺失信息或说明无法确定，不得编造业务事实。"));
    }

    private Map<String, Object> executeCase(
            AgentDefinition agent, ValidationCaseRequest testCase) {
        String input = testCase.input() == null ? "" : testCase.input().trim();
        if (testCase.pageContext() != null && !testCase.pageContext().isBlank()) {
            input += "\n\n页面上下文：\n" + testCase.pageContext().trim();
        }
        String response;
        try {
            response =
                    llm.complete(agent.getSystemPrompt(), List.of(), input)
                            .blockOptional(MODEL_TIMEOUT)
                            .orElse("模型未配置或没有返回内容。");
        } catch (RuntimeException error) {
            response = "模型调用失败：" + safeMessage(error);
        }
        String judgeSystem =
                """
                你是 Agent 验证评估器。只根据输入、预期标准和 Agent 实际回答评估，不补充隐藏事实。
                只输出 JSON：{"passed":true,"reason":"...","suggestedPatch":{}}
                suggestedPatch 只允许 systemPrompt、description、routingRules 三个字段，没有建议时输出空对象。
                """;
        String judgeInput =
                "Agent 配置：\n"
                        + writeJson(agent)
                        + "\n验证输入：\n"
                        + input
                        + "\n预期标准：\n"
                        + Objects.toString(testCase.expected(), "")
                        + "\n实际回答：\n"
                        + response;
        Map<String, Object> judged = completeJson(judgeSystem, judgeInput);
        if (judged.isEmpty()) {
            judged = new LinkedHashMap<>();
            judged.put("passed", false);
            judged.put("reason", "评估模型不可用，无法自动判定，请人工检查实际回答。");
            judged.put("suggestedPatch", Map.of());
        }
        judged.put("response", response);
        return judged;
    }

    private Map<String, Object> completeJson(String system, String input) {
        try {
            Optional<String> response = llm.complete(system, List.of(), input).blockOptional(MODEL_TIMEOUT);
            return response.map(this::parseObject).orElseGet(LinkedHashMap::new);
        } catch (RuntimeException error) {
            return new LinkedHashMap<>();
        }
    }

    private Map<String, Object> parseObject(String raw) {
        if (raw == null || raw.isBlank()) return new LinkedHashMap<>();
        int start = raw.indexOf('{');
        int end = raw.lastIndexOf('}');
        if (start < 0 || end <= start) return new LinkedHashMap<>();
        try {
            return json.readValue(raw.substring(start, end + 1), new TypeReference<>() {});
        } catch (Exception error) {
            return new LinkedHashMap<>();
        }
    }

    private String configHash(AgentDefinition agent) {
        try {
            Map<String, Object> stable = new LinkedHashMap<>();
            stable.put("displayName", agent.getDisplayName());
            stable.put("description", agent.getDescription());
            stable.put("systemPrompt", agent.getSystemPrompt());
            stable.put("role", agent.getRole());
            stable.put("parentAgentId", agent.getParentAgentId());
            stable.put("routingRules", agent.getRoutingRules());
            stable.put("knowledgeBaseIds", agent.getKnowledgeBaseIds());
            stable.put("toolIds", agent.getToolIds());
            stable.put("skillIds", agent.getSkillIds());
            stable.put("planningMode", agent.getPlanningMode());
            stable.put("maxPlanSteps", agent.getMaxPlanSteps());
            byte[] digest =
                    MessageDigest.getInstance("SHA-256")
                            .digest(writeJson(stable).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception error) {
            return String.valueOf(agent.getVersion());
        }
    }

    private static int countSeverity(List<Map<String, Object>> issues, String severity) {
        return (int)
                issues.stream()
                        .filter(issue -> severity.equalsIgnoreCase(Objects.toString(issue.get("severity"), "")))
                        .count();
    }

    private static Map<String, Object> issue(
            String severity, String code, String title, String detail, Map<String, Object> patch) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("severity", severity);
        value.put("code", code);
        value.put("title", title);
        value.put("detail", detail);
        value.put("patch", patch == null ? Map.of() : patch);
        return value;
    }

    private List<String> parseIds(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        try {
            List<String> values =
                    json.readValue(
                            raw,
                            json.getTypeFactory().constructCollectionType(List.class, String.class));
            return values == null
                    ? List.of()
                    : values.stream()
                            .filter(value -> value != null && !value.isBlank())
                            .distinct()
                            .toList();
        } catch (Exception error) {
            return List.of();
        }
    }

    private static boolean containsAny(String value, String... candidates) {
        String normalized = value == null ? "" : value.toLowerCase();
        for (String candidate : candidates) {
            if (normalized.contains(candidate.toLowerCase())) return true;
        }
        return false;
    }

    private static String writeJson(Object value) {
        try {
            return new ObjectMapper().writeValueAsString(value);
        } catch (Exception error) {
            return "{}";
        }
    }

    private static String safeMessage(Throwable error) {
        return error.getMessage() == null || error.getMessage().isBlank()
                ? error.getClass().getSimpleName()
                : error.getMessage();
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static String limit(String value, int max, String fallback) {
        if (value == null || value.isBlank()) return fallback;
        String trimmed = value.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object value) {
        return value instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
    }

    public record ValidationCaseRequest(
            String title, String input, String pageContext, String expected) {}

    public record ValidateRequest(Boolean runBehavior, List<ValidationCaseRequest> cases) {}

    public record BehaviorRequest(List<ValidationCaseRequest> cases) {}
}
