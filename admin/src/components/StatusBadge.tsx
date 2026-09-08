import "./StatusBadge.css";

export type StatusKind = "ok" | "off" | "warn" | "error" | "neutral";

const ICONS: Record<StatusKind, string> = {
  ok: "✓",
  off: "○",
  warn: "!",
  error: "✕",
  neutral: "·",
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
        {ICONS[kind]}
      </span>
      <span className="status-badge-label">{children}</span>
    </span>
  );
}
