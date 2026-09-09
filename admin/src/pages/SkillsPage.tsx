import { Icon } from "../components/Icon";
import { Dropdown } from "../components/Dropdown";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { TruncatedId } from "../components/TruncatedId";
import type { Translations } from "../i18n/translations";
import type { ResourceStatus, SkillDefinition } from "../types";

export interface SkillsPageProps {
  t: Translations;
  skills: SkillDefinition[];
  filteredSkills: SkillDefinition[];
  loading: boolean;
  actionId?: string;
  status: ResourceStatus;
  onStatusChange: (status: ResourceStatus) => void;
  onNew: () => void;
  onEdit: (item: SkillDefinition) => void;
  onToggle: (item: SkillDefinition) => void;
  onDelete: (item: SkillDefinition) => void;
}

/** Skill registry with status filter, enable/disable and delete. */
export function SkillsPage({
  t,
  skills,
  filteredSkills,
  loading,
  actionId,
  status,
  onStatusChange,
  onNew,
  onEdit,
  onToggle,
  onDelete,
}: SkillsPageProps) {
  return (
    <section>
      <div className="resource-toolbar">
        <p className="muted">{t.skillsSubtitle}</p>
        <div className="resource-toolbar-actions">
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
          <button onClick={() => onNew()}>{t.newSkill}</button>
        </div>
      </div>
      <div className="resource-section">
        <h3>{t.skill}</h3>
        {loading && skills.length === 0 ? (
          <Skeleton.CardList count={3} />
        ) : skills.length === 0 ? (
          <EmptyState
            icon={<Icon name="sparkle" size={22} />}
            title={t.noResources}
            hint={t.noResourcesHint}
            action={<button onClick={() => onNew()}>{t.newSkill}</button>}
          />
        ) : filteredSkills.length === 0 ? (
          <EmptyState
            compact
            icon={<Icon name="search" size={22} />}
            title={t.noSearchResults}
            hint={t.noSearchResultsHint}
          />
        ) : (
          <div className="grid">
            {filteredSkills.map((skill) => (
              <article key={skill.id}>
                <div className="row">
                  <strong>{skill.name}</strong>
                  <span className={skill.enabled ? "ok" : "off"}>
                    {skill.enabled ? t.enabled : t.disabled}
                  </span>
                </div>
                <TruncatedId value={skill.id} label="Skill ID" />
                <p>{skill.description || t.noDescription}</p>
                <div className="resource-meta">
                  <span>v{skill.version || "1.0.0"}</span>
                </div>
                <div className="agent-actions">
                  <button
                    className="secondary"
                    onClick={() => onEdit(skill)}
                    disabled={actionId === skill.id}
                  >
                    {t.edit}
                  </button>
                  <Dropdown
                    ariaLabel={t.skillActions}
                    trigger={
                      <Icon name="more" className="dropdown-trigger-icon" />
                    }
                    items={[
                      {
                        key: "toggle",
                        label: skill.enabled ? t.stop : t.enable,
                        onSelect: () => onToggle(skill),
                        disabled: actionId === skill.id,
                      },
                      {
                        key: "delete",
                        label: t.deleteResource,
                        onSelect: () => onDelete(skill),
                        disabled: skill.enabled,
                        tone: "danger",
                      },
                    ]}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
