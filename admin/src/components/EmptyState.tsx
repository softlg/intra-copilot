import type { ReactNode } from "react";
import "./EmptyState.css";

export interface EmptyStateProps {
  /** Optional emoji or short glyph used as a soft visual anchor. */
  icon?: ReactNode;
  title: string;
  /** Optional one-line supporting text. */
  hint?: string;
  /** Optional primary action (e.g. "Create" button). */
  action?: ReactNode;
  /** Optional secondary action rendered next to action. */
  secondaryAction?: ReactNode;
  /** Smaller variant used inside cards / panels instead of full pages. */
  compact?: boolean;
}

/**
 * Reusable empty-state placeholder. Replaces the previous bare "暂无…" lines
 * scattered across resource list pages. The goal is to give the user a
 * clear next step (a button) instead of a dead-end sentence.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  secondaryAction,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={`empty-state${compact ? " empty-state-compact" : ""}`}
      role="status"
    >
      {icon !== undefined && (
        <div className="empty-state-icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="empty-state-title">{title}</p>
      {hint && <p className="empty-state-hint">{hint}</p>}
      {(action || secondaryAction) && (
        <div className="empty-state-actions">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
