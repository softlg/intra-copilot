import { useState } from "react";
import { toast } from "./Toast";
import { Tooltip } from "./Tooltip";
import "./TruncatedId.css";

export interface TruncatedIdProps {
  value: string;
  /** Number of leading and trailing characters to show. Default 6. */
  head?: number;
  /** Optional label override (e.g. "Agent ID"). */
  label?: string;
}

export function TruncatedId({
  value,
  head = 6,
  label = "ID",
}: TruncatedIdProps) {
  const [copied, setCopied] = useState(false);

  if (!value) return <span className="muted">—</span>;

  const short =
    value.length > head * 2 + 3
      ? `${value.slice(0, head)}…${value.slice(-head)}`
      : value;

  const handleCopy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("已复制到剪贴板");
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("复制失败，请手动选择");
    }
  };

  return (
    <Tooltip
      placement="top"
      content={
        <span className="truncated-id-tooltip">
          <span className="truncated-id-label">{label}</span>
          <code>{value}</code>
        </span>
      }
    >
      <span className="truncated-id">
        <code className="truncated-id-short">{short}</code>
        <button
          type="button"
          className="truncated-id-copy"
          aria-label={`复制 ${label}`}
          onClick={handleCopy}
        >
          {copied ? "✓" : "⧉"}
        </button>
      </span>
    </Tooltip>
  );
}
