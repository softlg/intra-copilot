import { Icon } from "../components/Icon";
import { toast } from "../components/Toast";
import type { Translations } from "../i18n/translations";
import { API } from "../lib/api";
import type { ConversationAttachment } from "../types";

export interface RouterPageProps {
  t: Translations;
  message: string;
  onMessageChange: (value: string) => void;
  pageContext: string;
  onPageContextChange: (value: string) => void;
  onTestRoute: () => void;
  attachments: ConversationAttachment[];
  uploadingAttachments: boolean;
  readPage: boolean;
  onReadPageChange: (value: boolean) => void;
  onUploadAttachments: (
    files: FileList | null,
    input: HTMLInputElement,
  ) => void;
  onRemoveAttachment: (id: string) => void;
  route?: Record<string, unknown>;
  analyzing: boolean;
  onAnalyze: () => void;
  analysis: string;
}

/** Router playground: send the same inputs as the side panel and inspect dispatch. */
export function RouterPage({
  t,
  message,
  onMessageChange,
  pageContext,
  onPageContextChange,
  onTestRoute,
  attachments,
  uploadingAttachments,
  readPage,
  onReadPageChange,
  onUploadAttachments,
  onRemoveAttachment,
  route,
  analyzing,
  onAnalyze,
  analysis,
}: RouterPageProps) {
  return (
    <section className="router-test-page">
      <div className="router-test-form">
        <textarea
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          placeholder={t.routerPlaceholder}
          rows={4}
        />
        <textarea
          value={pageContext}
          onChange={(event) => onPageContextChange(event.target.value)}
          placeholder={t.routerContextPlaceholder}
          rows={3}
        />
        <div className="router-test-options">
          <label
            className={
              "router-upload-button" +
              (uploadingAttachments ? " uploading" : "")
            }
            aria-disabled={uploadingAttachments}
          >
            <Icon name="plus" size={14} />
            {uploadingAttachments ? t.routerUploading : t.routerAddImages}
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploadingAttachments}
              onChange={(event) =>
                onUploadAttachments(event.target.files, event.target)
              }
            />
          </label>
          <label className="checkbox-field router-read-page">
            <input
              type="checkbox"
              checked={readPage}
              onChange={(event) => onReadPageChange(event.target.checked)}
            />
            <span>{t.routerReadPage}</span>
          </label>
        </div>
        {attachments.length > 0 && (
          <div className="router-attachments" aria-label={t.routerImages}>
            {attachments.map((attachment) => (
              <div className="router-attachment" key={attachment.id}>
                {attachment.isImage ? (
                  <img
                    src={`${API}${attachment.url}`}
                    alt={attachment.filename}
                  />
                ) : (
                  <span className="router-attachment-kind">
                    {t.routerImages}
                  </span>
                )}
                <span title={attachment.filename}>{attachment.filename}</span>
                <button
                  type="button"
                  className="router-attachment-remove"
                  onClick={() => onRemoveAttachment(attachment.id)}
                  aria-label={`${t.routerRemoveImage}: ${attachment.filename}`}
                  title={t.routerRemoveImage}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="router-test-actions">
          <button
            type="button"
            onClick={onTestRoute}
            disabled={!message.trim() && attachments.length === 0}
          >
            {t.testRoute}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={onAnalyze}
            disabled={!route || analyzing}
          >
            {analyzing ? t.analyzing : t.smartAnalyze}
          </button>
        </div>
      </div>
      {!route ? (
        <p className="empty-documents">{t.routeChainEmpty}</p>
      ) : (
        <>
          <div className="router-result-summary">
            <div>
              <span>{t.route}</span>
              <strong>
                {String(route.displayName ?? route.agentId ?? "-")}
              </strong>
            </div>
            <div>
              <span>{t.confidence}</span>
              <strong>
                {route.confidence == null
                  ? "-"
                  : `${Math.round(Number(route.confidence) * 100)}%`}
              </strong>
            </div>
            <div>
              <span>{t.routeSource}</span>
              <strong>{String(route.routeSource ?? "-")}</strong>
            </div>
            <button
              type="button"
              className="router-copy"
              onClick={() => {
                try {
                  const json = JSON.stringify(route, null, 2);
                  const done = navigator.clipboard?.writeText(json);
                  if (
                    done &&
                    typeof (done as Promise<void>).then === "function"
                  ) {
                    (done as Promise<void>).then(() =>
                      toast.success(t.routeCopied),
                    );
                  } else {
                    toast.success(t.routeCopied);
                  }
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : t.copyFailed,
                  );
                }
              }}
              aria-label={t.routeCopy}
              title={t.routeCopy}
            >
              <Icon name="copy" size={13} /> {t.routeCopy}
            </button>
          </div>
          <section className="router-chain-panel">
            <h3>{t.routeChain}</h3>
            <div className="router-chain">
              {(
                (route.steps as Array<Record<string, unknown>> | undefined) ??
                []
              ).map((step, index) => {
                const details =
                  (step.details as Record<string, unknown> | undefined) ?? {};
                const type = String(step.type ?? "");
                const title =
                  type === "input"
                    ? t.routeInput
                    : type === "intent"
                      ? t.routeIntent
                      : type === "dispatch"
                        ? t.routeDispatch
                        : type === "delegation"
                          ? t.routeDelegation
                          : type === "hooks"
                            ? t.routeHooks
                            : String(step.title ?? type);
                const checks = Array.isArray(details.checks)
                  ? (details.checks as Array<Record<string, unknown>>)
                  : [];
                const imageCount = Number(details.imageCount ?? 0);
                return (
                  <div className="router-chain-step" key={`${type}-${index}`}>
                    <span className="router-chain-index">{index + 1}</span>
                    <div className="router-chain-content">
                      <strong>{title}</strong>
                      {type === "intent" && (
                        <p>{String(details.intent ?? route.reason ?? "-")}</p>
                      )}
                      {type === "dispatch" && (
                        <p>
                          {String(
                            details.displayName ??
                              route.displayName ??
                              details.agentId ??
                              "-",
                          )}
                        </p>
                      )}
                      {type === "delegation" && (
                        <p>
                          {String(
                            details.displayName ?? details.agentId ?? "-",
                          )}
                          {details.reason ? ` · ${String(details.reason)}` : ""}
                        </p>
                      )}
                      {type === "input" && (
                        <p>
                          {details.pageContextIncluded
                            ? "✓ 页面上下文"
                            : "— 无页面上下文"}
                          {imageCount > 0
                            ? ` · ${t.routerImages}: ${imageCount}`
                            : ""}
                        </p>
                      )}
                      {type === "hooks" &&
                        (checks.length === 0 ? (
                          <p>{t.hookPassed}</p>
                        ) : (
                          <div className="router-hook-checks">
                            {checks.map((check) => (
                              <span
                                className={check.passed ? "ok" : "off"}
                                key={String(check.hookId)}
                              >
                                {String(check.hookName)} ·{" "}
                                {check.passed ? t.hookPassed : t.hookRejected}
                              </span>
                            ))}
                          </div>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          {analysis && (
            <section className="router-analysis">
              <h3>{t.routeAnalysis}</h3>
              <p>{analysis}</p>
            </section>
          )}
        </>
      )}
    </section>
  );
}
