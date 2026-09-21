package com.intra.copilot.application.capability;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.intra.copilot.domain.capability.HookAuditLog;
import com.intra.copilot.domain.capability.HookBinding;
import com.intra.copilot.domain.capability.HookDefinition;
import com.intra.copilot.domain.capability.HookDefinitionVersion;
import com.intra.copilot.domain.conversation.AgentInvocationEvent;
import com.intra.copilot.infrastructure.persistence.conversation.AgentInvocationEventRepository;
import com.intra.copilot.infrastructure.persistence.capability.HookAuditLogRepository;
import com.intra.copilot.infrastructure.persistence.capability.HookBindingRepository;
import com.intra.copilot.infrastructure.persistence.capability.HookDefinitionRepository;
import com.intra.copilot.infrastructure.persistence.capability.HookDefinitionVersionRepository;
import java.text.Normalizer;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.intra.copilot.domain.agent.Agent;

/** Validates and manages scoped hook policies before model execution. */
@Service
public class HookService {
  public static final String PHASE_PRE_ROUTE = "PRE_ROUTE";
  public static final String PHASE_PRE_AGENT = "PRE_AGENT";

  private static final Set<String> RULE_TYPES =
      Set.of(
          "REQUIRE_PAGE_CONSENT",
          "REQUIRE_PERMISSION",
          "REQUIRE_PAGE_CONTEXT",
          "KEYWORD_BLOCK",
          "MAX_MESSAGE_LENGTH",
          "REQUEST_BUDGET");
  private static final Set<String> KNOWN_PERMISSIONS = Set.of("readPage");
  private static final Set<String> BINDING_TYPES = Set.of("GLOBAL", "AGENT", "AGENT_ROLE");

  private final HookDefinitionRepository repository;
  private final HookBindingRepository bindings;
  private final HookDefinitionVersionRepository versions;
  private final HookAuditLogRepository audits;
  private final AgentInvocationEventRepository invocationEvents;
  private final ObjectMapper json = new ObjectMapper().registerModule(new JavaTimeModule());

  public HookService(
      HookDefinitionRepository repository,
      HookBindingRepository bindings,
      HookDefinitionVersionRepository versions,
      HookAuditLogRepository audits,
      AgentInvocationEventRepository invocationEvents) {
    this.repository = repository;
    this.bindings = bindings;
    this.versions = versions;
    this.audits = audits;
    this.invocationEvents = invocationEvents;
  }

  public List<HookDefinition> all() {
    List<HookDefinition> hooks =
        repository.findAll().stream()
            .sorted(
                Comparator.comparing(HookDefinition::getPhase)
                    .thenComparingInt(HookDefinition::getPriority)
                    .thenComparing(HookDefinition::getName))
            .toList();
    return enrichBindings(hooks);
  }

  public List<HookDefinition> list(
      String query, String status, String scope, String ruleType) {
    String normalizedQuery = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
    String normalizedScope = scope == null ? "" : scope.trim().toUpperCase(Locale.ROOT);
    String normalizedRule = ruleType == null ? "" : ruleType.trim().toUpperCase(Locale.ROOT);
    return all().stream()
        .filter(
            hook ->
                status == null
                    || status.isBlank()
                    || status.equals("all")
                    || ("enabled".equals(status) && hook.isEnabled())
                    || ("disabled".equals(status) && !hook.isEnabled()))
        .filter(
            hook ->
                normalizedRule.isBlank()
                    || normalizedRule.equalsIgnoreCase(hook.getRuleType()))
        .filter(
            hook ->
                normalizedScope.isBlank()
                    || hook.getBindings().stream()
                        .anyMatch(binding -> normalizedScope.equals(binding.getTargetType())))
        .filter(
            hook ->
                normalizedQuery.isBlank()
                    || contains(hook.getName(), normalizedQuery)
                    || contains(hook.getDescription(), normalizedQuery)
                    || contains(hook.getRuleType(), normalizedQuery)
                    || hook.getBindings().stream()
                        .anyMatch(binding -> contains(binding.getTargetId(), normalizedQuery)))
        .toList();
  }

  public HookDefinition get(String id) {
    HookDefinition hook =
        repository.findById(id).orElseThrow(() -> new IllegalArgumentException("Hook 不存在"));
    return enrichBinding(hook);
  }

