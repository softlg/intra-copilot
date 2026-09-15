import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { request } from "../lib/api";
import type { Language, Translations } from "../i18n/translations";
import type { AgentFeedback, FeedbackPage, FeedbackSummary } from "../types";

type Period = "7d" | "30d" | "all";

export interface RatingsPageProps {
  t: Translations;
  language: Language;
}

const REASON_CODES = [
  "INACCURATE",
  "IRRELEVANT",
  "TOO_LONG",
  "FORMAT_UI",
  "OTHER",
  "MISSING",
] as const;

function reasonLabel(code: string | undefined, t: Translations) {
  switch (code) {
    case "INACCURATE":
      return t.feedbackReasonInaccurate;
    case "IRRELEVANT":
      return t.feedbackReasonIrrelevant;
    case "TOO_LONG":
      return t.feedbackReasonTooLong;
    case "FORMAT_UI":
      return t.feedbackReasonFormat;
    case "OTHER":
      return t.feedbackReasonOther;
    default:
      return t.feedbackReasonMissing;
  }
}

function suggestionLabel(code: string, t: Translations) {
  switch (code) {
    case "MISSING_REASON":
      return t.feedbackSuggestionMissingReason;
    case "INACCURATE":
      return t.feedbackSuggestionInaccurate;
    case "IRRELEVANT":
      return t.feedbackSuggestionIrrelevant;
    case "TOO_LONG":
      return t.feedbackSuggestionTooLong;
    case "FORMAT_UI":
      return t.feedbackSuggestionFormat;
    default:
      return t.feedbackSuggestionReviewDetails;
  }
}

