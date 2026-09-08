import { type CSSProperties } from "react";

export type IconName =
  | "more"
  | "check"
  | "warn"
  | "close"
  | "info"
  | "edit"
  | "trash"
  | "search"
  | "plus"
  | "chevron-down"
  | "chevron-right"
  | "play"
  | "pause"
  | "copy"
  | "tag"
  | "filter";

const PATHS: Record<IconName, string> = {
  more: "M6 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  check: "M4 12.5 9 17.5 20 6.5",
  warn: "M12 4 2 21h20L12 4Zm0 6v5m0 2.5v.5",
  close: "M5 5l14 14M19 5L5 19",
  info: "M12 8h.01M11 12h1v5h1",
  edit: "M4 20h4l11-11-4-4L4 16v4Zm10-13 3 3",
  trash: "M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12",
  search: "M11 4a7 7 0 1 0 4.95 11.95L21 21M11 4a7 7 0 0 1 7 7",
  plus: "M12 5v14M5 12h14",
  "chevron-down": "M6 9l6 6 6-6",
  "chevron-right": "M9 6l6 6-6 6",
  play: "M7 4v16l13-8L7 4Z",
  pause: "M9 4h2v16H9Zm4 0h2v16h-2Z",
  copy: "M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  tag: "M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Zm5-6h.01",
  filter: "M4 5h16l-6 8v6l-4-2v-4L4 5Z",
};

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
  style?: CSSProperties;
}

export function Icon({
  name,
  size = 16,
  className,
  title,
  style,
}: IconProps) {
  const isDecorative = !title;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={isDecorative ? "presentation" : "img"}
      aria-hidden={isDecorative ? "true" : undefined}
      aria-label={title}
      style={style}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}