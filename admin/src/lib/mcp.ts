import type { Translations } from "../i18n/translations";

/** Human readable label for an MCP health status. */
export function mcpStatusLabel(t: Translations, status?: string): string {
  if (status === "HEALTHY") return t.mcpStatusHealthy;
  if (status === "DEGRADED") return t.mcpStatusDegraded;
  if (status === "UNHEALTHY") return t.mcpStatusUnhealthy;
  return t.mcpStatusUnknown;
}

/** Collapse whitespace and cut long error text to a single line. */
export function truncateError(text: string, maxLength = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= maxLength) return flat;
  return `${flat.slice(0, maxLength - 1)}…`;
}