  @Transactional
  public HookDefinition create(HookDefinition input, String actor) {
    HookDefinition hook = normalizeDefinition(input);
    hook.setVersion(1);
    hook.setCreatedAt(Instant.now());
    hook.setUpdatedAt(Instant.now());
    hook.setCreatedBy(actor);
    hook.setUpdatedBy(actor);
    validate(hook);
    ensureNameAvailable(hook.getName(), null);

    repository.save(hook);
    bindings.replace(hook.getId(), normalizeBindings(hook.getBindings(), hook.getId()));
    recordVersion(hook, "CREATE", actor, null);
    appendAudit(hook.getId(), "CREATE", actor, null, hook);
    return get(hook.getId());
  }

  @Transactional
  public HookDefinition update(
      String id, HookDefinition input, long expectedVersion, String actor, String changeNote) {
    HookDefinition existing =
        repository.findById(id).orElseThrow(() -> new IllegalArgumentException("Hook 不存在"));
    if (expectedVersion > 0 && existing.getVersion() != expectedVersion) {
      throw new IllegalArgumentException("Hook 已被其他管理员修改，请刷新后重试");
    }

    HookDefinition hook = normalizeDefinition(input);
    hook.setId(id);
    hook.setCreatedAt(existing.getCreatedAt());
    hook.setCreatedBy(existing.getCreatedBy());
    hook.setVersion(existing.getVersion() + 1);
    hook.setUpdatedAt(Instant.now());
    hook.setUpdatedBy(actor);
    validate(hook);
    ensureNameAvailable(hook.getName(), id);

    if (!repository.updateIfVersionMatches(hook, existing.getVersion())) {
      throw new IllegalArgumentException("Hook 已被其他管理员修改，请刷新后重试");
    }
    bindings.replace(id, normalizeBindings(hook.getBindings(), id));
    recordVersion(hook, "UPDATE", actor, changeNote);
    appendAudit(id, "UPDATE", actor, existing, hook);
    return get(id);
  }

  @Transactional
  public HookDefinition setEnabled(
      String id, boolean enabled, long expectedVersion, String actor) {
    HookDefinition existing =
        repository.findById(id).orElseThrow(() -> new IllegalArgumentException("Hook 不存在"));
    if (expectedVersion > 0 && existing.getVersion() != expectedVersion) {
      throw new IllegalArgumentException("Hook 已被其他管理员修改，请刷新后重试");
    }
    HookDefinition hook = normalizeDefinition(existing);
    hook.setBindings(bindings.findByHookId(id));
    if (enabled) validate(hook);
    hook.setEnabled(enabled);
    hook.setVersion(existing.getVersion() + 1);
    hook.setUpdatedAt(Instant.now());
    hook.setUpdatedBy(actor);

    if (!repository.updateIfVersionMatches(hook, existing.getVersion())) {
      throw new IllegalArgumentException("Hook 已被其他管理员修改，请刷新后重试");
    }
    recordVersion(hook, enabled ? "ENABLE" : "DISABLE", actor, null);
    appendAudit(id, enabled ? "ENABLE" : "DISABLE", actor, existing, hook);
    return get(id);
  }

  @Transactional
  public void delete(String id, long expectedVersion, String actor) {
    HookDefinition existing =
        repository.findById(id).orElseThrow(() -> new IllegalArgumentException("Hook 不存在"));
    if (existing.isEnabled()) {
      throw new IllegalArgumentException("Hook 处于启用状态，请先停用后再删除");
    }
    if (expectedVersion > 0 && existing.getVersion() != expectedVersion) {
      throw new IllegalArgumentException("Hook 已被其他管理员修改，请刷新后重试");
    }
    appendAudit(id, "DELETE", actor, existing, null);
    repository.deleteById(id);
  }

  public HookValidationResult validateDefinition(HookDefinition input) {
    try {
      HookDefinition hook = normalizeDefinition(input);
      validate(hook);
      return new HookValidationResult(true, List.of(), hook);
    } catch (IllegalArgumentException error) {
      return new HookValidationResult(false, List.of(error.getMessage()), null);
    }
  }

  public HookTestResult test(HookDefinition input, Context context) {
    HookDefinition hook = normalizeDefinition(input);
    validate(hook);
    long started = System.nanoTime();
    HookCheck check = evaluate(hook, context);
    return new HookTestResult(
        check.passed(), List.of(check), (System.nanoTime() - started) / 1_000_000L);
  }

  public List<HookDefinitionVersion> versions(String hookId) {
    return versions.findByHookId(hookId);
  }

