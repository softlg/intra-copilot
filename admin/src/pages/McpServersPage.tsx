import { Icon } from "../components/Icon";
import { Dropdown } from "../components/Dropdown";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { mcpStatusLabel } from "../lib/mcp";
import type { Translations } from "../i18n/translations";
import type { McpServer } from "../types";

export interface McpServersPageProps {
  t: Translations;
  servers: McpServer[];
  filtered: McpServer[];
  loading: boolean;
  error: string;
  actionId?: string;
  search: string;
  statusFilter: "all" | "enabled" | "disabled";
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: "all" | "enabled" | "disabled") => void;
  onNew: () => void;
  onRefresh: () => void;
  onEdit: (server: McpServer) => void;
  onToggle: (server: McpServer) => void;
  onDelete: (server: McpServer) => void;
  onCheckHealth: (server: McpServer) => void;
  onShowDetails: (server: McpServer) => void;
  onShowError: (server: McpServer) => void;
}

/** MCP server registry with health checks, a detail drawer and list controls. */
export function McpServersPage({
  t,
  servers,
  filtered,
  loading,
  error,
  actionId,
  search,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onNew,
  onRefresh,
  onEdit,
  onToggle,
  onDelete,
  onCheckHealth,
  onShowDetails,
  onShowError,
}: McpServersPageProps) {
  return (
    <section className="mcp-page">
      <div className="resource-toolbar">
        <div>
          <p className="muted">{t.mcpServersSubtitle}</p>
        </div>
        <div className="resource-toolbar-actions">
          <label className="resource-search">
            <Icon name="search" size={15} />
            <span className="sr-only">{t.search}</span>
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t.mcpSearchPlaceholder}
              type="search"
            />
          </label>
          <select
            className="resource-filter"
            value={statusFilter}
            onChange={(event) =>
              onStatusFilterChange(
                event.target.value as "all" | "enabled" | "disabled",
              )
            }
            aria-label={t.statusFilter}
          >
            <option value="all">{t.allStatuses}</option>
            <option value="enabled">{t.enabled}</option>
            <option value="disabled">{t.disabled}</option>
          </select>
          <button
            className="secondary"
            onClick={onRefresh}
            aria-label={t.mcpRefresh}
          >
            <Icon name="refresh" size={15} /> {t.mcpRefresh}
          </button>
          <button onClick={() => onNew()}>{t.newMcpServer}</button>
        </div>
      </div>
      {error && servers.length > 0 && (
        <div className="resource-error-banner" role="alert">
          <span>{error}</span>
          <button className="secondary" type="button" onClick={onRefresh}>
            {t.retry}
          </button>
        </div>
      )}
      {loading && servers.length === 0 ? (
        <Skeleton.CardList count={3} />
      ) : error && servers.length === 0 ? (
        <EmptyState
          icon={<Icon name="alert" size={22} />}
          title={t.resourceLoadFailed}
          hint={error}
          action={
            <button type="button" onClick={onRefresh}>
              {t.retry}
            </button>
          }
        />
      ) : servers.length === 0 ? (
        <EmptyState
          icon={<Icon name="plug" size={22} />}
          title={t.noResources}
          hint={t.noMcpServerHint}
          action={<button onClick={() => onNew()}>{t.newMcpServer}</button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          compact
          icon={<Icon name="search" size={22} />}
          title={t.noSearchResults}
          hint={t.noSearchResultsHint}
        />
      ) : (
        <div className="mcp-list" role="list" aria-label={t.mcpServersTitle}>
          <div className="mcp-list-header" aria-hidden="true">
            <span>{t.mcpServerName}</span>
            <span>{t.status}</span>
            <span>{t.mcpTransportLabel}</span>
            <span>{t.mcpInterfaceCount}</span>
            <span>
              {t.mcpLatency} / {t.mcpLastChecked}
            </span>
            <span>{t.actions}</span>
          </div>
          {filtered.map((server) => (
            <article className="mcp-list-row" role="listitem" key={server.id}>
              <div className="mcp-service-cell">
                <div className="mcp-service-heading">
                  <strong>{server.name}</strong>
                  <span
                    className={`mcp-status ${(server.status ?? "UNKNOWN").toLowerCase()}`}
                  >
                    {mcpStatusLabel(t, server.status)}
                  </span>
                </div>
                <p>{server.description || t.noDescription}</p>
                <code title={server.id}>{server.id}</code>
              </div>
              <div className="mcp-status-cell">
                <span
                  className={`mcp-status ${(server.status ?? "UNKNOWN").toLowerCase()}`}
                >
                  {mcpStatusLabel(t, server.status)}
                </span>
              </div>
              <div className="mcp-endpoint-cell">
                <span className="mcp-transport-tag">{server.transport}</span>
              </div>
              <div className="mcp-count-cell">
                <strong>{server.interfaceCount ?? 0}</strong>
                <span>{t.mcpInterfaces}</span>
              </div>
              <div className="mcp-check-cell">
                <strong>
                  {server.lastLatencyMs != null
                    ? `${server.lastLatencyMs} ms`
                    : "—"}
                </strong>
                <span>
                  {server.lastCheckedAt
                    ? new Date(server.lastCheckedAt).toLocaleString()
                    : t.mcpStatusUnknown}
                </span>
              </div>
              <div className="mcp-row-actions">
                {server.lastError && (
                  <button
                    type="button"
                    className="mcp-row-error-trigger"
                    onClick={() => onShowError(server)}
                    aria-label={t.mcpErrorDetail}
                  >
                    <Icon
                      name="warn"
                      size={14}
                      className="mcp-row-error-icon"
                    />
                  </button>
                )}
                <button
                  className="secondary"
                  onClick={() => onShowDetails(server)}
                >
                  {t.mcpDetails}
                </button>
                <button
                  className="secondary"
                  onClick={() => onCheckHealth(server)}
                  disabled={actionId === server.id}
                >
                  {actionId === server.id ? t.loading : t.mcpHealth}
                </button>
                <Dropdown
                  trigger={<Icon name="more" size={16} />}
                  align="right"
                  ariaLabel={t.moreActions}
                  items={[
                    {
                      key: "edit",
                      label: t.edit,
                      onSelect: () => onEdit(server),
                      disabled: actionId === server.id,
                    },
                    {
                      key: "toggle",
                      label: server.enabled ? t.stop : t.enable,
                      onSelect: () => onToggle(server),
                      disabled: actionId === server.id,
                    },
                    {
                      key: "delete",
                      label: t.deleteResource,
                      tone: "danger",
                      onSelect: () => onDelete(server),
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
