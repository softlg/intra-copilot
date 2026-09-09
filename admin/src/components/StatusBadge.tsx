import { Icon, type IconName } from "./Icon";
import "./StatusBadge.css";

export type StatusKind = "ok" | "off" | "warn" | "error" | "neutral";

const ICONS: Record<StatusKind, IconName> = {
  ok: "check",
  off: "circle",
  warn: "warn",
  error: "alert",
  neutral: "dot",
};

export interface StatusBadgeProps {
  kind: StatusKind;
  children: React.ReactNode;
  title?: string;
}

export function StatusBadge({ kind, children, title }: StatusBadgeProps) {
  return (
    <span
      className={`status-badge status-badge-${kind}`}
      title={title}
      role={kind === "error" || kind === "warn" ? "status" : undefined}
    >
      <span className="status-badge-icon" aria-hidden="true">
        <Icon name={ICONS[kind]} size={12} />
      </span>
      <span className="status-badge-label">{children}</span>
    </span>
  );
}