  public HookStats stats(String hookId) {
    get(hookId);
    long passed = invocationEvents.countHookChecks(hookId, "PASSED");
    long blocked = invocationEvents.countHookChecks(hookId, "FAILED");
    AgentInvocationEvent latest = invocationEvents.latestHookCheck(hookId);
    String lastMessage = null;
    if (latest != null && latest.getPayload() != null) {
      lastMessage = latest.getPayload().path("message").asText(null);
    }
    return new HookStats(
        passed + blocked,
        passed,
        blocked,
        latest == null ? null : latest.getCreatedAt(),
        lastMessage);
  }

  @Transactional
  public HookDefinition rollback(String id, long version, String actor) {
    HookDefinition existing =
        repository.findById(id).orElseThrow(() -> new IllegalArgumentException("Hook 不存在"));
    HookDefinitionVersion snapshot =
        versions
            .findByHookIdAndVersion(id, version)
            .orElseThrow(() -> new IllegalArgumentException("Hook 版本不存在"));
    try {
      HookDefinition restored = json.readValue(snapshot.getSnapshot(), HookDefinition.class);
      return update(id, restored, existing.getVersion(), actor, "回滚到版本 " + version);
    } catch (JsonProcessingException error) {
      throw new IllegalArgumentException("Hook 版本快照无法恢复");
    }
  }

  public HookResult validate(Context context) {
    for (HookCheck check : checks(context)) {
      if (!check.passed()) {
        return new HookResult(false, check.hookId(), check.hookName(), check.message());
      }
    }
    return new HookResult(true, null, null, null);
  }

  public List<HookCheck> checks(Context context) {
    List<HookDefinition> candidates =
        repository.findAll().stream()
            .filter(HookDefinition::isEnabled)
            .filter(hook -> phaseOf(hook).equalsIgnoreCase(context.phase()))
            .sorted(
                Comparator.comparingInt(HookDefinition::getPriority)
                    .thenComparing(HookDefinition::getName))
            .toList();
    Map<String, List<HookBinding>> byHook = bindingsByHookId(candidates);
    return candidates.stream()
        .filter(hook -> appliesTo(hook, byHook.get(hook.getId()), context))
        .map(hook -> evaluate(hook, context))
        .toList();
  }

  private HookCheck evaluate(HookDefinition hook, Context context) {
    long started = System.nanoTime();
    boolean passed;
    String message = failureMessage(hook);
    String evaluationError = null;
    try {
      passed = matches(hook, context);
    } catch (Exception error) {
      evaluationError = error.getMessage();
      passed = "WARN".equalsIgnoreCase(hook.getFailMode());
      message =
          passed
              ? "Hook 配置异常，当前仅告警：" + hook.getName()
              : "Hook 配置异常，请求已按失败关闭策略拦截：" + hook.getName();
    }
    return new HookCheck(
        hook.getId(),
        hook.getName(),
        hook.getRuleType(),
        phaseOf(hook),
        hook.getVersion(),
        hook.getRuleConfig(),
        hook.getFailMode(),
        passed,
        message,
        evaluationError,
        (System.nanoTime() - started) / 1_000_000L);
  }

  private boolean matches(HookDefinition hook, Context context) throws JsonProcessingException {
    JsonNode config = json.readTree(hook.getRuleConfig() == null ? "{}" : hook.getRuleConfig());
    return switch (ruleTypeOf(hook)) {
      case "REQUIRE_PAGE_CONSENT" -> context.pageContextConsent();
      case "REQUIRE_PERMISSION" -> {
        String permission = config.path("permission").asText();
        if ("readPage".equals(permission)) {
          yield context.pageContextConsent();
        }
        yield Boolean.TRUE.equals(
            (context.permissions() == null ? Map.<String, Boolean>of() : context.permissions())
                .get(permission));
      }
      case "REQUIRE_PAGE_CONTEXT" ->
          context.effectivePageContext() != null && !context.effectivePageContext().isBlank();
      case "KEYWORD_BLOCK" -> {
        String text = normalizeText(context.message());
        boolean found =
            config.path("keywords").isArray()
                && java.util.stream.StreamSupport.stream(
                        config.path("keywords").spliterator(), false)
                    .map(JsonNode::asText)
                    .map(HookService::normalizeText)
                    .filter(value -> !value.isBlank())
                    .anyMatch(text::contains);
        yield !found;
      }
      case "MAX_MESSAGE_LENGTH" ->
          context.message() != null
              && context.message().length() <= config.path("maxLength").asInt(4000);
      case "REQUEST_BUDGET" -> {
        int messageLength = context.message() == null ? 0 : context.message().length();
        int pageLength =
            context.effectivePageContext() == null ? 0 : context.effectivePageContext().length();
        int totalLength = messageLength + pageLength;
        yield withinLimit(config, "messageMaxLength", messageLength)
            && withinLimit(config, "pageContextMaxLength", pageLength)
            && withinLimit(config, "totalMaxLength", totalLength);
      }
      default -> false;
    };
  }

