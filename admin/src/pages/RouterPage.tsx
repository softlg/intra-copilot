import { AuthAttachmentImage } from "../components/AuthAttachmentImage";
import { Icon } from "../components/Icon";
import { toast } from "../components/Toast";
import type { Translations } from "../i18n/translations";
import type { ConversationAttachment } from "../types";

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item != null,
      )
    : [];
}

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
  onUploadAttachments: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onPastePageContext: () => void;
  onOpenPageContext: () => void;
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
  onPastePageContext,
  onOpenPageContext,
  route,
  analyzing,
  onAnalyze,
  analysis,
}: RouterPageProps) {
  const pasteImagesFromClipboard = async () => {
    if (!navigator.clipboard?.read) {
      toast.error(t.routerClipboardUnavailable);
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        for (const type of item.types.filter((value) =>
          value.startsWith("image/"),
        )) {
          const blob = await item.getType(type);
          const extension = type.split("/")[1]?.replace("jpeg", "jpg") || "png";
          files.push(
            new File(
              [blob],
              `pasted-image-${Date.now()}-${files.length + 1}.${extension}`,
              { type },
            ),
          );
        }
      }
      if (!files.length) {
        toast.error(t.routerClipboardImageMissing);
        return;
      }
      onUploadAttachments(files);
    } catch {
      toast.error(t.routerClipboardUnavailable);
    }
  };

  const handleImagePaste = (
    event: React.ClipboardEvent<HTMLTextAreaElement>,
  ) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file != null);
    if (!files.length) return;
    event.preventDefault();
    onUploadAttachments(files);
  };

  return (
    <section className="router-test-page">
      <div className="router-test-form">
        <textarea
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          onPaste={handleImagePaste}
          placeholder={t.routerPlaceholder}
          rows={4}
        />
        <div className="router-context-field">
          <textarea
            value={pageContext}
            onChange={(event) => onPageContextChange(event.target.value)}
            placeholder={t.routerContextPlaceholder}
            rows={3}
          />
          <div className="router-context-actions">
            <button
              type="button"
              className="secondary"
              onClick={onPastePageContext}
            >
              <Icon name="copy" size={13} /> {t.routerPasteContext}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={onOpenPageContext}
            >
              <Icon name="chevron-right" size={13} /> {t.routerOpenPage}
            </button>
          </div>
        </div>
        <div className="router-test-options">
          <button
            type="button"
            className={
              "router-upload-button" +
              (uploadingAttachments ? " uploading" : "")
            }
            disabled={uploadingAttachments}
            onClick={() => void pasteImagesFromClipboard()}
          >
            <Icon name="copy" size={14} />
            {uploadingAttachments ? t.routerUploading : t.routerPasteImages}
          </button>
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
                  <AuthAttachmentImage
                    url={attachment.url}
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
                          : type === "resources"
                            ? t.routeResources
                            : type === "planning"
                              ? t.routePlanning
                              : type === "hooks"
                                ? t.routeHooks
                                : String(step.title ?? type);
                const checks = Array.isArray(details.checks)
                  ? (details.checks as Array<Record<string, unknown>>)
                  : [];
                const imageCount = Number(details.imageCount ?? 0);
                const planningSteps = records(details.steps);
                const resourceSkills = records(details.skills);
                const resourceTools = records(details.tools);
                const mcpServers = records(details.mcpServers);
                const knowledgeBases = records(details.knowledgeBases);
                const resourceWarnings = Array.isArray(details.warnings)
                  ? details.warnings.map((warning) => String(warning))
                  : [];
                const attachmentIds = Array.isArray(details.attachmentIds)
                  ? details.attachmentIds.map((id) => String(id))
                  : [];
                return (
                  <div className="router-chain-step" key={`${type}-${index}`}>
                    <span className="router-chain-index">{index + 1}</span>
                    <div className="router-chain-content">
                      <strong>{title}</strong>
                      {type === "intent" && (
                        <>
                          <p>{String(details.intent ?? route.reason ?? "-")}</p>
                          <div className="router-chain-meta">
                            <span>
                              {t.confidence}:{" "}
                              {details.confidence == null
                                ? "-"
                                : `${Math.round(
                                    Number(details.confidence) * 100,
                                  )}%`}
                            </span>
                            <span>
                              {t.routeSource}:{" "}
                              {String(details.routeSource ?? "-")}
                            </span>
                            <span>
                              {t.routeRouteAgent}:{" "}
                              {String(details.agentId ?? "-")}
                            </span>
                            {Number(details.durationMs ?? 0) > 0 && (
                              <span>
                                {t.routeDuration}: {Number(details.durationMs)}{" "}
                                ms
                              </span>
                            )}
                          </div>
                          {Boolean(details.modelInput) && (
                            <details className="router-chain-raw">
                              <summary>{t.routeDispatchInput}</summary>
                              <pre>{String(details.modelInput)}</pre>
                            </details>
                          )}
                          {Boolean(details.modelOutput) && (
                            <details className="router-chain-raw">
                              <summary>{t.routeRawOutput}</summary>
                              <pre>{String(details.modelOutput)}</pre>
                            </details>
                          )}
                        </>
                      )}
                      {type === "dispatch" && (
                        <>
                          <p>
                            {String(
                              details.displayName ??
                                route.displayName ??
                                details.agentId ??
                                "-",
                            )}
                          </p>
                          <div className="router-chain-meta">
                            <span>
                              {t.routeRouteAgent}:{" "}
                              {String(details.routeAgentId ?? "-")}
                            </span>
                            <span>
                              {t.routeExecutionAgent}:{" "}
                              {String(details.agentId ?? "-")}
                            </span>
                            <span>
                              {t.routeDelegated}:{" "}
                              {details.delegated ? t.yes : t.no}
                            </span>
                          </div>
                        </>
                      )}
                      {type === "delegation" && (
                        <>
                          <p>
                            {String(
                              details.displayName ?? details.agentId ?? "-",
                            )}
                            {details.reason
                              ? ` · ${String(details.reason)}`
                              : ""}
                          </p>
                          <div className="router-chain-meta">
                            <span>
                              {t.routeMode}: {String(details.mode ?? "-")}
                            </span>
                            <span>
                              {t.confidence}:{" "}
                              {details.confidence == null
                                ? "-"
                                : `${Math.round(
                                    Number(details.confidence) * 100,
                                  )}%`}
                            </span>
                            {details.matchedRule ? (
                              <span>
                                {t.routeMatchedRule}:{" "}
                                {String(details.matchedRule)}
                              </span>
                            ) : null}
                          </div>
                          {records(details.candidates).length > 0 && (
                            <div className="router-resource-list">
                              <strong>{t.routeCandidates}</strong>
                              {records(details.candidates).map(
                                (candidate, candidateIndex) => (
                                  <span
                                    key={`${String(candidate.agentId)}-${candidateIndex}`}
                                  >
                                    {String(
                                      candidate.displayName ??
                                        candidate.agentId ??
                                        "-",
                                    )}
                                    {candidate.routingRule
                                      ? ` · ${String(candidate.routingRule)}`
                                      : ""}
                                  </span>
                                ),
                              )}
                            </div>
                          )}
                          {Boolean(details.modelOutput) && (
                            <details className="router-chain-raw">
                              <summary>{t.routeRawOutput}</summary>
                              <pre>{String(details.modelOutput)}</pre>
                            </details>
                          )}
                          {Boolean(details.dispatchInput) && (
                            <details className="router-chain-raw">
                              <summary>{t.routeDispatchInput}</summary>
                              <pre>{String(details.dispatchInput)}</pre>
                            </details>
                          )}
                          {Boolean(details.dispatchPrompt) && (
                            <details className="router-chain-raw">
                              <summary>{t.routeDispatchPrompt}</summary>
                              <pre>{String(details.dispatchPrompt)}</pre>
                            </details>
                          )}
                        </>
                      )}
                      {type === "input" && (
                        <>
                          <p>{String(details.message || t.routeImageOnly)}</p>
                          <div className="router-chain-meta">
                            <span>
                              {t.routerReadPage}:{" "}
                              {details.pageContextIncluded ? t.yes : t.no}
                            </span>
                            <span>
                              {t.routerImages}: {imageCount}
                            </span>
                            <span>
                              {t.routeContextLength}:{" "}
                              {Number(details.pageContextLength ?? 0)}
                            </span>
                          </div>
                          {attachmentIds.length > 0 && (
                            <div className="router-chain-meta">
                              {attachmentIds.map((id) => (
                                <span key={id}>{id}</span>
                              ))}
                            </div>
                          )}
                          {Boolean(details.pageContext) && (
                            <details className="router-chain-raw">
                              <summary>{t.routerPageContext}</summary>
                              <pre>{String(details.pageContext)}</pre>
                            </details>
                          )}
                        </>
                      )}
                      {type === "planning" && (
                        <>
                          <div className="router-chain-meta">
                            <span>
                              {t.routePlanningEnabled}:{" "}
                              {details.enabled ? t.yes : t.no}
                            </span>
                            <span>
                              {t.routePlanningTriggered}:{" "}
                              {details.triggered ? t.yes : t.no}
                            </span>
                            <span>
                              {t.routePlanningMode}:{" "}
                              {String(details.mode ?? "-")}
                            </span>
                            {details.failed ? (
                              <span className="danger">
                                {t.routePlanningFailed}
                              </span>
                            ) : null}
                            {details.repaired ? (
                              <span>{t.routePlanningRepaired}</span>
                            ) : null}
                          </div>
                          {Boolean(details.goal) && (
                            <p>
                              {t.routePlanningGoal}: {String(details.goal)}
                            </p>
                          )}
                          {Boolean(details.summary) && (
                            <p>{String(details.summary)}</p>
                          )}
                          {planningSteps.length > 0 && (
                            <ol className="router-plan-steps">
                              {planningSteps.map((planStep, planIndex) => (
                                <li key={`${planIndex}-${planStep.title}`}>
                                  <strong>{String(planStep.title)}</strong>
                                  {planStep.description
                                    ? ` · ${String(planStep.description)}`
                                    : ""}
                                  {Array.isArray(planStep.toolNames) &&
                                  planStep.toolNames.length ? (
                                    <code>
                                      {planStep.toolNames
                                        .map((item) => String(item))
                                        .join(", ")}
                                    </code>
                                  ) : null}
                                  {Array.isArray(planStep.dependsOn) &&
                                  planStep.dependsOn.length ? (
                                    <small>
                                      {t.routePlanDependsOn}:{" "}
                                      {planStep.dependsOn
                                        .map((item) => String(item))
                                        .join(", ")}
                                    </small>
                                  ) : null}
                                  {planStep.successCriteria ? (
                                    <small>
                                      {t.routePlanSuccess}:{" "}
                                      {String(planStep.successCriteria)}
                                    </small>
                                  ) : null}
                                </li>
                              ))}
                            </ol>
                          )}
                          {Boolean(details.modelOutput) && (
                            <details className="router-chain-raw">
                              <summary>{t.routeRawOutput}</summary>
                              <pre>{String(details.modelOutput)}</pre>
                            </details>
                          )}
                          {Boolean(details.plannerRequest) && (
                            <details className="router-chain-raw">
                              <summary>{t.routePlannerRequest}</summary>
                              <pre>{String(details.plannerRequest)}</pre>
                            </details>
                          )}
                        </>
                      )}
                      {type === "resources" && (
                        <>
                          <div className="router-resource-grid">
                            <div>
                              <span>{t.routeSkills}</span>
                              {resourceSkills.length ? (
                                <div className="router-resource-items">
                                  {resourceSkills.map((skill, skillIndex) => (
                                    <strong
                                      key={`${String(skill.id)}-${skillIndex}`}
                                    >
                                      {String(skill.name ?? skill.id ?? "-")}
                                      {skill.versionLabel || skill.version
                                        ? ` · v${String(
                                            skill.versionLabel ?? skill.version,
                                          )}`
                                        : ""}
                                    </strong>
                                  ))}
                                </div>
                              ) : (
                                <strong>{t.routeNone}</strong>
                              )}
                            </div>
                            <div>
                              <span>{t.routeTools}</span>
                              {resourceTools.length ? (
                                <div className="router-resource-items">
                                  {resourceTools.map((tool, toolIndex) => (
                                    <strong
                                      key={`${String(tool.id)}-${toolIndex}`}
                                    >
                                      {String(tool.name ?? tool.id ?? "-")}
                                      {tool.type
                                        ? ` · ${String(tool.type)}`
                                        : ""}
                                      {tool.mcpServerName
                                        ? ` · ${String(tool.mcpServerName)}`
                                        : ""}
                                    </strong>
                                  ))}
                                </div>
                              ) : (
                                <strong>{t.routeNone}</strong>
                              )}
                            </div>
                            <div>
                              <span>{t.routeMcpServers}</span>
                              {mcpServers.length ? (
                                <div className="router-resource-items">
                                  {mcpServers.map((server, serverIndex) => (
                                    <strong
                                      key={`${String(server.id)}-${serverIndex}`}
                                    >
                                      {String(server.name ?? server.id ?? "-")}
                                      {server.status
                                        ? ` · ${String(server.status)}`
                                        : ""}
                                    </strong>
                                  ))}
                                </div>
                              ) : (
                                <strong>{t.routeNone}</strong>
                              )}
                            </div>
                            <div>
                              <span>{t.routeKnowledgeBases}</span>
                              {knowledgeBases.length ? (
                                <div className="router-resource-items">
                                  {knowledgeBases.map((base, baseIndex) => (
                                    <strong
                                      key={`${String(base.id)}-${baseIndex}`}
                                    >
                                      {String(base.name ?? base.id ?? "-")}
                                      {base.status
                                        ? ` · ${String(base.status)}`
                                        : ""}
                                    </strong>
                                  ))}
                                </div>
                              ) : (
                                <strong>{t.routeNone}</strong>
                              )}
                            </div>
                          </div>
                          {resourceWarnings.length > 0 && (
                            <div className="router-resource-list danger">
                              <strong>{t.routeWarnings}</strong>
                              {resourceWarnings.map((warning, warningIndex) => (
                                <span key={`${warningIndex}-${warning}`}>
                                  {warning}
                                </span>
                              ))}
                            </div>
                          )}
                          {Boolean(details.effectiveSystemPrompt) && (
                            <details className="router-chain-raw">
                              <summary>{t.routeEffectivePrompt}</summary>
                              <pre>{String(details.effectiveSystemPrompt)}</pre>
                            </details>
                          )}
                        </>
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
