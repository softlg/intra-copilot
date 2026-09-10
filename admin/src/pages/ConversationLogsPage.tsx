import Pagination from "../components/Pagination";
import { TruncatedId } from "../components/TruncatedId";
import { API } from "../lib/api";
import { formatDateTime, formatFileSize } from "../lib/format";
import type { Translations } from "../i18n/translations";
import type {
  ConversationInvocationTrace,
  ConversationLog,
  ConversationLogSummary,
} from "../types";

export interface ConversationLogsPageProps {
  t: Translations;
  logs: ConversationLogSummary[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  sessionId: string;
  sessionIdDraft: string;
  onSessionIdDraftChange: (value: string) => void;
  onApplyFilter: () => void;
  onResetFilter: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onOpenLog: (id: string) => void;
  detail?: ConversationLog;
  detailOpen: boolean;
  detailLoading: boolean;
  onCloseDetail: () => void;
}

function RouteCopilotTrace({
  trace,
  t,
}: {
  trace?: ConversationInvocationTrace;
  t: Translations;
}) {
  const events =
    trace?.events.filter(
      (event) =>
        event.eventType === "ROUTE_START" || event.eventType === "ROUTE_END",
    ) ?? [];
  if (events.length === 0) return null;
  return (
    <details className="conversation-log-route-events">
      <summary>{t.routeCopilotTrace}</summary>
      {events.map((event) => (
        <div className="conversation-log-route-event" key={event.id}>
          <div className="conversation-log-message-meta">
            <strong>{event.eventName || event.eventType}</strong>
            <code>{event.eventType}</code>
            {event.status && <span>{event.status}</span>}
            {event.durationMs != null && <small>{event.durationMs} ms</small>}
          </div>
          <pre>{JSON.stringify(event.payload ?? {}, null, 2)}</pre>
        </div>
      ))}
    </details>
  );
}

/** Searchable list of stored conversations with a detail overlay. */
export function ConversationLogsPage({
  t,
  logs,
  total,
  page,
  pageSize,
  loading,
  sessionId,
  sessionIdDraft,
  onSessionIdDraftChange,
  onApplyFilter,
  onResetFilter,
  onPageChange,
  onPageSizeChange,
  onOpenLog,
  detail,
  detailOpen,
  detailLoading,
  onCloseDetail,
}: ConversationLogsPageProps) {
  return (
    <>
      <section className="conversation-logs-page">
        <p className="muted">{t.conversationLogsSubtitle}</p>

        <div className="conversation-filter" role="search">
          <label className="conversation-filter-field">
            <span>{t.conversationSessionId}</span>
            <input
              type="text"
              value={sessionIdDraft}
              onChange={(event) => onSessionIdDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onApplyFilter();
                }
              }}
              placeholder={t.conversationSessionIdPlaceholder}
            />
          </label>
          <div className="conversation-filter-actions">
            <button
              type="button"
              onClick={() => {
                onApplyFilter();
              }}
            >
              {t.query}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                onResetFilter();
              }}
            >
              {t.reset}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="empty-documents">{t.loading}</p>
        ) : logs.length === 0 ? (
          <p className="empty-documents">
            {sessionId ? t.noSearchResults : t.noConversationLogs}
          </p>
        ) : (
          <>
            <div className="conversation-table-wrap">
              <table className="conversation-table">
                <colgroup>
                  <col className="conversation-col-id" />
                  <col className="conversation-col-title" />
                  <col className="conversation-col-time" />
                  <col className="conversation-col-count" />
                  <col className="conversation-col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t.conversationSessionId}</th>
                    <th>{t.conversationTitle}</th>
                    <th>{t.updatedAt}</th>
                    <th>{t.messageCount}</th>
                    <th className="conversation-table-actions">{t.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <TruncatedId
                          value={log.id}
                          head={8}
                          label={t.conversationSessionId}
                        />
                      </td>
                      <td className="conversation-title-cell">
                        {log.title || "-"}
                      </td>
                      <td className="conversation-time-cell">
                        {formatDateTime(log.updatedAt)}
                      </td>
                      <td>{log.messageCount}</td>
                      <td className="conversation-table-actions">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => onOpenLog(log.id)}
                        >
                          {t.detail}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              labels={{
                total: t.paginationTotal,
                pageSize: t.perPage,
                position: t.paginationPosition,
                prev: t.prevPage,
                next: t.nextPage,
              }}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
            />
          </>
        )}
      </section>

      {detailOpen && (
        <div
          className="conversation-detail-overlay"
          onClick={() => onCloseDetail()}
        >
          <div
            className="conversation-detail-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="conversation-detail-head">
              <div>
                <h3>
                  {detail?.title || detail?.id || t.conversationDetailTitle}
                </h3>
                {detail && <code>{detail.id}</code>}
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => onCloseDetail()}
              >
                {t.close}
              </button>
            </div>

            {detailLoading ? (
              <p className="empty-documents">{t.loading}</p>
            ) : !detail ? (
              <p className="empty-documents">{t.noSearchResults}</p>
            ) : (
              <div className="conversation-log-body conversation-detail-body">
                <section>
                  <h4>
                    {t.userMessage} / {t.assistantMessage}
                  </h4>
                  <div className="conversation-log-messages">
                    {detail.messages.length === 0 ? (
                      <p className="binding-empty">-</p>
                    ) : (
                      detail.messages.map((item) => (
                        <div
                          className={
                            item.role === "user"
                              ? "conversation-log-message user"
                              : "conversation-log-message assistant"
                          }
                          key={item.id}
                        >
                          <div className="conversation-log-message-meta">
                            <strong>
                              {item.role === "user"
                                ? t.userMessage
                                : t.assistantMessage}
                            </strong>
                            {item.agentId && <code>{item.agentId}</code>}
                            {item.createdAt && (
                              <small>
                                {new Date(item.createdAt).toLocaleString()}
                              </small>
                            )}
                          </div>
                          <p>{item.content || "-"}</p>
                          {item.attachments?.length ? (
                            <div
                              className="conversation-log-attachments"
                              aria-label={t.attachments}
                            >
                              {item.attachments.map((attachment) => (
                                <div
                                  className={
                                    attachment.isImage
                                      ? "conversation-log-attachment image"
                                      : "conversation-log-attachment"
                                  }
                                  key={attachment.id}
                                  title={attachment.filename}
                                >
                                  {attachment.isImage && attachment.url && (
                                    <a
                                      className="conversation-log-attachment-preview"
                                      href={`${API}${attachment.url}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      aria-label={`${t.imageAttachment}: ${attachment.filename}`}
                                    >
                                      <img
                                        src={`${API}${attachment.url}`}
                                        alt={attachment.filename}
                                        loading="lazy"
                                      />
                                    </a>
                                  )}
                                  <span className="conversation-log-attachment-kind">
                                    {attachment.isImage
                                      ? t.imageAttachment
                                      : t.fileAttachment}
                                  </span>
                                  <span className="conversation-log-attachment-name">
                                    {attachment.filename}
                                  </span>
                                  <small>
                                    {attachment.contentType || "-"} ·{" "}
                                    {formatFileSize(attachment.size)}
                                  </small>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {item.contextSummary && (
                            <details>
                              <summary>Context</summary>
                              <pre>{item.contextSummary}</pre>
                            </details>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </section>
                <section>
                  <h4>{t.invocationDetails}</h4>
                  {detail.invocations.length === 0 ? (
                    <p className="binding-empty">-</p>
                  ) : (
                    <div className="conversation-log-invocations">
                      {detail.invocations.map((item) => (
                        <div
                          className="conversation-log-invocation"
                          key={item.id}
                        >
                          <div className="conversation-log-message-meta">
                            <strong>{item.selectedAgentId || "-"}</strong>
                            {item.createdAt && (
                              <small>
                                {new Date(item.createdAt).toLocaleString()}
                              </small>
                            )}
                          </div>
                          <div className="conversation-log-fields">
                            <span>
                              {t.route}: {item.requestedAgentId || "auto"}
                            </span>
                            <span>
                              {t.confidence}:{" "}
                              {item.confidence == null
                                ? "-"
                                : item.confidence.toFixed(2)}
                            </span>
                            <span>
                              {t.duration}:{" "}
                              {item.durationMs == null
                                ? "-"
                                : `${item.durationMs} ms`}
                            </span>
                            <span>
                              {t.routeSource}: {item.routeSource || "-"}
                            </span>
                            <span>
                              {t.clientIp}: {item.clientIp || "-"}
                            </span>
                            <span>
                              {t.routeTrail}: {item.requestedAgentId || "auto"}{" "}
                              → {item.selectedAgentId || "-"}
                            </span>
                          </div>
                          <div className="conversation-log-trace">
                            <div>
                              <strong>{t.intentResult}</strong>
                              <p>{item.intent || item.routeReason || "-"}</p>
                            </div>
                            <div>
                              <strong>{t.contextTransfer}</strong>
                              <pre>{item.contextSent || "-"}</pre>
                            </div>
                            <div>
                              <strong>{t.responseTransfer}</strong>
                              <pre>{item.responseContent || "-"}</pre>
                            </div>
                          </div>
                          <RouteCopilotTrace
                            trace={detail.invocationTraces?.find(
                              (trace) => trace.invocation.id === item.id,
                            )}
                            t={t}
                          />
                          {item.routeReason && <p>{item.routeReason}</p>}
                          {item.error && <p className="error">{item.error}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
                <section>
                  <h4>{t.actionDetails}</h4>
                  {detail.actions.length === 0 ? (
                    <p className="binding-empty">-</p>
                  ) : (
                    <div className="conversation-log-invocations">
                      {detail.actions.map((item) => (
                        <div
                          className="conversation-log-invocation"
                          key={item.actionId}
                        >
                          <div className="conversation-log-message-meta">
                            <strong>{item.type || "-"}</strong>
                            <span
                              className={
                                item.status === "COMPLETED"
                                  ? "ok"
                                  : item.status === "FAILED"
                                    ? "off"
                                    : "badge"
                              }
                            >
                              {item.status === "COMPLETED"
                                ? t.actionCompleted
                                : item.status === "FAILED"
                                  ? t.actionFailed
                                  : t.actionPending}
                            </span>
                          </div>
                          <code>{item.target || item.actionId}</code>
                          {item.reason && <p>{item.reason}</p>}
                          {item.result && <pre>{item.result}</pre>}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
