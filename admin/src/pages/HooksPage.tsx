import { Icon } from "../components/Icon";
import { Dropdown } from "../components/Dropdown";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { TruncatedId } from "../components/TruncatedId";
import type { Translations } from "../i18n/translations";
import {
  hookPhaseLabel,
  hookRuleLabel,
  hookRuleSummary,
  hookScopeLabel,
} from "../lib/hooks";
import type { HookDefinition, ResourceStatus } from "../types";

export interface HooksPageProps {
  t: Translations;
  hooks: HookDefinition[];
  filteredHooks: HookDefinition[];
  loading: boolean;
  actionId?: string;
  status: ResourceStatus;
  scope: string;
  ruleType: string;
  search: string;
  onStatusChange: (status: ResourceStatus) => void;
  onScopeChange: (scope: string) => void;
  onRuleTypeChange: (ruleType: string) => void;
  onSearchChange: (search: string) => void;
  onNew: () => void;
  onEdit: (hook: HookDefinition) => void;
  onToggle: (hook: HookDefinition) => void;
  onDelete: (hook: HookDefinition) => void;
}

/** Scoped hook policies with filtering, enable/disable and delete actions. */
export function HooksPage({
  t,
  hooks,
  filteredHooks,
  loading,
  actionId,
  status,
  scope,
  ruleType,
  search,
  onStatusChange,
  onScopeChange,
  onRuleTypeChange,
  onSearchChange,
  onNew,
  onEdit,
  onToggle,
  onDelete,
}: HooksPageProps) {
  return (
    <section>
      <div className="resource-toolbar">
        <p className="muted">{t.hooksSubtitle}</p>
        <div className="resource-toolbar-actions">
          <input
            className="resource-search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t.hookSearchPlaceholder}
            aria-label={t.searchPlaceholder}
          />
          <select
            className="resource-filter"
            value={status}
            onChange={(event) =>
              onStatusChange(event.target.value as ResourceStatus)
            }
            aria-label={t.statusFilter}
          >
            <option value="all">{t.allStatuses}</option>
            <option value="enabled">{t.enabled}</option>
            <option value="disabled">{t.disabled}</option>
          </select>
          <select
            className="resource-filter"
            value={scope}
            onChange={(event) => onScopeChange(event.target.value)}
            aria-label={t.hookScope}
          >
            <option value="all">{t.allScopes}</option>
            <option value="GLOBAL">{t.globalScope}</option>
            <option value="AGENT">{t.agentScope}</option>
            <option value="AGENT_ROLE">{t.agentRoleScope}</option>
          </select>
          <select
            className="resource-filter"
            value={ruleType}
            onChange={(event) => onRuleTypeChange(event.target.value)}
            aria-label={t.hookRuleType}
          >
            <option value="all">{t.allRuleTypes}</option>
            <option value="REQUIRE_PAGE_CONSENT">{t.requirePageConsent}</option>
            <option value="REQUIRE_PERMISSION">{t.requirePermission}</option>
            <option value="REQUIRE_PAGE_CONTEXT">{t.requirePageContext}</option>
            <option value="KEYWORD_BLOCK">{t.keywordBlock}</option>
            <option value="MAX_MESSAGE_LENGTH">{t.maxMessageLength}</option>
            <option value="REQUEST_BUDGET">{t.requestBudget}</option>
          </select>
          <button type="button" onClick={onNew}>
            {t.newHook}
          </button>
        </div>
      </div>
      {loading && hooks.length === 0 ? (
        <Skeleton.CardList count={3} />
      ) : hooks.length === 0 ? (
        <EmptyState
          icon={<Icon name="hook" size={22} />}
          title={t.noHooks}
          hint={t.noResourcesHint}
          action={
            <button type="button" onClick={onNew}>
              {t.newHook}
            </button>
          }
        />
      ) : filteredHooks.length === 0 ? (
        <EmptyState
          compact
          icon={<Icon name="search" size={22} />}
          title={t.noSearchResults}
          hint={t.noSearchResultsHint}
        />
      ) : (
        <div className="grid">
          {filteredHooks.map((hook) => (
            <article key={hook.id} className="hook-card">
              <div className="row">
                <strong>{hook.name}</strong>
                <span className={hook.enabled ? "ok" : "off"}>
                  {hook.enabled ? t.enabled : t.disabled}
                </span>
              </div>
              <TruncatedId value={hook.id} label="Hook ID" />
              <p>{hook.description || t.noDescription}</p>
              <div className="resource-meta">
                <span>{hookPhaseLabel(hook.phase, t)}</span>
                <span>{hookRuleLabel(hook.ruleType, t)}</span>
                <span>{hookScopeLabel(hook, t)}</span>
                <span>
                  {t.hookPriority}: {hook.priority}
                </span>
                <span>v{hook.version}</span>
              </div>
              <p className="hook-rule-summary">{hookRuleSummary(hook, t)}</p>
              <div className="agent-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onEdit(hook)}
                  disabled={actionId === hook.id}
                >
                  {t.edit}
                </button>
                <Dropdown
                  ariaLabel={t.hookActions}
                  trigger={
                    <Icon name="more" className="dropdown-trigger-icon" />
                  }
                  items={[
                    {
                      key: "toggle",
                      label: hook.enabled ? t.stop : t.enable,
                      onSelect: () => onToggle(hook),
                      disabled: actionId === hook.id,
                    },
                    {
                      key: "delete",
                      label: t.deleteResource,
                      onSelect: () => onDelete(hook),
                      disabled: hook.enabled,
                    },
                  ]}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
