import type { Language, Translations } from "../i18n/translations";
import type { KnowledgeDocument } from "../types";

/** Human readable label for a document parsing state. */
export function documentStatus(
  status: KnowledgeDocument["status"],
  labels: Translations,
): string {
  if (status === "READY") return labels.parsed;
  if (
    status === "INDEXING" ||
    status === "PARSING" ||
    status === "CHUNKING" ||
    status === "EMBEDDING" ||
    status === "STALE" ||
    status === "REBUILDING"
  )
    return labels.processing;
  if (status === "ERROR" || status === "FAILED") return labels.parseFailed;
  return labels.pending;
}
