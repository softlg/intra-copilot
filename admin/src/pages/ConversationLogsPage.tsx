import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import Pagination from "../components/Pagination";
import { TruncatedId } from "../components/TruncatedId";
import { API } from "../lib/api";
import { formatDateTime, formatFileSize } from "../lib/format";
import type { Translations } from "../i18n/translations";
import type {
  ConversationInvocation,
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

type ConversationMessage = ConversationLog["messages"][number];

type TimelineEntry =
  | {
      kind: "message";
      id: string;
      createdAt?: string;
      turn: number;
      message: ConversationMessage;
    }
  | {
      kind: "invocation";
      id: string;
      createdAt?: string;
      turn: number;
      invocation: ConversationInvocation;
      trace?: ConversationInvocationTrace;
    };

function timestamp(value?: string) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function formatDuration(totalMs: number) {
  if (totalMs <= 0) return "-";
  if (totalMs < 1000) return `${totalMs} ms`;
  return `${(totalMs / 1000).toFixed(totalMs >= 10000 ? 0 : 1)} s`;
}

function formatJson(value: unknown) {
  if (value == null || value === "") return "-";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildTimeline(detail?: ConversationLog): TimelineEntry[] {
  if (!detail) return [];
  const userMessageTimes = detail.messages
    .filter((message) => message.role === "user")
    .map((message) => timestamp(message.createdAt))
    .filter(Number.isFinite);
  let currentTurn = 0;
  const messageEntries: TimelineEntry[] = detail.messages.map((message) => {
    if (message.role === "user") currentTurn += 1;
    return {
      kind: "message",
      id: message.id,
      createdAt: message.createdAt,
      turn: Math.max(1, currentTurn),
      message,
    };
  });
  const invocationEntries: TimelineEntry[] = detail.invocations.map(
    (invocation) => {
      const invocationTime = timestamp(invocation.createdAt);
      const turn = Number.isFinite(invocationTime)
        ? Math.max(
            1,
            userMessageTimes.filter(
              (messageTime) => messageTime <= invocationTime,
            ).length,
          )
        : Math.max(1, currentTurn);
      return {
        kind: "invocation",
        id: invocation.id,
        createdAt: invocation.createdAt,
        turn,
        invocation,
        trace: detail.invocationTraces?.find(
          (trace) => trace.invocation.id === invocation.id,
        ),
      };
    },
  );
  return [...messageEntries, ...invocationEntries].sort((left, right) => {
    const timeDifference =
      timestamp(left.createdAt) - timestamp(right.createdAt);
    if (timeDifference !== 0) return timeDifference;
    const rank = (entry: TimelineEntry) => {
      if (entry.kind === "invocation") return 1;
      return entry.message.role === "user" ? 0 : 2;
    };
    return rank(left) - rank(right);
  });
}

function timelineEntryMatches(
  entry: TimelineEntry,
  query: string,
  errorsOnly: boolean,
) {
  if (errorsOnly) {
    return entry.kind === "invocation" && Boolean(entry.invocation.error);
  }
  if (!query) return true;
  if (entry.kind === "message") {
    return [
      entry.message.content,
      entry.message.agentId,
      entry.message.contextSummary,
    ].some((value) => value?.toLowerCase().includes(query));
  }
  return [
    entry.invocation.selectedAgentId,
    entry.invocation.requestedAgentId,
    entry.invocation.intent,
    entry.invocation.routeReason,
    entry.invocation.responseContent,
    entry.invocation.error,
  ].some((value) => value?.toLowerCase().includes(query));
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
  const start = events.find((event) => event.eventType === "ROUTE_START");
  const end = events.find((event) => event.eventType === "ROUTE_END");
  if (!start && !end) return null;
  return (
    <section className="conversation-inspector-section">
      <h5>{t.routeCopilotTrace}</h5>
      {start && (
        <details className="conversation-inspector-details">
          <summary>{t.conversationSystemPrompt}</summary>
          <pre>{formatJson(start.payload?.systemPrompt)}</pre>
        </details>
      )}
      {start && (
        <details className="conversation-inspector-details">
          <summary>{t.conversationUserInput}</summary>
          <pre>{formatJson(start.payload?.userInput)}</pre>
        </details>
      )}
      {end && (
        <details className="conversation-inspector-details">
          <summary>{t.conversationRawOutput}</summary>
          <pre>{formatJson(end.payload?.rawModelOutput)}</pre>
        </details>
      )}
      {end && (
        <details className="conversation-inspector-details">
          <summary>{t.conversationRawDetails}</summary>
          <pre>{formatJson(end.payload)}</pre>
        </details>
      )}
    </section>
  );
}

function ConversationInspector({
  invocation,
  trace,
  t,
  copiedKey,
  onCopy,
}: {
  invocation?: ConversationInvocation;
  trace?: ConversationInvocationTrace;
  t: Translations;
  copiedKey: string;
  onCopy: (value: string, key: string) => void;
}) {
  if (!invocation) {
    return (
      <aside className="conversation-detail-inspector">
        <h4>{t.conversationStepDetails}</h4>
        <p className="conversation-inspector-empty">
          {t.conversationSelectInvocation}
        </p>
      </aside>
    );
  }
  const copyKey = `step-${invocation.id}`;
  return (
    <aside className="conversation-detail-inspector">
      <div className="conversation-inspector-head">
        <div>
          <span>{t.conversationStepDetails}</span>
          <h4>{invocation.selectedAgentId || "-"}</h4>
        </div>
        <button
          type="button"
          className="icon-button"
          title={t.conversationCopyStepDetails}
          aria-label={t.conversationCopyStepDetails}
          onClick={() => onCopy(formatJson(invocation), copyKey)}
        >
          <Icon name={copiedKey === copyKey ? "check" : "copy"} size={15} />
        </button>
      </div>
      <div className="conversation-inspector-metrics">
        <div>
          <span>{t.route}</span>
          <strong>{invocation.routeSource || "-"}</strong>
        </div>
        <div>
          <span>{t.confidence}</span>
          <strong>
            {invocation.confidence == null
              ? "-"
              : invocation.confidence.toFixed(2)}
          </strong>
        </div>
        <div>
          <span>{t.duration}</span>
          <strong>
            {invocation.durationMs == null
              ? "-"
              : `${invocation.durationMs} ms`}
          </strong>
        </div>
        <div>
          <span>{t.clientIp}</span>
          <strong>{invocation.clientIp || "-"}</strong>
        </div>
      </div>
      <section className="conversation-inspector-section">
        <h5>{t.intentResult}</h5>
        <p>{invocation.intent || invocation.routeReason || "-"}</p>
      </section>
      <section className="conversation-inspector-section">
        <h5>{t.routeTrail}</h5>
        <div className="conversation-route-trail">
          <span>{invocation.requestedAgentId || "auto"}</span>
          <Icon name="chevron-right" size={14} />
          <strong>{invocation.selectedAgentId || "-"}</strong>
        </div>
      </section>
      <RouteCopilotTrace trace={trace} t={t} />
      <section className="conversation-inspector-section">
        <h5>{t.contextTransfer}</h5>
        <pre>{formatJson(invocation.contextSent)}</pre>
      </section>
      <section className="conversation-inspector-section">
        <h5>{t.responseTransfer}</h5>
        <pre>{formatJson(invocation.responseContent)}</pre>
      </section>
      {invocation.error && (
        <section className="conversation-inspector-section error">
          <h5>{t.conversationErrorCount}</h5>
          <p>{invocation.error}</p>
        </section>
      )}
    </aside>
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
  const [detailQuery, setDetailQuery] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [selectedInvocationId, setSelectedInvocationId] = useState<string>();
  const [copiedKey, setCopiedKey] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeDetailRef = useRef(onCloseDetail);

  useEffect(() => {
    closeDetailRef.current = onCloseDetail;
  }, [onCloseDetail]);

  useEffect(() => {
    if (!detailOpen) return undefined;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(
      () => closeButtonRef.current?.focus(),
      0,
    );
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetailRef.current();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [detailOpen]);

  useEffect(() => {
    setDetailQuery("");
    setErrorsOnly(false);
    setSelectedInvocationId(undefined);
  }, [detail?.id]);

  useEffect(() => {
    if (!detail) return;
    if (
      selectedInvocationId &&
      detail.invocations.some(
        (invocation) => invocation.id === selectedInvocationId,
      )
    ) {
      return;
    }
    const preferred =
      detail.invocations.find((invocation) => invocation.error) ??
      detail.invocations[0];
    setSelectedInvocationId(preferred?.id);
  }, [detail, selectedInvocationId]);

  const timeline = useMemo(() => buildTimeline(detail), [detail]);
  const normalizedQuery = detailQuery.trim().toLowerCase();
  const visibleTimeline = timeline.filter((entry) =>
    timelineEntryMatches(entry, normalizedQuery, errorsOnly),
  );
  const selectedInvocation = detail?.invocations.find(
    (invocation) => invocation.id === selectedInvocationId,
  );
  const selectedTrace = detail?.invocationTraces?.find(
    (trace) => trace.invocation.id === selectedInvocationId,
  );
  const totalDuration =
    detail?.invocations.reduce(
      (sum, invocation) => sum + (invocation.durationMs ?? 0),
      0,
    ) ?? 0;
  const errorCount =
    (detail?.invocations.filter((invocation) => Boolean(invocation.error))
      .length ?? 0) +
    (detail?.actions.filter((action) => action.status === "FAILED").length ??
      0);
  const visibleActions = errorsOnly
    ? (detail?.actions.filter((action) => action.status === "FAILED") ?? [])
    : (detail?.actions ?? []);

  const copyText = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(""), 1600);
    } catch {
      setCopiedKey("");
    }
  };

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
          role="presentation"
          onClick={() => closeDetailRef.current()}
        >
          <div
            className="conversation-detail-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="conversation-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="conversation-detail-head">
              <div className="conversation-detail-title">
                <span>{t.conversationDetailTitle}</span>
                <h3 id="conversation-detail-title">
                  {detail?.title || detail?.id || t.conversationDetailTitle}
                </h3>
                {detail && (
                  <div className="conversation-detail-id">
                    <code>{detail.id}</code>
                    <button
                      type="button"
                      className="icon-button"
                      title={t.conversationCopySessionId}
                      aria-label={t.conversationCopySessionId}
                      onClick={() => copyText(detail.id, "session-id")}
                    >
                      <Icon
                        name={copiedKey === "session-id" ? "check" : "copy"}
                        size={15}
                      />
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                ref={closeButtonRef}
                className="icon-button"
                title={t.close}
                aria-label={t.close}
                onClick={() => closeDetailRef.current()}
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            {detailLoading ? (
              <div className="conversation-detail-state">
                <p className="empty-documents">{t.loading}</p>
              </div>
            ) : !detail ? (
              <div className="conversation-detail-state">
                <p className="empty-documents">{t.noSearchResults}</p>
              </div>
            ) : (
              <>
                <div className="conversation-detail-summary">
                  <div
                    className={`conversation-summary-stat status ${
                      errorCount > 0 ? "attention" : "healthy"
                    }`}
                  >
                    <span>{t.status}</span>
                    <strong>
                      <Icon
                        name={errorCount > 0 ? "alert" : "check"}
                        size={14}
                      />
                      {errorCount > 0
                        ? t.conversationNeedsAttention
                        : t.conversationHealthy}
                    </strong>
                  </div>
                  <div className="conversation-summary-stat">
                    <span>{t.messageCount}</span>
                    <strong>{detail.messages.length}</strong>
                  </div>
                  <div className="conversation-summary-stat">
                    <span>{t.conversationTotalCalls}</span>
                    <strong>{detail.invocations.length}</strong>
                  </div>
                  <div className="conversation-summary-stat">
                    <span>{t.actionDetails}</span>
                    <strong>{detail.actions.length}</strong>
                  </div>
                  <div className="conversation-summary-stat">
                    <span>{t.conversationTotalDuration}</span>
                    <strong>{formatDuration(totalDuration)}</strong>
                  </div>
                </div>

                <div className="conversation-detail-toolbar">
                  <label className="conversation-detail-search">
                    <span className="sr-only">
                      {t.conversationSearchPlaceholder}
                    </span>
                    <Icon name="search" size={15} />
                    <input
                      value={detailQuery}
                      onChange={(event) => setDetailQuery(event.target.value)}
                      placeholder={t.conversationSearchPlaceholder}
                    />
                  </label>
                  <button
                    type="button"
                    className={
                      errorsOnly
                        ? "secondary conversation-filter-toggle active"
                        : "secondary conversation-filter-toggle"
                    }
                    aria-pressed={errorsOnly}
                    onClick={() => setErrorsOnly((value) => !value)}
                  >
                    <Icon name="alert" size={15} />
                    {t.conversationOnlyErrors}
                  </button>
                </div>

                <div className="conversation-detail-workspace">
                  <div className="conversation-detail-timeline">
                    <div className="conversation-timeline-heading">
                      <div>
                        <span>{t.conversationOverview}</span>
                        <h4>{t.conversationTimeline}</h4>
                      </div>
                      <span>
                        {visibleTimeline.length}/{timeline.length}
                      </span>
                    </div>
                    {visibleTimeline.length === 0 ? (
                      <p className="conversation-timeline-empty">
                        {t.conversationNoMatches}
                      </p>
                    ) : (
                      <div className="conversation-timeline-list">
                        {visibleTimeline.map((entry) =>
                          entry.kind === "message" ? (
                            <article
                              className={`conversation-timeline-entry ${entry.message.role}`}
                              key={entry.id}
                            >
                              <span className="conversation-timeline-marker">
                                <Icon
                                  name={
                                    entry.message.role === "user"
                                      ? "chat"
                                      : "bot"
                                  }
                                  size={15}
                                />
                              </span>
                              <div className="conversation-timeline-card">
                                <div className="conversation-timeline-meta">
                                  <span className="conversation-step-label">
                                    {t.conversationTurn(entry.turn)}
                                  </span>
                                  <strong>
                                    {entry.message.role === "user"
                                      ? t.userMessage
                                      : t.assistantMessage}
                                  </strong>
                                  {entry.message.agentId && (
                                    <code>{entry.message.agentId}</code>
                                  )}
                                  {entry.createdAt && (
                                    <time>
                                      {new Date(
                                        entry.createdAt,
                                      ).toLocaleString()}
                                    </time>
                                  )}
                                </div>
                                <p>{entry.message.content || "-"}</p>
                                {entry.message.attachments?.length ? (
                                  <div
                                    className="conversation-log-attachments"
                                    aria-label={t.attachments}
                                  >
                                    {entry.message.attachments.map(
                                      (attachment) => (
                                        <div
                                          className={
                                            attachment.isImage
                                              ? "conversation-log-attachment image"
                                              : "conversation-log-attachment"
                                          }
                                          key={attachment.id}
                                          title={attachment.filename}
                                        >
                                          {attachment.isImage &&
                                            attachment.url && (
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
                                      ),
                                    )}
                                  </div>
                                ) : null}
                                {entry.message.contextSummary && (
                                  <details className="conversation-inline-details">
                                    <summary>Context</summary>
                                    <pre>{entry.message.contextSummary}</pre>
                                  </details>
                                )}
                              </div>
                            </article>
                          ) : (
                            <article
                              className={`conversation-timeline-entry invocation ${
                                selectedInvocationId === entry.id
                                  ? "selected"
                                  : ""
                              }`}
                              key={entry.id}
                            >
                              <span className="conversation-timeline-marker">
                                <Icon name="router" size={15} />
                              </span>
                              <button
                                type="button"
                                className="conversation-timeline-card conversation-invocation-card"
                                aria-pressed={selectedInvocationId === entry.id}
                                onClick={() =>
                                  setSelectedInvocationId(entry.invocation.id)
                                }
                              >
                                <span className="conversation-timeline-meta">
                                  <span className="conversation-step-label">
                                    {t.conversationTurn(entry.turn)}
                                  </span>
                                  <strong>
                                    {entry.invocation.selectedAgentId || "-"}
                                  </strong>
                                  <span className="conversation-chip">
                                    {entry.invocation.routeSource || "-"}
                                  </span>
                                  {entry.invocation.confidence != null && (
                                    <span className="conversation-chip">
                                      {t.confidence}{" "}
                                      {entry.invocation.confidence.toFixed(2)}
                                    </span>
                                  )}
                                  {entry.invocation.durationMs != null && (
                                    <span className="conversation-chip">
                                      {entry.invocation.durationMs} ms
                                    </span>
                                  )}
                                  {entry.createdAt && (
                                    <time>
                                      {new Date(
                                        entry.createdAt,
                                      ).toLocaleString()}
                                    </time>
                                  )}
                                  <Icon name="chevron-right" size={15} />
                                </span>
                                <span className="conversation-invocation-summary">
                                  {entry.invocation.intent ||
                                    entry.invocation.routeReason ||
                                    "-"}
                                </span>
                                {entry.invocation.error && (
                                  <span className="conversation-inline-error">
                                    <Icon name="alert" size={13} />
                                    {entry.invocation.error}
                                  </span>
                                )}
                              </button>
                            </article>
                          ),
                        )}
                      </div>
                    )}

                    {visibleActions.length > 0 && (
                      <details
                        className="conversation-action-section"
                        open={errorsOnly || undefined}
                      >
                        <summary>
                          <span>
                            <Icon name="play" size={14} />
                            {t.actionDetails}
                          </span>
                          <span>{visibleActions.length}</span>
                        </summary>
                        <div className="conversation-action-list">
                          {visibleActions.map((action) => (
                            <div
                              className="conversation-action-card"
                              key={action.actionId}
                            >
                              <div className="conversation-timeline-meta">
                                <strong>{action.type || "-"}</strong>
                                <span
                                  className={
                                    action.status === "COMPLETED"
                                      ? "ok"
                                      : action.status === "FAILED"
                                        ? "off"
                                        : "badge"
                                  }
                                >
                                  {action.status === "COMPLETED"
                                    ? t.actionCompleted
                                    : action.status === "FAILED"
                                      ? t.actionFailed
                                      : t.actionPending}
                                </span>
                              </div>
                              <code>{action.target || action.actionId}</code>
                              {action.reason && <p>{action.reason}</p>}
                              {action.result && <pre>{action.result}</pre>}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                  <ConversationInspector
                    invocation={selectedInvocation}
                    trace={selectedTrace}
                    t={t}
                    copiedKey={copiedKey}
                    onCopy={copyText}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