  private static boolean withinLimit(JsonNode config, String field, int value) {
    JsonNode limit = config.get(field);
    return limit == null || limit.isNull() || value <= limit.asInt();
  }

  private HookDefinition normalizeDefinition(HookDefinition input) {
    if (input == null) throw new IllegalArgumentException("Hook 配置不能为空");
    HookDefinition hook = new HookDefinition();
    hook.setId(input.getId() == null || input.getId().isBlank() ? hook.getId() : input.getId());
    hook.setName(input.getName() == null ? "" : input.getName().trim());
    hook.setDescription(blankToNull(input.getDescription()));
    hook.setPhase(phaseOf(input));
    hook.setRuleType(ruleTypeOf(input));
    hook.setRuleConfig(normalizeRuleConfig(hook.getRuleType(), input.getRuleConfig()));
    hook.setFailureMessage(blankToNull(input.getFailureMessage()));
    hook.setPriority(Math.max(0, Math.min(10000, input.getPriority())));
    hook.setEnabled(input.isEnabled());
    hook.setVersion(Math.max(1, input.getVersion()));
    hook.setFailMode("WARN".equalsIgnoreCase(input.getFailMode()) ? "WARN" : "BLOCK");
    hook.setUpdatedBy(blankToNull(input.getUpdatedBy()));
    hook.setBindings(
        normalizeBindings(
            input.getBindings() == null || input.getBindings().isEmpty()
                ? List.of(globalBinding())
                : input.getBindings(),
            hook.getId()));
    return hook;
  }

  private void validate(HookDefinition hook) {
    if (hook.getName() == null || hook.getName().isBlank()) {
      throw new IllegalArgumentException("Hook 名称不能为空");
    }
    if (hook.getName().length() > 160) {
      throw new IllegalArgumentException("Hook 名称不能超过 160 个字符");
    }
    if (!PHASE_PRE_ROUTE.equals(hook.getPhase()) && !PHASE_PRE_AGENT.equals(hook.getPhase())) {
      throw new IllegalArgumentException("不支持的 Hook 执行阶段");
    }
    if (!RULE_TYPES.contains(hook.getRuleType())) {
      throw new IllegalArgumentException("不支持的 Hook 规则类型");
    }
    if (PHASE_PRE_ROUTE.equals(hook.getPhase())
        && hook.getBindings().stream()
            .anyMatch(binding -> !"GLOBAL".equals(binding.getTargetType()))) {
      throw new IllegalArgumentException("路由前规则仅支持全局作用域");
    }
    if (!"BLOCK".equals(hook.getFailMode()) && !"WARN".equals(hook.getFailMode())) {
      throw new IllegalArgumentException("失败策略仅支持 BLOCK 或 WARN");
    }
    try {
      JsonNode config = json.readTree(hook.getRuleConfig());
      switch (hook.getRuleType()) {
        case "REQUIRE_PERMISSION" -> {
          String permission = config.path("permission").asText("");
          if (permission.isBlank() || !KNOWN_PERMISSIONS.contains(permission)) {
            throw new IllegalArgumentException("权限 Hook 必须配置受支持的 permission");
          }
        }
        case "KEYWORD_BLOCK" -> {
          if (!config.path("keywords").isArray() || config.path("keywords").isEmpty()) {
            throw new IllegalArgumentException("关键词 Hook 至少需要一个有效关键词");
          }
        }
        case "MAX_MESSAGE_LENGTH" -> {
          if (config.path("maxLength").asInt(0) <= 0) {
            throw new IllegalArgumentException("长度 Hook 必须配置正整数 maxLength");
          }
        }
        case "REQUEST_BUDGET" -> {
          if (!hasPositiveLimit(config, "messageMaxLength")
              && !hasPositiveLimit(config, "pageContextMaxLength")
              && !hasPositiveLimit(config, "totalMaxLength")) {
            throw new IllegalArgumentException("输入预算至少需要配置一个正整数上限");
          }
        }
        default -> {
          // Consent, page-context, and legacy rules do not require additional fields.
        }
      }
    } catch (JsonProcessingException error) {
      throw new IllegalArgumentException("Hook 规则配置必须是有效 JSON 对象");
    }
  }

