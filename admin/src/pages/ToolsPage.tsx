import { Icon } from "../components/Icon";
import { Dropdown } from "../components/Dropdown";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { TruncatedId } from "../components/TruncatedId";
import type { Translations } from "../i18n/translations";
import type { ResourceStatus, ToolDefinition } from "../types";

export interface ToolsPageProps {
  t: Translations;
  tools: ToolDefinition[];
  filteredTools: ToolDefinition[];
  loading: boolean;
  actionId?: string;
  status: ResourceStatus;
  onStatusChange: (status: ResourceStatus) => void;
  onNew: () => void;
  onEdit: (item: ToolDefinition) => void;
  onToggle: (item: ToolDefinition) => void;
  onDelete: (item: ToolDefinition) => void;
}

/** Tool registry with status filter, enable/disable and delete. */
export function ToolsPage({
  t,
  tools,
  filteredTools,
  loading,
  actionId,
  status,
  onStatusChange,
  onNew,
  onEdit,
  onToggle,
  onDelete,
}: ToolsPageProps) {
  return (
    <section>
      <div className="resource-toolbar">
        <div>
          <p className="muted">{t.toolsSubtitle}</p>
        </div>
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
          <button onClick={() => onNew()}>{t.newTool}</button>
        </div>
      </div>
      <div className="resource-section">
        <h3>{t.tool}</h3>
        {loading && tools.length === 0 ? (
          <Skeleton.CardList count={3} />
        ) : tools.length === 0 ? (
          <EmptyState
            icon={<Icon name="tool" size={22} />}
            title={t.noResources}
            hint={t.noResourcesHint}
            action={<button onClick={() => onNew()}>{t.newTool}</button>}
          />
        ) : filteredTools.length === 0 ? (
          <EmptyState
            compact
            icon={<Icon name="search" size={22} />}
            title={t.noSearchResults}
            hint={t.noSearchResultsHint}
          />
        ) : (
          <div className="grid">
            {filteredTools.map((tool) => (
              <article key={tool.id}>
                <div className="row">
                  <strong>{tool.name}</strong>
                  <span className={tool.enabled ? "ok" : "off"}>
                    {tool.enabled ? t.enabled : t.disabled}
                  </span>
                </div>
                <TruncatedId value={tool.id} label="Tool ID" />
                <p>{tool.description || t.noDescription}</p>
                <div className="resource-meta">
                  <span>{tool.type || t.toolTypeLabel}</span>
                  {tool.method && <span>{tool.method}</span>}
                  {tool.endpoint && <span>{tool.endpoint}</span>}
                </div>
                <div className="agent-actions">
                  <button
                    className="secondary"
                    onClick={() => onEdit(tool)}
                    disabled={actionId === tool.id}
                  >
                    {t.edit}
                  </button>
                  <Dropdown
                    ariaLabel={t.toolActions}
                    trigger={
                      <Icon name="more" className="dropdown-trigger-icon" />
                    }
                    items={[
                      {
                        key: "toggle",
                        label: tool.enabled ? t.stop : t.enable,
                        onSelect: () => onToggle(tool),
                        disabled: actionId === tool.id,
                      },
                      {
                        key: "delete",
                        label: t.deleteResource,
                        onSelect: () => onDelete(tool),
                        disabled: tool.enabled,
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
