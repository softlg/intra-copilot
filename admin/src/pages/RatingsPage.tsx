import { Icon } from "../components/Icon";
import { Sparkline } from "../components/Sparkline";
import { buildDailyFeedbackTrend } from "../lib/feedback";
import type { Language, Translations } from "../i18n/translations";
import type { AgentFeedback, FeedbackSummary } from "../types";

export interface RatingsPageProps {
  t: Translations;
  language: Language;
  feedback: AgentFeedback[];
  filteredFeedback: AgentFeedback[];
  feedbackSummary?: FeedbackSummary;
}

/** Ratings and feedback overview for every agent. */
export function RatingsPage({
  t,
  language,
  feedback,
  filteredFeedback,
  feedbackSummary,
}: RatingsPageProps) {
  return (
    <section>
      <p className="muted">{t.ratingsSubtitle}</p>
      {(() => {
        const missingReasonCount = feedback.filter(
          (item) => item.rating === "down" && !item.comment,
        ).length;
        if (missingReasonCount === 0) return null;
        return (
          <p className="feedback-summary-missing" role="status">
            <Icon name="warn" size={12} />
            {t.missingReasonCount(missingReasonCount)}
          </p>
        );
      })()}
      {feedbackSummary && (
        <div className="feedback-summary-grid">
          <div className="feedback-summary-card">
            <span>{t.totalFeedback}</span>
            <strong>{feedbackSummary.total}</strong>
          </div>
          <div className="feedback-summary-card">
            <span>{t.satisfactionRate}</span>
            <strong>{feedbackSummary.satisfactionRate}%</strong>
          </div>
          <div className="feedback-summary-card positive">
            <span>{t.ratingUp}</span>
            <strong>{feedbackSummary.up}</strong>
          </div>
          <div className="feedback-summary-card negative">
            <span>{t.ratingDown}</span>
            <strong>{feedbackSummary.down}</strong>
          </div>
        </div>
      )}
      {(() => {
        if (feedback.length === 0) return null;
        const trend = buildDailyFeedbackTrend(feedback, language);
        if (trend.total === 0) return null;
        return (
          <div className="feedback-trend" role="group">
            <Sparkline
              className="feedback-trend-chart"
              points={trend.points}
              width={180}
              height={40}
              ariaLabel={t.feedbackTrendAria}
            />
            <div className="feedback-trend-legend">
              <span>{t.feedbackTrendTitle}</span>
              <strong>{t.feedbackTrendCount(trend.total, trend.days)}</strong>
            </div>
          </div>
        );
      })()}
      {feedbackSummary && feedbackSummary.suggestions.length > 0 && (
        <div className="feedback-guidance">
          <h3>{t.improvementSuggestions}</h3>
          <ul>
            {feedbackSummary.suggestions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {feedbackSummary &&
        Object.keys(feedbackSummary.downReasons).length > 0 && (
          <div className="feedback-reasons">
            <h3>{t.downReasons}</h3>
            {Object.entries(feedbackSummary.downReasons).map(
              ([reason, count]) => (
                <div className="feedback-reason-row" key={reason}>
                  <span>{reason}</span>
                  <strong>{count}</strong>
                </div>
              ),
            )}
          </div>
        )}
      {feedback.length === 0 ? (
        <p className="empty-documents">{t.noFeedback}</p>
      ) : filteredFeedback.length === 0 ? (
        <p className="empty-documents">{t.noSearchResults}</p>
      ) : (
        <div className="feedback-list">
          {filteredFeedback.map((item) => (
            <article className="feedback-card" key={item.id}>
              <div className="row">
                <strong>{item.agentId || "-"}</strong>
                <span className={item.rating === "up" ? "ok" : "off"}>
                  {item.rating === "up" ? t.ratingUp : t.ratingDown}
                </span>
              </div>
              <code>{item.sessionId || item.messageId || ""}</code>
              {item.comment && (
                <p className="feedback-comment">{item.comment}</p>
              )}
              {(item.userMessage || item.messageContent) && (
                <details className="feedback-context">
                  <summary>{t.feedbackContext}</summary>
                  {item.userMessage && (
                    <p>
                      <strong>{t.userQuestion}：</strong>
                      {item.userMessage}
                    </p>
                  )}
                  {item.messageContent && (
                    <p>
                      <strong>{t.assistantAnswer}：</strong>
                      {item.messageContent}
                    </p>
                  )}
                </details>
              )}
              {!item.comment && item.rating === "down" && (
                <span className="feedback-missing-reason">
                  <span
                    className="feedback-missing-reason-icon"
                    aria-hidden="true"
                  >
                    !
                  </span>
                  {t.noReason}
                </span>
              )}
              {item.createdAt && (
                <small>{new Date(item.createdAt).toLocaleString()}</small>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