  private static boolean hasPositiveLimit(JsonNode config, String field) {
    JsonNode value = config.get(field);
    return value != null && value.isIntegralNumber() && value.asInt() > 0;
  }

  private String normalizeRuleConfig(String ruleType, String rawConfig) {
    ObjectNode config;
    try {
      JsonNode parsed = json.readTree(rawConfig == null || rawConfig.isBlank() ? "{}" : rawConfig);
      if (!parsed.isObject()) throw new IllegalArgumentException("Hook 规则配置必须是 JSON 对象");
      config = (ObjectNode) parsed;
    } catch (JsonProcessingException error) {
      throw new IllegalArgumentException("Hook 规则配置必须是有效 JSON 对象");
    }
    if ("KEYWORD_BLOCK".equals(ruleType) && config.path("keywords").isArray()) {
      LinkedHashSet<String> normalized = new LinkedHashSet<>();
      ArrayNode values = (ArrayNode) config.path("keywords");
      for (JsonNode value : values) {
        String keyword = normalizeText(value.asText());
        if (!keyword.isBlank()) normalized.add(keyword);
      }
      config.set("keywords", json.valueToTree(normalized));
    }
    if (("REQUIRE_PAGE_CONSENT".equals(ruleType) || "REQUIRE_PAGE_CONTEXT".equals(ruleType))
        && (rawConfig == null || rawConfig.isBlank())) {
      config = json.createObjectNode();
    }
    try {
      return json.writeValueAsString(config);
    } catch (JsonProcessingException error) {
      throw new IllegalArgumentException("Hook 规则配置序列化失败");
    }
  }

  private List<HookBinding> normalizeBindings(List<HookBinding> source, String hookId) {
    LinkedHashMap<String, HookBinding> normalized = new LinkedHashMap<>();
    for (HookBinding binding : source == null ? List.<HookBinding>of() : source) {
      String targetType =
          binding == null || binding.getTargetType() == null
              ? ""
              : binding.getTargetType().trim().toUpperCase(Locale.ROOT);
      if (!BINDING_TYPES.contains(targetType)) {
        throw new IllegalArgumentException("不支持的 Hook 作用域");
      }
      boolean global = "GLOBAL".equals(targetType);
      String targetId =
          global ? "*" : binding.getTargetId() == null ? "" : binding.getTargetId().trim();
      if (!global && targetId.isBlank()) {
        throw new IllegalArgumentException("Agent 作用域必须指定目标");
      }
      HookBinding value = new HookBinding();
      value.setHookId(hookId);
      value.setTargetType(targetType);
      value.setTargetId(targetId);
      normalized.put(targetType + ":" + targetId, value);
    }
    if (normalized.isEmpty()) normalized.put("GLOBAL:*", globalBinding());
    return List.copyOf(normalized.values());
  }

  private HookBinding globalBinding() {
    HookBinding binding = new HookBinding();
    binding.setTargetType("GLOBAL");
    binding.setTargetId("*");
    return binding;
  }

  private boolean appliesTo(
      HookDefinition hook, List<HookBinding> hookBindings, Context context) {
    List<HookBinding> effective =
        hookBindings == null || hookBindings.isEmpty() ? List.of(globalBinding()) : hookBindings;
    return effective.stream()
        .anyMatch(
            binding -> {
              String type = binding.getTargetType().toUpperCase(Locale.ROOT);
              return switch (type) {
                case "GLOBAL" -> true;
                case "AGENT" -> equalsIgnoreCase(context.agentId(), binding.getTargetId());
                case "AGENT_ROLE" ->
                    equalsIgnoreCase(context.agentRole(), binding.getTargetId());
                default -> false;
              };
            });
  }

  private List<HookDefinition> enrichBindings(List<HookDefinition> hooks) {
    Map<String, List<HookBinding>> byHook = bindingsByHookId(hooks);
    for (HookDefinition hook : hooks) {
      hook.setBindings(
          byHook.getOrDefault(hook.getId(), List.of(globalBinding())).stream()
              .filter(binding -> binding != null)
              .toList());
    }
    return hooks;
  }

