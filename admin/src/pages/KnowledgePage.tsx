import { Icon } from "../components/Icon";
import { Skeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { InlineEditable } from "../components/InlineEditable";
import { ResourceCardControls } from "../components/ResourceCardControls";
import { formatDateTime } from "../lib/format";
import { documentStatus } from "../lib/knowledge";
import { useEffect, useState } from "react";
import type { FormEventHandler } from "react";
import type { Language, Translations } from "../i18n/translations";
import type {
  Base,
  KnowledgeDocument,
  QASceneSettings,
  EmbeddingConfig,
  EmbeddingConfigRequest,
  EmbeddingProfile,
  EmbeddingValidation,
  KnowledgeDiagnostics,
  RetrievalResult,
  ResourceStatus,
} from "../types";

export type KnowledgeSection = "basic" | "maintenance" | "qa" | "retrieval";

export interface KnowledgePageProps {
  t: Translations;
  language: Language;
  bases: Base[];
  filteredBases: Base[];
  basesLoading: boolean;
  status: ResourceStatus;
  onStatusChange: (status: ResourceStatus) => void;
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
  uploadDocuments: (
    baseId: string,
    files: FileList | null,
    input: HTMLInputElement,
  ) => void;
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
  saveEmbeddingConfig: (config: EmbeddingConfigRequest) => void;
  validateEmbeddingConfig: () => void;
  knowledgeDiagnostics: KnowledgeDiagnostics | undefined;
  runKnowledgeDiagnostics: () => void;
}

function formatFileSize(sizeBytes?: number) {
  if (!sizeBytes || sizeBytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = sizeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
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
  status,
  onStatusChange,
}: KnowledgePageProps) {
  const [baseQuery, setBaseQuery] = useState("");
  const [documentQuery, setDocumentQuery] = useState("");
  const [useSystemModel, setUseSystemModel] = useState<boolean>(
    activeBase?.useSystemEmbedding ?? true,
  );
  const [customProvider, setCustomProvider] = useState<string>(
    activeBase?.embeddingProvider ?? "",
  );
  const [customBaseUrl, setCustomBaseUrl] = useState<string>(
    activeBase?.embeddingBaseUrl ?? "",
  );
  const [customModel, setCustomModel] = useState<string>(
    activeBase?.embeddingModel ?? "",
  );
  const [customApiKey, setCustomApiKey] = useState("");
  const [customDimension, setCustomDimension] = useState<string>(
    activeBase?.embeddingDimension != null
      ? String(activeBase.embeddingDimension)
      : "",
  );

  // Reset the embedding config draft whenever a different knowledge base is opened.
  useEffect(() => {
    setDocumentQuery("");
    if (!activeBase) return;
    setUseSystemModel(activeBase.useSystemEmbedding ?? true);
    setCustomProvider(activeBase.embeddingProvider ?? "");
    setCustomBaseUrl(activeBase.embeddingBaseUrl ?? "");
    setCustomModel(activeBase.embeddingModel ?? "");
    setCustomApiKey("");
    setCustomDimension(
      activeBase.embeddingDimension != null
        ? String(activeBase.embeddingDimension)
        : "",
    );
  }, [activeBase?.id]);

  const customValid =
    !useSystemModel &&
    customProvider.trim() !== "" &&
    customBaseUrl.trim() !== "" &&
    customModel.trim() !== "" &&
    (customApiKey.trim() !== "" ||
      embeddingConfig?.apiKeyConfigured === true) &&
    Number(customDimension) > 0;

  const handleSaveEmbedding = () => {
    saveEmbeddingConfig({
      useSystemEmbedding: useSystemModel,
      provider: useSystemModel ? undefined : customProvider.trim() || undefined,
      baseUrl: useSystemModel ? undefined : customBaseUrl.trim() || undefined,
      model: useSystemModel ? undefined : customModel.trim() || undefined,
      apiKey: useSystemModel ? undefined : customApiKey.trim() || undefined,
      dimension: useSystemModel
        ? undefined
        : Number(customDimension) > 0
          ? Number(customDimension)
          : undefined,
    });
  };

  const normalizedBaseQuery = baseQuery.trim().toLowerCase();
  const visibleBases = filteredBases.filter(
    (base) =>
      !normalizedBaseQuery ||
      base.name.toLowerCase().includes(normalizedBaseQuery) ||
      (base.description ?? "").toLowerCase().includes(normalizedBaseQuery),
  );
  const normalizedDocumentQuery = documentQuery.trim().toLowerCase();
  const visibleDocuments = filteredDocuments.filter(
    (document) =>
      !normalizedDocumentQuery ||
      document.filename.toLowerCase().includes(normalizedDocumentQuery) ||
      (document.error ?? "").toLowerCase().includes(normalizedDocumentQuery),
  );
  const enabledBaseCount = bases.filter((base) => base.enabled).length;
  const totalDocumentCount = bases.reduce(
    (total, base) => total + (documents[base.id] ?? []).length,
    0,
  );

  return (
    <section>
      {!activeBase ? (
        <>
          <div className="resource-toolbar">
            <div>
              <p className="muted">{t.knowledgeSubtitle}</p>
            </div>
            <div className="resource-toolbar-actions">
              <label className="resource-search knowledge-base-search">
                <Icon name="search" size={15} />
                <span className="sr-only">{t.search}</span>
                <input
                  value={baseQuery}
                  onChange={(event) => setBaseQuery(event.target.value)}
                  placeholder={t.knowledgeSearchPlaceholder}
                  type="search"
                />
              </label>
              <select
                className="resource-filter"
                value={status}
                onChange={(event) =>
                  onStatusChange(event.target.value as ResourceStatus)
                }
                aria-label={t.statusFilter}
              >
                <option value="all">{t.allStatuses}</option>
                <option value="enabled">{t.enabled}</option>
                <option value="disabled">{t.disabled}</option>
              </select>
              <button onClick={addBase}>{t.newBase}</button>
            </div>
          </div>
          <div
            className="knowledge-summary"
            aria-label={t.knowledgeBaseHeading}
          >
            <div>
              <span>{t.knowledgeBaseHeading}</span>
              <strong>{bases.length}</strong>
            </div>
            <div>
              <span>{t.enabled}</span>
              <strong>{enabledBaseCount}</strong>
            </div>
            <div>
              <span>{t.knowledgeDocumentsTotal}</span>
              <strong>{totalDocumentCount}</strong>
            </div>
          </div>
          <div className="resource-section">
            <div className="resource-section-heading">
              <h3>{t.knowledgeBaseHeading}</h3>
              <span className="section-count">{visibleBases.length}</span>
            </div>
            {basesLoading && bases.length === 0 ? (
              <Skeleton.CardList count={3} />
            ) : (
              <div className="grid">
                {visibleBases.map((base) => (
                  <article
                    className="knowledge-card resource-card-clickable"
                    key={base.id}
                  >
                    <button
                      type="button"
                      className="resource-card-hit-area"
                      aria-label={`${t.edit}: ${base.name}`}
                      onClick={() => openKnowledgeBase(base)}
                    />
                    <div className="agent-card-header">
                      <div className="agent-card-title">
                        <strong>{base.name}</strong>
                        <span className={base.enabled ? "ok" : "off"}>
                          {base.enabled ? t.enabled : t.disabled}
                        </span>
                      </div>
                      <ResourceCardControls
                        enabled={base.enabled}
                        busy={baseSaving}
                        enableLabel={t.enable}
                        disableLabel={t.stop}
                        deleteLabel={t.delete}
                        deleteDisabledHint={t.deleteDisabledEnabled}
                        onToggle={() => void toggleBase(base)}
                        onDelete={() => deleteBase(base)}
                      />
                    </div>
                    <p>{base.description || t.supportedDocs}</p>
                    <div className="knowledge-card-meta">
                      <span>
                        <Icon name="knowledge" size={13} />
                        {t.documentCount((documents[base.id] ?? []).length)}
                      </span>
                    </div>
                    <div className="agent-actions">
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => openKnowledgeBase(base)}
                      >
                        <Icon name="edit" size={14} />
                        {t.edit}
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
            ) : visibleBases.length === 0 ? (
              <EmptyState
                compact
                icon={<Icon name="search" size={22} />}
                title={t.noSearchResults}
                hint={t.noSearchResultsHint}
              />
            ) : null}
          </div>
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
              <div className="knowledge-detail-meta">
                <span className={activeBase.enabled ? "ok" : "off"}>
                  {activeBase.enabled ? t.enabled : t.disabled}
                </span>
                <span>
                  <Icon name="knowledge" size={13} />
                  {t.documentCount(activeDocuments.length)}
                </span>
              </div>
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
                section === "basic" ? "detail-tab active" : "detail-tab"
              }
              onClick={() => onSectionChange("basic")}
            >
              {t.basicConfig}
            </button>
            <button
              role="tab"
              aria-selected={section === "maintenance"}
              className={
                section === "maintenance" ? "detail-tab active" : "detail-tab"
              }
              onClick={() => onSectionChange("maintenance")}
            >
              {t.maintenance}
            </button>
            <button
              role="tab"
              aria-selected={section === "qa"}
              className={section === "qa" ? "detail-tab active" : "detail-tab"}
              onClick={() => onSectionChange("qa")}
            >
              {t.qaSettings}
            </button>
            <button
              role="tab"
              aria-selected={section === "retrieval"}
              className={
                section === "retrieval" ? "detail-tab active" : "detail-tab"
              }
              onClick={() => onSectionChange("retrieval")}
            >
              {t.retrievalTest}
            </button>
          </div>
          {section === "basic" || section === "maintenance" ? (
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
                          : embeddingValidation?.reachable === true
                            ? "ok"
                            : "badge"
                      }
                    >
                      {embeddingConfig?.profile?.dimension
                        ? `${embeddingConfig.profile.dimension}D`
                        : "-"}
                    </span>
                  </div>
                  <div className="embedding-toggle-row">
                    <div>
                      <span className="embedding-toggle-label">
                        {t.useSystemModel}
                      </span>
                      <p className="field-hint">{t.useSystemModelHint}</p>
                    </div>
                    <label className="switch">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={useSystemModel}
                        disabled={embeddingSaving}
                        onChange={(event) =>
                          setUseSystemModel(event.target.checked)
                        }
                      />
                      <span className="switch-track" aria-hidden="true" />
                    </label>
                  </div>
                  {useSystemModel ? (
                    <p className="field-hint embedding-inherit-note">
                      {t.systemModelActive}：
                      <code>
                        {embeddingConfig?.profile?.provider} /{" "}
                        {embeddingConfig?.profile?.model} ·{" "}
                        {embeddingConfig?.profile?.dimension}D
                      </code>
                    </p>
                  ) : (
                    <>
                      <div className="embedding-risk-banner" role="alert">
                        <Icon name="warn" size={16} />
                        <div>
                          <strong>{t.modelSwitchRiskTitle}</strong>
                          <ul>
                            <li>{t.modelSwitchRisk1}</li>
                            <li>{t.modelSwitchRisk2}</li>
                            <li>{t.modelSwitchRisk3}</li>
                            <li>{t.modelSwitchRisk4}</li>
                          </ul>
                        </div>
                      </div>
                      <label className="field">
                        <span>{t.provider}</span>
                        <input
                          type="text"
                          value={customProvider}
                          disabled={embeddingSaving}
                          placeholder={
                            language === "zh"
                              ? "例如 openai / azure-openai"
                              : "e.g. openai / azure-openai"
                          }
                          onChange={(event) =>
                            setCustomProvider(event.target.value)
                          }
                        />
                      </label>
                      <label className="field">
                        <span>{t.baseUrl}</span>
                        <input
                          type="url"
                          value={customBaseUrl}
                          disabled={embeddingSaving}
                          placeholder="https://api.openai.com/v1"
                          autoComplete="url"
                          onChange={(event) =>
                            setCustomBaseUrl(event.target.value)
                          }
                        />
                        <small className="field-hint">{t.baseUrlHint}</small>
                      </label>
                      <label className="field">
                        <span>{t.modelName}</span>
                        <input
                          type="text"
                          value={customModel}
                          disabled={embeddingSaving}
                          placeholder={
                            language === "zh"
                              ? "例如 text-embedding-3-large"
                              : "e.g. text-embedding-3-large"
                          }
                          onChange={(event) =>
                            setCustomModel(event.target.value)
                          }
                        />
                      </label>
                      <label className="field">
                        <span>{t.apiKey}</span>
                        <input
                          type="password"
                          value={customApiKey}
                          disabled={embeddingSaving}
                          placeholder={
                            embeddingConfig?.apiKeyConfigured
                              ? "••••••••••••"
                              : "sk-..."
                          }
                          autoComplete="new-password"
                          onChange={(event) =>
                            setCustomApiKey(event.target.value)
                          }
                        />
                        <small className="field-hint">
                          {embeddingConfig?.apiKeyConfigured
                            ? t.apiKeyConfiguredHint
                            : t.apiKeyRequiredHint}
                        </small>
                      </label>
                      <label className="field">
                        <span>{t.dimension}</span>
                        <select
                          value={customDimension}
                          disabled={embeddingSaving}
                          onChange={(event) =>
                            setCustomDimension(event.target.value)
                          }
                        >
                          <option value="1024">1024</option>
                          <option value="1536">1536</option>
                          <option value="3072">3072</option>
                        </select>
                        <small className="field-hint">
                          {language === "zh"
                            ? "当前数据库仅支持 1024、1536、3072 三个向量维度。"
                            : "The database currently supports 1024, 1536, and 3072 dimensions."}
                        </small>
                      </label>
                    </>
                  )}
                  <div className="document-actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={embeddingSaving || !customValid}
                      onClick={handleSaveEmbedding}
                    >
                      {embeddingSaving ? t.savingSettings : t.saveModelConfig}
                    </button>
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
                        className={embeddingValidation.reachable ? "ok" : "off"}
                        aria-live="polite"
                      >
                        {embeddingValidation.reachable
                          ? `${language === "zh" ? "可用" : "Reachable"} · ${embeddingValidation.actualDimension}D · ${embeddingValidation.latencyMs}ms`
                          : (embeddingValidation.error ??
                            (language === "zh" ? "不可用" : "Unavailable"))}
                      </span>
                    )}
                  </div>
                  {knowledgeDiagnostics && (
                    <div aria-live="polite">
                      {knowledgeDiagnostics.issues.length ? (
                        <ul className="document-error">
                          {knowledgeDiagnostics.issues.map((issue, index) => (
                            <li key={`${issue.code}-${index}`}>
                              {issue.message}
                              {issue.recommendation
                                ? `；${issue.recommendation}`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="field-hint">
                          {language === "zh"
                            ? `诊断通过：${knowledgeDiagnostics.documentCount} 个文档`
                            : `Healthy: ${knowledgeDiagnostics.documentCount} documents`}
                        </p>
                      )}
                      <p className="field-hint">
                        {language === "zh" ? "解析统计" : "Extraction"}:{" "}
                        {knowledgeDiagnostics.pageCount ?? 0} pages ·{" "}
                        {knowledgeDiagnostics.tableCount ?? 0} tables ·{" "}
                        {knowledgeDiagnostics.imageCount ?? 0} images ·{" "}
                        {knowledgeDiagnostics.attachmentCount ?? 0} attachments
                        · {knowledgeDiagnostics.extractedChars ?? 0} chars
                      </p>
                      {knowledgeDiagnostics.extractionWarnings?.length ? (
                        <details className="field-hint">
                          <summary>
                            {language === "zh"
                              ? "解析警告"
                              : "Extraction warnings"}
                          </summary>
                          <ul>
                            {knowledgeDiagnostics.extractionWarnings.map(
                              (warning, index) => (
                                <li key={`${warning}-${index}`}>{warning}</li>
                              ),
                            )}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  )}
                </section>
              )}
              {section === "basic" && (
                <section
                  className="knowledge-config-panel retrieval-config-panel"
                  aria-labelledby="retrieval-config-title"
                >
                  <div className="knowledge-config-heading">
                    <div>
                      <h4 id="retrieval-config-title">{t.retrievalConfig}</h4>
                      <p>{t.retrievalConfigHint}</p>
                    </div>
                    <span className="badge">
                      {activeQaSettings.retrievalMode}
                    </span>
                  </div>
                  <div className="retrieval-settings-grid">
                    <div className="field">
                      <span>{t.retrievalMode}</span>
                      <div
                        className="segmented-control"
                        role="radiogroup"
                        aria-label={t.retrievalMode}
                      >
                        {(["DENSE", "HYBRID"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            role="radio"
                            aria-checked={
                              activeQaSettings.retrievalMode === mode
                            }
                            className={
                              activeQaSettings.retrievalMode === mode
                                ? "segmented-option active"
                                : "segmented-option"
                            }
                            onClick={() =>
                              updateQaSettings({ retrievalMode: mode })
                            }
                          >
                            {mode === "DENSE"
                              ? t.retrievalModeDense
                              : t.retrievalModeHybrid}
                          </button>
                        ))}
                      </div>
                      <small className="field-hint">
                        {t.retrievalModeHint}
                      </small>
                    </div>
                    <label className="field retrieval-range">
                      <span>
                        {t.similarityThreshold}
                        <code>
                          {activeQaSettings.similarityThreshold.toFixed(2)}
                        </code>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={activeQaSettings.similarityThreshold}
                        onChange={(event) =>
                          updateQaSettings({
                            similarityThreshold: Number(event.target.value),
                          })
                        }
                      />
                      <small className="field-hint">
                        {t.similarityThresholdHint}
                      </small>
                    </label>
                    <label className="field retrieval-range">
                      <span>
                        {t.lexicalWeight}
                        <code>{activeQaSettings.lexicalWeight.toFixed(2)}</code>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        disabled={activeQaSettings.retrievalMode === "DENSE"}
                        value={activeQaSettings.lexicalWeight}
                        onChange={(event) =>
                          updateQaSettings({
                            lexicalWeight: Number(event.target.value),
                          })
                        }
                      />
                      <small className="field-hint">
                        {t.lexicalWeightHint}
                      </small>
                    </label>
                  </div>
                  <label className="embedding-toggle-row retrieval-toggle-row">
                    <div>
                      <span className="embedding-toggle-label">
                        {t.retrievalFallback}
                      </span>
                      <p className="field-hint">{t.retrievalFallbackHint}</p>
                    </div>
                    <span className="switch">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={activeQaSettings.fallbackEnabled}
                        onChange={(event) =>
                          updateQaSettings({
                            fallbackEnabled: event.target.checked,
                          })
                        }
                      />
                      <span className="switch-track" aria-hidden="true" />
                    </span>
                  </label>
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
                        accept=".md,.markdown,.txt,.pdf,.docx,.xlsx,.xls,.pptx,.csv,.tsv,.html,.htm,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,text/markdown,text/plain,text/csv,text/html,application/pdf"
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
                  {activeDocuments.length > 0 && (
                    <div className="knowledge-document-toolbar">
                      <div>
                        <strong>{t.documents}</strong>
                        <span>{t.documentCount(visibleDocuments.length)}</span>
                      </div>
                      <label className="resource-search knowledge-document-search">
                        <Icon name="search" size={15} />
                        <span className="sr-only">{t.search}</span>
                        <input
                          value={documentQuery}
                          onChange={(event) =>
                            setDocumentQuery(event.target.value)
                          }
                          placeholder={t.documentSearchPlaceholder}
                          type="search"
                        />
                      </label>
                    </div>
                  )}
                  {activeDocuments.length === 0 ? (
                    <EmptyState
                      compact
                      icon={<Icon name="knowledge" size={22} />}
                      title={t.noDocuments}
                      hint={t.supportedDocs}
                    />
                  ) : visibleDocuments.length === 0 ? (
                    <EmptyState
                      compact
                      icon={<Icon name="search" size={22} />}
                      title={t.noSearchResults}
                      hint={t.noSearchResultsHint}
                    />
                  ) : (
                    <div className="document-list detail-document-list">
                      {visibleDocuments.map((document) => (
                        <div className="document-item" key={document.id}>
                          <div className="document-main">
                            <div className="document-copy">
                              <span
                                className="document-name"
                                title={document.filename}
                              >
                                {document.filename}
                              </span>
                              <div className="document-meta">
                                {document.pageCount ? (
                                  <span>
                                    {t.documentPageCount(document.pageCount)}
                                  </span>
                                ) : null}
                                {document.blockCount ? (
                                  <span>
                                    {t.documentBlockCount(document.blockCount)}
                                  </span>
                                ) : null}
                                {formatFileSize(document.sizeBytes) ? (
                                  <span>
                                    {formatFileSize(document.sizeBytes)}
                                  </span>
                                ) : null}
                                {document.updatedAt &&
                                  formatDateTime(document.updatedAt) !==
                                    "-" && (
                                    <span>
                                      {t.documentUpdatedAt(
                                        formatDateTime(document.updatedAt),
                                      )}
                                    </span>
                                  )}
                              </div>
                            </div>
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
                              type="button"
                              onClick={() => openDocumentDetails(document)}
                            >
                              <Icon name="info" size={13} />
                              {t.viewDocument}
                            </button>
                            <button
                              className="document-action"
                              type="button"
                              disabled={documentActionId === document.id}
                              onClick={() => reindexDocument(document)}
                            >
                              <Icon name="refresh" size={13} />
                              {t.reindex}
                            </button>
                            <button
                              className="document-action danger"
                              type="button"
                              disabled={documentActionId === document.id}
                              onClick={() => deleteDocument(document)}
                            >
                              <Icon name="trash" size={13} />
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
                <span className="binding-count">{activeQaSettings.topK}</span>
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
              {retrievalError && <p className="error">{retrievalError}</p>}
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
                        <div className="retrieval-result-title">
                          <strong>{result.filename}</strong>
                          {(result.pageNumber || result.sectionPath) && (
                            <span>
                              {result.pageNumber
                                ? t.documentPageNumber(result.pageNumber)
                                : ""}
                              {result.pageNumber && result.sectionPath
                                ? " · "
                                : ""}
                              {result.sectionPath}
                            </span>
                          )}
                        </div>
                        <div className="retrieval-result-scores">
                          <span>
                            {t.retrievalScore} {result.score.toFixed(3)}
                          </span>
                          <span>
                            {t.retrievalVectorScore}{" "}
                            {result.similarity.toFixed(3)}
                          </span>
                          <span>
                            {t.retrievalKeywordScore}{" "}
                            {result.lexicalScore.toFixed(3)}
                          </span>
                        </div>
                      </div>
                      <div className="retrieval-result-tags">
                        <span>{result.retrievalMode}</span>
                        {result.blockType && <span>{result.blockType}</span>}
                        {result.tokenCount ? (
                          <span>{result.tokenCount} tokens</span>
                        ) : null}
                        <span>#{result.rank}</span>
                        {result.belowThreshold && (
                          <span className="warning">
                            {t.retrievalBelowThreshold}
                          </span>
                        )}
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