function periodFrom(period: Period) {
  if (period === "all") return "";
  const days = period === "7d" ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function excerpt(value: string | undefined, max = 220) {
  if (!value) return "-";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function formatDate(value: string | undefined, language: Language) {
  if (!value) return "-";
  return new Date(value).toLocaleString(language === "zh" ? "zh-CN" : "en-US");
}

/** Filterable ratings and feedback overview for every agent. */
export function RatingsPage({ t, language }: RatingsPageProps) {
  const [items, setItems] = useState<AgentFeedback[]>([]);
  const [summary, setSummary] = useState<FeedbackSummary>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [period, setPeriod] = useState<Period>("7d");
  const [agentId, setAgentId] = useState("");
  const [rating, setRating] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      page: String(page),
      size: String(pageSize),
    });
    const from = periodFrom(period);
    if (from) params.set("from", from);
    if (agentId) params.set("agentId", agentId);
    if (rating) params.set("rating", rating);
    if (reasonCode) params.set("reasonCode", reasonCode);
    if (query) params.set("keyword", query);
    const queryString = params.toString();

    setLoading(true);
    setError("");
    Promise.all([
      request<FeedbackPage>(`/admin/agent-feedback?${queryString}`),
      request<FeedbackSummary>(`/admin/agent-feedback/summary?${queryString}`),
    ])
      .then(([pageResult, summaryResult]) => {
        if (cancelled) return;
        setItems(pageResult.items);
        setSummary(summaryResult);
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
        setSummary(undefined);
        setError(t.feedbackLoadFailed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    agentId,
    page,
    period,
    query,
    rating,
    reasonCode,
    reloadKey,
    t.feedbackLoadFailed,
  ]);

  const visibleTrend = useMemo(
    () =>
      period === "7d"
        ? (summary?.trend ?? []).slice(-7)
        : (summary?.trend ?? []),
    [period, summary?.trend],
  );
  const maxTrend = Math.max(
    1,
    ...visibleTrend.map((point) => point.up + point.down),
  );
  const reasonTotal = Object.values(summary?.downReasons ?? {}).reduce(
    (sum, count) => sum + count,
    0,
  );
  const totalPages = Math.max(1, Math.ceil((summary?.total ?? 0) / pageSize));
  const agentOptions = Object.entries(summary?.agentNames ?? {}).sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  const trendWindowLabel =
    period === "7d"
      ? t.feedbackPeriod7
      : period === "30d"
        ? t.feedbackPeriod30
        : t.feedbackTrendLast30Days;

  const resetFilters = () => {
    setPeriod("7d");
    setAgentId("");
    setRating("");
    setReasonCode("");
    setQueryDraft("");
    setQuery("");
    setPage(1);
  };

  return (
    <section className="ratings-page">
      <p className="muted">{t.ratingsSubtitle}</p>

      <div className="feedback-filters" role="search">
        <label className="feedback-filter-field">
          <span>{t.feedbackPeriod7}</span>
          <select
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value as Period);
              setPage(1);
            }}
          >
            <option value="7d">{t.feedbackPeriod7}</option>
            <option value="30d">{t.feedbackPeriod30}</option>
            <option value="all">{t.feedbackPeriodAll}</option>
          </select>
        </label>
        <label className="feedback-filter-field">
          <span>{t.feedbackAgentFilter}</span>
          <select
            value={agentId}
            onChange={(event) => {
              setAgentId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t.feedbackFilterAll}</option>
            {agentOptions.map(([id, name]) => (
              <option value={id} key={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="feedback-filter-field">
          <span>{t.feedbackRatingFilter}</span>
          <select
            value={rating}
            onChange={(event) => {
              const nextRating = event.target.value;
              setRating(nextRating);
              if (nextRating === "up") setReasonCode("");
              setPage(1);
            }}
          >
            <option value="">{t.feedbackFilterAll}</option>
            <option value="up">{t.ratingUp}</option>
            <option value="down">{t.ratingDown}</option>
          </select>
        </label>
        <label className="feedback-filter-field">
          <span>{t.feedbackReasonFilter}</span>
          <select
            value={reasonCode}
            onChange={(event) => {
              const nextReason = event.target.value;
              setReasonCode(nextReason);
              if (nextReason) setRating("down");
              setPage(1);
            }}
          >
            <option value="">{t.feedbackFilterAll}</option>
            {REASON_CODES.map((code) => (
              <option value={code} key={code}>
                {reasonLabel(code, t)}
              </option>
            ))}
          </select>
        </label>
        <label className="feedback-search">
          <span className="sr-only">{t.feedbackKeywordPlaceholder}</span>
          <Icon name="search" size={15} />
          <input
            value={queryDraft}
            onChange={(event) => setQueryDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setQuery(queryDraft.trim());
                setPage(1);
              }
            }}
            placeholder={t.feedbackKeywordPlaceholder}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setQuery(queryDraft.trim());
            setPage(1);
          }}
        >
          {t.query}
        </button>
        <button type="button" className="secondary" onClick={resetFilters}>
          {t.reset}
        </button>
      </div>

      {error && (
        <div className="feedback-load-error" role="alert">
          <Icon name="alert" size={16} />
          <span>{error}</span>
          <button
            type="button"
            className="secondary"
            onClick={() => setReloadKey((current) => current + 1)}
          >
            {t.feedbackRetry}
          </button>
        </div>
      )}

      {summary && (
        <>
          {summary.noReason > 0 && (
            <button
              type="button"
              className="feedback-summary-missing"
              onClick={() => {
                setRating("down");
                setReasonCode("MISSING");
                setPage(1);
              }}
            >
              <Icon name="warn" size={12} />
              {t.feedbackNoReasonHint(summary.noReason)}
            </button>
          )}

          <div className="feedback-summary-grid">
            <div className="feedback-summary-card">
              <span>{t.totalFeedback}</span>
              <strong>{summary.total}</strong>
              <small>
                {t.ratingUp} {summary.up} · {t.ratingDown} {summary.down}
              </small>
            </div>
            <div className="feedback-summary-card positive">
              <span>{t.positiveRate}</span>
              <strong>{summary.positiveRate}%</strong>
              <small>
                {summary.up}/{summary.total}
              </small>
            </div>
            <div className="feedback-summary-card negative">
              <span>{t.ratingDown}</span>
              <strong>{summary.down}</strong>
              <small>{t.feedbackReasonFilter}</small>
            </div>
            <div className="feedback-summary-card">
              <span>{t.reasonCoverage}</span>
              <strong>{summary.reasonCoverage}%</strong>
              <small>
                {t.feedbackReasonCoverageHint(
                  Math.max(0, summary.down - summary.noReason),
                  summary.down,
                )}
              </small>
            </div>
          </div>

          <div className="feedback-agent-panel">
            <div className="feedback-section-head">
              <div>
                <h3>{t.feedbackAgentInspection}</h3>
                <span>{t.feedbackAgentInspectionHint}</span>
              </div>
              <Icon name="agents" size={17} />
            </div>
            {summary.agentBreakdown.length === 0 ? (
              <p className="feedback-agent-empty">
                {t.feedbackNoAgentBreakdown}
              </p>
            ) : (
              <>
                <div className="feedback-agent-header" aria-hidden="true">
                  <span>{t.feedbackAgentFilter}</span>
                  <span>{t.totalFeedback}</span>
                  <span>{t.ratingUp}</span>
                  <span>{t.ratingDown}</span>
                  <span>{t.positiveRate}</span>
                  <span>{t.feedbackTopReason}</span>
                </div>
                <div className="feedback-agent-list">
                  {summary.agentBreakdown.map((insight) => (
                    <button
                      type="button"
                      className="feedback-agent-row"
                      key={insight.agentId || "unknown"}
                      disabled={!insight.agentId}
                      onClick={() => {
                        setAgentId(insight.agentId);
                        setPage(1);
                      }}
                    >
                      <span className="feedback-agent-name">
                        <strong>
                          {insight.agentName || t.feedbackUnknownAgent}
                        </strong>
                        {insight.agentName && insight.agentId && (
                          <code>{insight.agentId}</code>
                        )}
                      </span>
                      <span className="feedback-agent-metric">
                        <small>{t.totalFeedback}</small>
                        <strong>{insight.total}</strong>
                      </span>
                      <span className="feedback-agent-metric positive">
                        <small>{t.ratingUp}</small>
                        <strong>{insight.up}</strong>
                      </span>
                      <span className="feedback-agent-metric negative">
                        <small>{t.ratingDown}</small>
                        <strong>{insight.down}</strong>
                      </span>
                      <span className="feedback-agent-metric">
                        <small>{t.positiveRate}</small>
                        <strong>{insight.positiveRate}%</strong>
                      </span>
                      <span className="feedback-agent-metric reason">
                        <small>{t.feedbackTopReason}</small>
                        <strong>
                          {insight.topReasonCode
                            ? reasonLabel(insight.topReasonCode, t)
                            : "-"}
                        </strong>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="feedback-trend-panel">
            <div className="feedback-section-head">
              <div>
                <h3>{t.feedbackTrendTitle}</h3>
                <span>{trendWindowLabel}</span>
                {period === "all" && <em>{t.feedbackTrendAllHint}</em>}
              </div>
              <strong>{t.feedbackTrendTotal(summary.up, summary.down)}</strong>
            </div>
            <div
              className={
                "feedback-trend-bars" +
                (visibleTrend.length <= 7 ? " compact" : "")
              }
              role="img"
              aria-label={t.feedbackTrendAria}
            >
              {visibleTrend.map((point, index) => {
                const total = point.up + point.down;
                return (
                  <div
                    className="feedback-trend-bar"
                    key={point.date}
                    title={`${point.date}: ${t.ratingUp} ${point.up}, ${t.ratingDown} ${point.down}`}
                  >
                    <div className="feedback-trend-stack">
                      <span
                        className="up"
                        style={{ height: `${(point.up / maxTrend) * 100}%` }}
                      />
                      <span
                        className="down"
                        style={{ height: `${(point.down / maxTrend) * 100}%` }}
                      />
                    </div>
                    <small>
                      {index % 5 === 0 || index === visibleTrend.length - 1
                        ? point.label
                        : ""}
                    </small>
                    <span className="sr-only">{total}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {reasonTotal > 0 && (
            <div className="feedback-reasons">
              <div className="feedback-section-head">
                <h3>{t.downReasons}</h3>
                <span>{reasonTotal}</span>
              </div>
              {Object.entries(summary.downReasons)
                .sort((a, b) => b[1] - a[1])
                .map(([code, count]) => (
                  <div className="feedback-reason-row" key={code}>
                    <div>
                      <span>{reasonLabel(code, t)}</span>
                      <strong>{count}</strong>
                    </div>
                    <div className="feedback-reason-track">
                      <span
                        style={{
                          width: `${reasonTotal ? (count / reasonTotal) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          )}

          {summary.suggestionCodes.length > 0 && (
            <div className="feedback-guidance">
              <h3>{t.improvementSuggestions}</h3>
              <ul>
                {summary.suggestionCodes.map((code) => (
                  <li key={code}>{suggestionLabel(code, t)}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {loading ? (
        <div className="feedback-loading" role="status" aria-live="polite">
          <span />
          <span />
          <span />
          <span />
          <span className="sr-only">{t.feedbackLoading}</span>
        </div>
      ) : !error && items.length === 0 ? (
        <p className="empty-documents">
          {query || agentId || rating || reasonCode
            ? t.noSearchResults
            : t.noFeedback}
        </p>
      ) : (
        <div className="feedback-list">
          {items.map((item) => (
            <article className="feedback-card feedback-record" key={item.id}>
              <div className="row">
                <div className="feedback-record-agent">
                  <strong>
                    {item.agentName || item.agentId || t.feedbackUnknownAgent}
                  </strong>
                  {item.agentId && item.agentName && (
                    <code>{item.agentId}</code>
                  )}
                </div>
                <span className={`feedback-rating ${item.rating}`}>
                  <Icon
                    name={item.rating === "up" ? "check" : "alert"}
                    size={13}
                  />
                  {item.rating === "up" ? t.ratingUp : t.ratingDown}
                </span>
              </div>
              <div
                className={
                  "feedback-record-reason" +
                  (item.reasonCode === "MISSING" ? " missing" : "")
                }
              >
                <span>{reasonLabel(item.reasonCode, t)}</span>
                {item.reasonText && <p>{item.reasonText}</p>}
              </div>
              <p className="feedback-record-question">
                <strong>{t.feedbackQuestion}</strong>
                {excerpt(item.userMessage)}
              </p>
              <details className="feedback-context">
                <summary>{t.feedbackContext}</summary>
                <p>
                  <strong>{t.feedbackAnswer}：</strong>
                  {excerpt(item.messageContent, 1200)}
                </p>
                <div className="feedback-record-meta">
                  <span>
                    {t.feedbackSession}：{item.sessionId || "-"}
                  </span>
                  <span>
                    {t.feedbackUpdatedAt}：
                    {formatDate(
                      item.updatedAt || item.ratedAt || item.createdAt,
                      language,
                    )}
                  </span>
                </div>
              </details>
              <small>
                {formatDate(
                  item.ratedAt || item.createdAt || item.updatedAt,
                  language,
                )}
              </small>
            </article>
          ))}
        </div>
      )}

      {summary && summary.total > pageSize && (
        <div className="feedback-pagination">
          <button
            type="button"
            className="secondary"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <Icon name="chevron-left" size={15} />
            {t.prevPage}
          </button>
          <span>{t.feedbackPagePosition(page, totalPages)}</span>
          <button
            type="button"
            className="secondary"
            disabled={page >= totalPages}
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
          >
            {t.nextPage}
            <Icon name="chevron-right" size={15} />
          </button>
        </div>
      )}
    </section>
  );
}