  private HookDefinition enrichBinding(HookDefinition hook) {
    List<HookBinding> values = bindings.findByHookId(hook.getId());
    hook.setBindings(values.isEmpty() ? List.of(globalBinding()) : values);
    return hook;
  }

  private Map<String, List<HookBinding>> bindingsByHookId(List<HookDefinition> hooks) {
    List<String> ids = hooks.stream().map(HookDefinition::getId).toList();
    if (ids.isEmpty()) return Map.of();
    Map<String, List<HookBinding>> byHook = new LinkedHashMap<>();
    for (HookBinding binding : bindings.findByHookIds(ids)) {
      byHook.computeIfAbsent(binding.getHookId(), ignored -> new ArrayList<>()).add(binding);
    }
    return byHook;
  }

  private void ensureNameAvailable(String name, String excludingId) {
    boolean duplicate =
        repository.findAll().stream()
            .anyMatch(
                item ->
                    !item.getId().equals(excludingId)
                        && item.getName() != null
                        && item.getName().trim().equalsIgnoreCase(name.trim()));
    if (duplicate) throw new IllegalArgumentException("Hook 名称已存在");
  }

  private void recordVersion(
      HookDefinition hook, String action, String actor, String changeNote) {
    HookDefinitionVersion version = new HookDefinitionVersion();
    version.setHookId(hook.getId());
    version.setVersion(hook.getVersion());
    version.setSnapshot(toJson(hook));
    version.setChangeNote(changeNote);
    version.setCreatedBy(actor);
    versions.save(version);
  }

  private void appendAudit(
      String hookId, String action, String actor, HookDefinition before, HookDefinition after) {
    HookAuditLog audit = new HookAuditLog();
    audit.setHookId(hookId);
    audit.setAction(action);
    audit.setActor(actor);
    audit.setBeforeConfig(before == null ? null : toJson(before));
    audit.setAfterConfig(after == null ? null : toJson(after));
    audits.append(audit);
  }

  private String toJson(HookDefinition hook) {
    try {
      return json.writeValueAsString(hook);
    } catch (JsonProcessingException error) {
      throw new IllegalArgumentException("Hook 配置序列化失败");
    }
  }

  private static String phaseOf(HookDefinition hook) {
    return hook.getPhase() == null || hook.getPhase().isBlank()
        ? PHASE_PRE_AGENT
        : hook.getPhase().trim().toUpperCase(Locale.ROOT);
  }

  private static String ruleTypeOf(HookDefinition hook) {
    return hook.getRuleType() == null ? "" : hook.getRuleType().trim().toUpperCase(Locale.ROOT);
  }

  private static String failureMessage(HookDefinition hook) {
    if (hook.getFailureMessage() != null && !hook.getFailureMessage().isBlank()) {
      return hook.getFailureMessage();
    }
    return "请求未通过校验：" + hook.getName();
  }

  private static String normalizeText(String value) {
    if (value == null) return "";
    return Normalizer.normalize(value, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT).trim();
  }

  private static boolean contains(String value, String query) {
    return value != null && value.toLowerCase(Locale.ROOT).contains(query);
  }

  private static boolean equalsIgnoreCase(String left, String right) {
    return left != null && right != null && left.equalsIgnoreCase(right);
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  public record Context(
      String message,
      String effectivePageContext,
      String agentId,
      String agentRole,
      String phase,
      boolean pageContextConsent,
      Map<String, Boolean> permissions,
      int attachmentCount) {
    public Context(
        String message, String pageContext, String agentId, Map<String, Boolean> permissions) {
      this(message, pageContext, agentId, null, PHASE_PRE_AGENT, false, permissions, 0);
    }
  }

  public record HookResult(boolean allowed, String hookId, String hookName, String message) {}

  public record HookCheck(
      String hookId,
      String hookName,
      String ruleType,
      String phase,
      long ruleVersion,
      String ruleConfig,
      String failMode,
      boolean passed,
      String message,
      String evaluationError,
      long durationMs) {}

  public record HookValidationResult(
      boolean valid, List<String> errors, HookDefinition normalized) {}

  public record HookTestResult(boolean allowed, List<HookCheck> checks, long durationMs) {}

  public record HookStats(
      long executions,
      long passed,
      long blocked,
      Instant lastEvaluatedAt,
      String lastMessage) {}
}
