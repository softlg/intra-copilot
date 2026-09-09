import { Icon } from "../components/Icon";
import { Dropdown } from "../components/Dropdown";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { TruncatedId } from "../components/TruncatedId";
import type { Translations } from "../i18n/translations";
import type { HookDefinition } from "../types";

export interface HooksPageProps {
  t: Translations;
  hooks: HookDefinition[];
  filteredHooks: HookDefinition[];
  loading: boolean;
  actionId?: string;
  onNew: () => void;
  onEdit: (hook: HookDefinition) => void;
  onToggle: (hook: HookDefinition) => void;
  onDelete: (hook: HookDefinition) => void;
}

/** List of pre-agent hooks with enable/disable and delete actions. */
export function HooksPage({
  t,
  hooks,
  filteredHooks,
  loading,
  actionId,
  onNew,
  onEdit,
  onToggle,
  onDelete,
}: HooksPageProps) {
  return (
    <section>
      <div className="resource-toolbar">
        <p className="muted">{t.hooksSubtitle}</p>
        <button type="button" onClick={() => onNew()}>
          {t.newHook}
        </button>
      </div>
      {loading && hooks.length === 0 ? (
        <Skeleton.CardList count={3} />
      ) : hooks.length === 0 ? (
        <EmptyState
          icon={<Icon name="hook" size={22} />}
          title={t.noHooks}
          hint={t.noResourcesHint}
          action={
            <button type="button" onClick={() => onNew()}>
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
            <article key={hook.id}>
              <div className="row">
                <strong>{hook.name}</strong>
                <span className={hook.enabled ? "ok" : "off"}>
                  {hook.enabled ? t.enabled : t.disabled}
                </span>
              </div>
              <TruncatedId value={hook.id} label="Hook ID" />
              <p>{hook.description || t.noDescription}</p>
              <div className="resource-meta">
                <span>{t.preAgent}</span>
                <span>{hook.ruleType}</span>
                <span>
                  {t.hookPriority}: {hook.priority}
                </span>
              </div>
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
                      tone: "danger",
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
