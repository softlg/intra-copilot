import { Icon } from "../components/Icon";
import { Skeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { InlineEditable } from "../components/InlineEditable";
import { TruncatedId } from "../components/TruncatedId";
import { documentStatus } from "../lib/knowledge";
import type { FormEventHandler } from "react";
import type { Language, Translations } from "../i18n/translations";
import type {
  Base,
  KnowledgeDocument,
  QASceneSettings,
  EmbeddingConfig,
  EmbeddingProfile,
  EmbeddingValidation,
  KnowledgeDiagnostics,
  RetrievalResult,
} from "../types";

export type KnowledgeSection = "basic" | "maintenance" | "qa" | "retrieval";

export interface KnowledgePageProps {
  t: Translations;
  language: Language;
  bases: Base[];
  filteredBases: Base[];
  basesLoading: boolean;
  documents: Record<string, KnowledgeDocument[]>;
  activeBase: Base | undefined;
  activeDocuments: KnowledgeDocument[];
  filteredDocuments: KnowledgeDocument[];
  activeQaSettings: QASceneSettings;
  baseSaving: boolean;
  documentActionId: string | undefined;
  section: KnowledgeSection;
  onSectionChange: (value: KnowledgeSection) => void;
  qaSaved: boolean;
  addBase: () => void;
  toggleBase: (base: Base) => void;
  deleteBase: (base: Base) => void;
  openKnowledgeBase: (base: Base) => void;
  closeKnowledgeBase: () => void;
  saveBaseField: (field: "name" | "description", value: string) => void;
  updateQaSettings: (patch: Partial<QASceneSettings>) => void;
  saveKnowledgeSettings: () => void;
  uploadDocuments: (baseId: string, files: FileList | null, input: HTMLInputElement) => void;
  uploadProgress: { current: number; total: number };
  uploadingBaseId: string | undefined;
  deleteDocument: (document: KnowledgeDocument) => void;
  reindexDocument: (document: KnowledgeDocument) => void;
  openDocumentDetails: (document: KnowledgeDocument) => void;
  runRetrieval: FormEventHandler<HTMLFormElement>;
  retrievalQuery: string;
  onRetrievalQueryChange: (value: string) => void;
  retrievalResults: RetrievalResult[];
  retrievalLoading: boolean;
  retrievalError: string | null;
  embeddingConfig: EmbeddingConfig | undefined;
  embeddingProfiles: EmbeddingProfile[];
  embeddingValidation: EmbeddingValidation | undefined;
  embeddingSaving: boolean;
  saveEmbeddingConfig: (profileId: string) => void;
  validateEmbeddingConfig: () => void;
  knowledgeDiagnostics: KnowledgeDiagnostics | undefined;
  runKnowledgeDiagnostics: () => void;
}

/** Knowledge base registry with per-base detail, maintenance, QA and retrieval panels. */
export function KnowledgePage({
  t,
  language,
  bases,
  filteredBases,
  basesLoading,
  documents,
  activeBase,
  activeDocuments,
  filteredDocuments,
  activeQaSettings,
  baseSaving,
  documentActionId,
  section,
  onSectionChange,
  qaSaved,
  addBase,
  toggleBase,
  deleteBase,
  openKnowledgeBase,
  closeKnowledgeBase,
  saveBaseField,
  updateQaSettings,
  saveKnowledgeSettings,
  uploadDocuments,
  uploadProgress,
  uploadingBaseId,
  deleteDocument,
  reindexDocument,
  openDocumentDetails,
  runRetrieval,
  retrievalQuery,
  onRetrievalQueryChange,
  retrievalResults,
  retrievalLoading,
  retrievalError,
  embeddingConfig,
  embeddingProfiles,
  embeddingValidation,
  embeddingSaving,
  saveEmbeddingConfig,
  validateEmbeddingConfig,
  knowledgeDiagnostics,
  runKnowledgeDiagnostics,
}: KnowledgePageProps) {
  return (
    <section>
      {!activeBase ? (
        <>
          <button onClick={addBase}>{t.newBase}</button>
          {basesLoading && bases.length === 0 ? (
            <Skeleton.CardList count={3} />
          ) : (
            <div className="grid">
              {filteredBases.map((base) => (
                <article
                  className="knowledge-card knowledge-card-clickable"
                  key={base.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openKnowledgeBase(base)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openKnowledgeBase(base);
                    }
                  }}
                >
                  <div className="row">
                    <strong>{base.name}</strong>
                    <span className={base.enabled ? "ok" : "off"}>
                      {base.enabled ? t.enabled : t.disabled}
                    </span>
                  </div>
                  <p>{base.description || t.supportedDocs}</p>
                  <TruncatedId
                    value={base.id}
                    label="Knowledge base ID"
                  />
                  <div className="knowledge-card-footer">
                    <span className="upload-hint">
                      {t.documentCount((documents[base.id] ?? []).length)}
                    </span>
                    <button
                      className="enter-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openKnowledgeBase(base);
                      }}
                    >
                      {t.enter}
                    </button>
                    <button
                      className="secondary"
                      onClick={(event) => {
                        event.stopPropagation();
                        void toggleBase(base);
                      }}
                    >
                      {base.enabled ? t.stop : t.enable}
                    </button>
                    <button
                      className="danger-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteBase(base);
                      }}
                    >
                      {t.delete}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {bases.length === 0 ? (
            <EmptyState
              icon={<Icon name="knowledge" size={22} />}
              title={t.noKnowledgeBases}
              hint={t.noKnowledgeBasesHint}
              action={<button onClick={addBase}>{t.newBase}</button>}
            />
          ) : filteredBases.length === 0 ? (
            <EmptyState
              compact
              icon={<Icon name="search" size={22} />}
              title={t.noSearchResults}
              hint={t.noSearchResultsHint}
            />
          ) : null}
        </>
      ) : (
        <div className="knowledge-detail">
          <div className="detail-header">
            <button
              className="secondary back-button"
              onClick={closeKnowledgeBase}
            >
              ← {t.back}
            </button>
            <div className="knowledge-detail-title">
              <InlineEditable
                value={activeBase.name}
                onSave={(next) => {
                  saveBaseField("name", next);
                  return next;
                }}
                placeholder={t.baseNameEmptyHint}
                maxLength={160}
                required
                variant="title"
                ariaLabel={t.baseName}
                editHint={t.baseEditNameHint}
                wrap
              />
              <InlineEditable
                value={activeBase.description ?? ""}
                onSave={(next) => {
                  saveBaseField("description", next);
                  return next;
                }}
                placeholder={t.baseDescriptionPlaceholder}
                maxLength={500}
                multiline
                variant="body"
                ariaLabel={t.baseDescription}
                editHint={t.baseEditDescriptionHint}
                wrap
              />
            </div>
            <button
              type="button"
              className="qa-header-save"
              onClick={saveKnowledgeSettings}
              disabled={baseSaving}
            >
              {baseSaving ? (
                t.savingSettings
              ) : qaSaved ? (
                <>
                  <Icon name="check" size={12} /> {t.saved}
                </>
              ) : (
                t.saveSettings
              )}
            </button>
          </div>
          <div className="detail-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={section === "basic"}
              className={
                section === "basic"
                  ? "detail-tab active"
                  : "detail-tab"
              }
              onClick={() => onSectionChange("basic")}
            >
              {t.basicConfig}
            </button>
            <button
              role="tab"
              aria-selected={section === "maintenance"}
              className={
                section === "maintenance"
                  ? "detail-tab active"
                  : "detail-tab"
              }
              onClick={() => onSectionChange("maintenance")}
            >
              {t.maintenance}
            </button>
            <button
              role="tab"
              aria-selected={section === "qa"}
              className={
                section === "qa"
                  ? "detail-tab active"
                  : "detail-tab"
              }
              onClick={() => onSectionChange("qa")}
            >
              {t.qaSettings}
            </button>
            <button
              role="tab"
              aria-selected={section === "retrieval"}
              className={
                section === "retrieval"
                  ? "detail-tab active"
                  : "detail-tab"
              }
              onClick={() => onSectionChange("retrieval")}
            >
              {t.retrievalTest}
            </button>
          </div>
          {section === "basic" ||
          section === "maintenance" ? (
            <div className="maintenance-panel">
              {section === "basic" && (
                <section
                  className="knowledge-config-panel"
                  aria-labelledby="embedding-config-title"
                >
                  <div className="knowledge-config-heading">
                    <div>
                      <h4 id="embedding-config-title">
                        {language === "zh"
                          ? "Embedding 配置"
                          : "Embedding configuration"}
                      </h4>
                      <p>
                        {language === "zh"
                          ? "未单独配置时继承系统默认模型。保存前可调用服务验证实际维度。"
                          : "Inherit the system default unless overridden for this knowledge base."}
                      </p>
                    </div>
                    <span
                      className={
                        embeddingValidation?.reachable === false
                          ? "off"
                          : "ok"
                      }
                    >
                      {embeddingConfig?.profile?.dimension
                        ? `${embeddingConfig.profile.dimension}D`
                        : "-"}
                    </span>
                  </div>
                  <label className="field">
                    <span>
                      {language === "zh" ? "模型配置" : "Model profile"}
                    </span>
                    <select
                      value={activeBase.embeddingProfileId ?? ""}
                      disabled={embeddingSaving}
                      onChange={(event) =>
                        saveEmbeddingConfig(event.target.value)
                      }
                    >
                      <option value="">
                        {language === "zh"
                          ? "继承系统默认"
                          : "System default"}
                      </option>
                      {embeddingProfiles
                        .filter((profile) => profile.enabled)
                        .map((profile) => (
                          <option value={profile.id} key={profile.id}>
                            {profile.name} · {profile.model} ·{" "}
                            {profile.dimension}D
                          </option>
                        ))}
                    </select>
                  </label>
                  {embeddingConfig?.profile && (
                    <p className="field-hint">
                      {embeddingConfig.profile.provider} /{" "}
                      {embeddingConfig.profile.model} ·{" "}
                      {embeddingConfig.profile.dimension} dimensions
                    </p>
                  )}
                  <div className="document-actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={embeddingSaving}
                      onClick={validateEmbeddingConfig}
                    >
                      {language === "zh" ? "检测配置" : "Validate"}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={embeddingSaving}
                      onClick={runKnowledgeDiagnostics}
                    >
                      {language === "zh" ? "运行诊断" : "Diagnostics"}
                    </button>
                    {embeddingValidation && (
                      <span
                        className={
                          embeddingValidation.reachable ? "ok" : "off"
                        }
                        aria-live="polite"
                      >
                        {embeddingValidation.reachable
                          ? `${language === "zh" ? "可用" : "Reachable"} · ${embeddingValidation.actualDimension}D · ${embeddingValidation.latencyMs}ms`
                          : (embeddingValidation.error ??
                            (language === "zh"
                              ? "不可用"
                              : "Unavailable"))}
                      </span>
                    )}
                  </div>
                  {knowledgeDiagnostics && (
                    <p
                      className={
                        knowledgeDiagnostics.issues.length
                          ? "document-error"
                          : "field-hint"
                      }
                      aria-live="polite"
                    >
                      {knowledgeDiagnostics.issues.length
                        ? knowledgeDiagnostics.issues.join(" · ")
                        : language === "zh"
                          ? `诊断通过：${knowledgeDiagnostics.documentCount} 个文档`
                          : `Healthy: ${knowledgeDiagnostics.documentCount} documents`}
                    </p>
                  )}
                </section>
              )}
              {section === "maintenance" && (
                <>
                  <div className="upload-panel">
                    <div>
                      <h4>{t.maintenance}</h4>
                      <p>{t.supportedDocs}</p>
                    </div>
                    <label className="upload-button">
                      {uploadingBaseId === activeBase.id
                        ? `${t.processing} ${uploadProgress.current}/${uploadProgress.total}`
                        : t.chooseDocuments}
                      <input
                        type="file"
                        multiple
                        accept=".md,.markdown,.txt,.pdf,text/markdown,text/plain,application/pdf"
                        disabled={uploadingBaseId === activeBase.id}
                        onChange={(event) =>
                          uploadDocuments(
                            activeBase.id,
                            event.currentTarget.files,
                            event.currentTarget,
                          )
                        }
                      />
                    </label>
                  </div>
                  {activeDocuments.length === 0 ? (
                    <p className="empty-documents">{t.noDocuments}</p>
                  ) : filteredDocuments.length === 0 ? (
                    <p className="empty-documents">{t.noSearchResults}</p>
                  ) : (
                    <div className="document-list detail-document-list">
                      {filteredDocuments.map((document) => (
                        <div className="document-item" key={document.id}>
                          <div className="document-main">
                            <span
                              className="document-name"
                              title={document.filename}
                            >
                              {document.filename}
                            </span>
                            <span
                              className={`document-status ${document.status.toLowerCase()}`}
                            >
                              {documentStatus(document.status, t)}
                            </span>
                          </div>
                          {document.error && (
                            <span className="document-error">
                              {document.error}
                            </span>
                          )}
                          <div className="document-actions">
                            <button
                              className="document-action"
                              onClick={() =>
                                openDocumentDetails(document)
                              }
                            >
                              {t.viewDocument}
                            </button>
                            <button
                              className="document-action"
                              disabled={documentActionId === document.id}
                              onClick={() => reindexDocument(document)}
                            >
                              {t.reindex}
                            </button>
                            <button
                              className="document-action danger"
                              disabled={documentActionId === document.id}
                              onClick={() => deleteDocument(document)}
                            >
                              {t.delete}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : section === "qa" ? (
            <div className="qa-panel">
              <label className="field">
                <span>{t.qaPrompt}</span>
                <textarea
                  rows={7}
                  value={activeQaSettings.prompt}
                  onChange={(event) =>
                    updateQaSettings({ prompt: event.target.value })
                  }
                  placeholder={t.qaPromptPlaceholder}
                />
              </label>
              <label className="field qa-top-k">
                <span>{t.topK}</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={activeQaSettings.topK}
                  onChange={(event) =>
                    updateQaSettings({
                      topK: Math.max(
                        1,
                        Math.min(20, Number(event.target.value) || 1),
                      ),
                    })
                  }
                />
                <small className="field-hint">{t.topKHint}</small>
              </label>
            </div>
          ) : (
            <section className="knowledge-retrieval-panel">
              <div className="knowledge-retrieval-heading">
                <div>
                  <h4>{t.retrievalTest}</h4>
                  <p>{t.retrievalPlaceholder}</p>
                </div>
                <span className="binding-count">
                  {activeQaSettings.topK}
                </span>
              </div>
              <form
                className="knowledge-retrieval-form"
                onSubmit={runRetrieval}
              >
                <input
                  value={retrievalQuery}
                  onChange={(event) =>
                    onRetrievalQueryChange(event.target.value)
                  }
                  placeholder={t.retrievalPlaceholder}
                  aria-label={t.retrievalTest}
                />
                <button
                  type="submit"
                  disabled={retrievalLoading || !retrievalQuery.trim()}
                >
                  {retrievalLoading ? t.loading : t.runRetrieval}
                </button>
              </form>
              {retrievalError && (
                <p className="error">{retrievalError}</p>
              )}
              {!retrievalLoading &&
                retrievalQuery.trim() &&
                retrievalResults.length === 0 &&
                !retrievalError && (
                  <p className="binding-empty">{t.retrievalEmpty}</p>
                )}
              {retrievalResults.length > 0 && (
                <div className="retrieval-results">
                  {retrievalResults.map((result, index) => (
                    <article
                      className="retrieval-result"
                      key={`${result.documentId}-${index}`}
                    >
                      <div className="retrieval-result-meta">
                        <strong>{result.filename}</strong>
                        <span>
                          {result.pageNumber
                            ? `第 ${result.pageNumber} 页 · `
                            : ""}
                          {(1 - result.distance).toFixed(3)}
                        </span>
                      </div>
                      <p>{result.content}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </section>
  );
}
