import type { Translations } from "../i18n/translations";
import type { HookBinding, HookDefinition } from "../types";

export const HOOK_RULE_TYPES = [
  "REQUIRE_PAGE_CONSENT",
  "REQUIRE_PERMISSION",
  "REQUIRE_PAGE_CONTEXT",
  "KEYWORD_BLOCK",
  "MAX_MESSAGE_LENGTH",
  "REQUEST_BUDGET",
] as const;

export type HookRuleType = (typeof HOOK_RULE_TYPES)[number];

export function hookRuleLabel(ruleType: string, t: Translations): string {
  const labels: Record<string, string> = {
    REQUIRE_PAGE_CONSENT: t.requirePageConsent,
    REQUIRE_PERMISSION: t.requirePermission,
    REQUIRE_PAGE_CONTEXT: t.requirePageContext,
    KEYWORD_BLOCK: t.keywordBlock,
    MAX_MESSAGE_LENGTH: t.maxMessageLength,
    REQUEST_BUDGET: t.requestBudget,
  };
  return labels[ruleType] ?? ruleType;
}

export function hookPhaseLabel(phase: string, t: Translations): string {
  return phase === "PRE_ROUTE" ? t.preRoute : t.preAgent;
}

export function hookScopeLabel(hook: HookDefinition, t: Translations): string {
  if (
    !hook.bindings?.length ||
    hook.bindings.some((item) => item.targetType === "GLOBAL")
  ) {
    return t.globalScope;
  }
  const values = hook.bindings
    .map((binding) =>
      binding.targetType === "AGENT_ROLE" ? t.agentRoleScope : t.agentScope,
    )
    .filter((value, index, values) => values.indexOf(value) === index);
  return values.join(" · ");
}

export function parseRuleConfig(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function defaultRuleConfig(ruleType: HookRuleType): string {
  switch (ruleType) {
    case "REQUIRE_PERMISSION":
      return JSON.stringify({ permission: "readPage" });
    case "KEYWORD_BLOCK":
      return JSON.stringify({ keywords: ["delete", "export"] });
    case "MAX_MESSAGE_LENGTH":
      return JSON.stringify({ maxLength: 4000 });
    case "REQUEST_BUDGET":
      return JSON.stringify({
        messageMaxLength: 4000,
        pageContextMaxLength: 12000,
        totalMaxLength: 16000,
      });
    default:
      return "{}";
  }
}

export function hookRuleSummary(hook: HookDefinition, t: Translations): string {
  const config = parseRuleConfig(hook.ruleConfig);
  switch (hook.ruleType) {
    case "KEYWORD_BLOCK": {
      const values = Array.isArray(config.keywords)
        ? config.keywords.map(String).filter(Boolean)
        : [];
      return values.length ? values.join(", ") : t.incompleteConfiguration;
    }
    case "MAX_MESSAGE_LENGTH":
      return `${String(config.maxLength ?? "-")} ${t.characters}`;
    case "REQUEST_BUDGET":
      return [
        config.messageMaxLength
          ? `${t.testMessage}: ${String(config.messageMaxLength)}`
          : "",
        config.pageContextMaxLength
          ? `${t.testPageContext}: ${String(config.pageContextMaxLength)}`
          : "",
      ]
        .filter(Boolean)
        .join(" · ");
    case "REQUIRE_PERMISSION":
      return String(config.permission ?? t.incompleteConfiguration);
    default:
      return "-";
  }
}

export function normalizeBindings(bindings: HookBinding[]): HookBinding[] {
  const normalized = new Map<string, HookBinding>();
  for (const binding of bindings) {
    const targetType = binding.targetType;
    const targetId = targetType === "GLOBAL" ? "*" : binding.targetId.trim();
    if (!targetId) continue;
    normalized.set(`${targetType}:${targetId}`, { targetType, targetId });
  }
  return normalized.size
    ? [...normalized.values()]
    : [{ targetType: "GLOBAL", targetId: "*" }];
}
