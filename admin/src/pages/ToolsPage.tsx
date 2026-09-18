import { Icon } from "../components/Icon";
import { Dropdown } from "../components/Dropdown";
import { EmptyState } from "../components/EmptyState";
import { ResourceCardControls } from "../components/ResourceCardControls";
import { Skeleton } from "../components/Skeleton";
import type { Translations } from "../i18n/translations";
import type { ResourceStatus, ToolDefinition } from "../types";

export interface ToolsPageProps {
  t: Translations;
  tools: ToolDefinition[];
  filteredTools: ToolDefinition[];
  loading: boolean;
  error: string;
  actionId?: string;
  status: ResourceStatus;
  search: string;
  onStatusChange: (status: ResourceStatus) => void;
  onSearchChange: (value: string) => void;
  onNew: () => void;
  onRetry: () => void;
  onEdit: (item: ToolDefinition) => void;
  onShowDetails: (item: ToolDefinition) => void;
  onTest: (item: ToolDefinition) => void;
  onToggle: (item: ToolDefinition) => void;
  onDelete: (item: ToolDefinition) => void;
}

/** Tool registry with status filter, enable/disable and delete. */
export function ToolsPage({
  t,
  tools,
  filteredTools,
  loading,
  error,
  actionId,
  status,
  search,
  onStatusChange,
  onSearchChange,
  onNew,
  onRetry,
  onEdit,
  onShowDetails,
  onTest,
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
          <label className="resource-search">
            <Icon name="search" size={15} />
            <span className="sr-only">{t.search}</span>
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t.searchPlaceholder}
              type="search"
            />
          </label>
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
        {error && tools.length > 0 && (
          <div className="resource-error-banner" role="alert">
            <span>{error}</span>
            <button className="secondary" type="button" onClick={onRetry}>
              {t.retry}
            </button>
          </div>
        )}
        {loading && tools.length === 0 ? (
          <Skeleton.CardList count={3} />
        ) : error && tools.length === 0 ? (
          <EmptyState
            icon={<Icon name="alert" size={22} />}
            title={t.resourceLoadFailed}
            hint={error}
            action={
              <button type="button" onClick={onRetry}>
                {t.retry}
              </button>
            }
          />
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
              <article
                key={tool.id}
                className="tool-card resource-card-clickable"
              >
                <button
                  type="button"
                  className="resource-card-hit-area"
                  aria-label={`${t.viewDetails}: ${tool.name}`}
                  onClick={() => onShowDetails(tool)}
                />
                <div className="agent-card-header">
                  <div className="agent-card-title tool-card-title">
                    <Icon name="tool" size={18} />
                    <strong title={tool.name}>{tool.name}</strong>
                    <span className={tool.enabled ? "ok" : "off"}>
                      {tool.enabled ? t.enabled : t.disabled}
                    </span>
                  </div>
                  <ResourceCardControls
                    enabled={tool.enabled}
                    busy={actionId === tool.id}
                    enableLabel={t.enable}
                    disableLabel={t.stop}
                    deleteLabel={t.deleteResource}
                    deleteDisabledHint={t.deleteDisabledEnabled}
                    onToggle={() => onToggle(tool)}
                    onDelete={() => onDelete(tool)}
                  />
                </div>
                <p className="tool-card-description">
                  {tool.description || t.noDescription}
                </p>
                <div className="tool-card-meta">
                  <span className="badge tool-card-kind">
                    {tool.type || t.toolTypeLabel}
                    {tool.method ? ` · ${tool.method}` : ""}
                  </span>
                </div>
                <div className="agent-actions tool-card-actions">
                  <button
                    className="secondary"
                    type="button"
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
                        key: "test",
                        label: t.testTool,
                        onSelect: () => onTest(tool),
                        disabled: actionId === tool.id,
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
