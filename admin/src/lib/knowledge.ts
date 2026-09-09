import type { Language, Translations } from "../i18n/translations";
import type { KnowledgeDocument } from "../types";

/** Human readable label for a document parsing state. */
export function documentStatus(
  status: KnowledgeDocument["status"],
  labels: Translations,
): string {
  if (status === "READY") return labels.parsed;
  if (status === "INDEXING" || status === "PARSING") return labels.processing;
  if (status === "ERROR") return labels.parseFailed;
  return labels.pending;
}
