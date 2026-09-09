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
  | "chevron-left"
  | "play"
  | "pause"
  | "copy"
  | "tag"
  | "filter"
  | "refresh"
  | "settings"
  | "dot"
  | "circle"
  | "alert"
  | "clock"
  /* Navigation */
  | "agents"
  | "knowledge"
  | "mcp"
  | "tool"
  | "sparkle"
  | "flag"
  | "star"
  | "chat"
  | "router"
  /* Resource kinds used by empty states */
  | "bot"
  | "plug"
  | "hook";

const PATHS: Record<IconName, string> = {
  more: "M6 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  check: "M4 12.5 9 17.5 20 6.5",
  warn: "M12 4 2 21h20L12 4Zm0 6v5m0 2.5v.5",
  close: "M5 5l14 14M19 5L5 19",
  info: "M12 8h.01M11 12h1v5h1",
  edit: "M4 20h4l11-11-4-4L4 16v4Zm10-13 3 3",
  trash:
    "M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12",
  search: "M11 4a7 7 0 1 0 4.95 11.95L21 21M11 4a7 7 0 0 1 7 7",
  plus: "M12 5v14M5 12h14",
  "chevron-down": "M6 9l6 6 6-6",
  "chevron-right": "M9 6l6 6-6 6",
  "chevron-left": "M15 6l-6 6 6 6",
  play: "M7 4v16l13-8L7 4Z",
  pause: "M9 4h2v16H9Zm4 0h2v16h-2Z",
  copy: "M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  tag: "M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Zm5-6h.01",
  filter: "M4 5h16l-6 8v6l-4-2v-4L4 5Z",
  refresh: "M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5",
  settings:
    "M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8ZM19.3 14.2a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.2a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-1 1.6 1.6 0 0 0-.4-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.4V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.4 1H22a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1Z",
  dot: "M12 12h.01",
  circle: "M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z",
  alert: "M12 8v4.5m0 3v.01M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z",
  clock: "M12 7.5V12l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z",
  agents: "M12 3l9 9-9 9-9-9 9-9Zm0 5-4 4 4 4 4-4-4-4Z",
  knowledge: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Zm0 16h13",
  mcp: "M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3Z",
  tool: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z",
  sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z",
  flag: "M5 3v18M5 4h12l-2.5 4L17 12H5",
  star: "m12 4 2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7L6.9 19.7l1-5.7-4.1-4 5.7-.8L12 4Z",
  chat: "M20 12a7 7 0 0 1-7 7H9l-4 3v-4.4A7 7 0 0 1 11 5h2a7 7 0 0 1 7 7Z",
  router:
    "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-12 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0-14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm3 3 6 6m0-6-6 6",
  bot: "M9 7h6a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3Zm0-3V3m6 1V3M9.5 12h.01m4.98 0h.01M6 10v3m12-3v3",
  plug: "M9 3v6m6-6v6M7 9h10v3a5 5 0 0 1-10 0V9Zm5 8v4",
  hook: "M18 6a4 4 0 0 0-4-4h-1v11a3 3 0 0 1-3 3 3 3 0 0 1-3-3v-1",
};

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 16, className, title, style }: IconProps) {
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
