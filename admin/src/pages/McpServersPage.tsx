import { Icon } from "../components/Icon";
import { Dropdown } from "../components/Dropdown";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { Tooltip } from "../components/Tooltip";
import { mcpStatusLabel, truncateError } from "../lib/mcp";
import type { Translations } from "../i18n/translations";
import type { McpServer } from "../types";

export interface McpServersPageProps {
  t: Translations;
  servers: McpServer[];
  filtered: McpServer[];
  loading: boolean;
  actionId?: string;
  onNew: () => void;
  onEdit: (server: McpServer) => void;
  onToggle: (server: McpServer) => void;
  onDelete: (server: McpServer) => void;
  onCheckHealth: (server: McpServer) => void;
  onShowDetails: (server: McpServer) => void;
  onShowError: (server: McpServer) => void;
}

/** MCP server registry with health checks and a detail drawer. */
export function McpServersPage({
  t,
  servers,
  filtered,
  loading,
  actionId,
  onNew,
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
        <button onClick={() => onNew()}>{t.newMcpServer}</button>
      </div>
      {loading && servers.length === 0 ? (
        <Skeleton.CardList count={3} />
      ) : servers.length === 0 ? (
        <EmptyState
          icon={<Icon name="plug" size={22} />}
          title={t.noResources}
          hint={t.noMcpServerHint}
          action={<button onClick={() => onNew()}>{t.newMcpServer}</button>}
        />
      ) : (
        <div className="mcp-list" role="list" aria-label={t.mcpServersTitle}>
          <div className="mcp-list-header" aria-hidden="true">
            <span>{t.mcpServerName}</span>
            <span>{t.status}</span>
            <span>
              {t.mcpTransportLabel} / {t.mcpServerUrlLabel}
            </span>
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
                <span className="mcp-endpoint" title={server.serverUrl}>
                  {server.serverUrl}
                </span>
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
                  <Tooltip
                    placement="top"
                    content={
                      <span className="mcp-row-error-tooltip">
                        {server.lastError}
                      </span>
                    }
                  >
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
                      <span className="mcp-row-error-summary">
                        {truncateError(server.lastError)}
                      </span>
                    </button>
                  </Tooltip>
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
