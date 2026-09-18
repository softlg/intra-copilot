import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Dropdown } from "../components/Dropdown";
import { EmptyState } from "../components/EmptyState";
import { FieldHint } from "../components/FieldHint";
import { Icon } from "../components/Icon";
import { ResourceCardControls } from "../components/ResourceCardControls";
import { Skeleton } from "../components/Skeleton";
import { StatusBadge, type StatusKind } from "../components/StatusBadge";
import { toast } from "../components/Toast";
import type { Translations } from "../i18n/translations";
import { request } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type {
  SkillAuditLog,
  SkillDefinition,
  SkillDefinitionVersion,
  SkillTestResult,
  ToolDefinition,
} from "../types";
import "./SkillsPage.css";

type SkillLifecycleFilter = "all" | "live" | "draft" | "disabled";

type SkillEditorTab = "basic" | "activation" | "prompt" | "tools" | "release";

type SkillDraft = {
  name: string;
  description: string;
  prompt: string;
  version: string;
  activationMode: "ALWAYS" | "KEYWORD";
  keywords: string;
  priority: number;
  maxPromptChars: number;
  toolIds: string[];
};

type ConfirmRequest = {
  title: string;
  description: string;
  confirmLabel: string;
  tone: "danger" | "primary";
  run: () => Promise<void>;
};

export interface SkillsPageProps {
  t: Translations;
  skills: SkillDefinition[];
  tools: ToolDefinition[];
  loading: boolean;
  onReload: () => void;
  onShowDetails: (skill: SkillDefinition) => void;
}

function emptyDraft(): SkillDraft {
  return {
    name: "",
    description: "",
    prompt: "",
    version: "1.0.0",
    activationMode: "ALWAYS",
    keywords: "",
    priority: 100,
    maxPromptChars: 8000,
    toolIds: [],
  };
}

function draftFrom(skill?: SkillDefinition): SkillDraft {
  if (!skill) return emptyDraft();
  let keywords = "";
  try {
    const config = JSON.parse(skill.activationConfig ?? "{}");
    if (Array.isArray(config.keywords)) keywords = config.keywords.join(", ");
  } catch {
    // Invalid legacy JSON is surfaced by the backend on save.
  }
  return {
    name: skill.name,
    description: skill.description ?? "",
    prompt: skill.prompt,
    version: skill.version ?? "1.0.0",
    activationMode: skill.activationMode === "KEYWORD" ? "KEYWORD" : "ALWAYS",
    keywords,
    priority: skill.priority ?? 100,
    maxPromptChars: skill.maxPromptChars ?? 8000,
    toolIds: [...(skill.toolIds ?? [])],
  };
}

function lifecycleBadge(
  t: Translations,
  skill: SkillDefinition,
): { kind: StatusKind; label: string } {
  if (skill.enabled) return { kind: "ok", label: t.skillLive };
  if (skill.publishedVersion > 0) return { kind: "off", label: t.disabled };
  return { kind: "neutral", label: t.skillUnpublished };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Skill lifecycle management with draft, release, binding, test, and audit views. */
export function SkillsPage({
  t,
  skills,
  tools,
  loading,
  onReload,
  onShowDetails,
}: SkillsPageProps) {
  const [query, setQuery] = useState("");
  const [lifecycle, setLifecycle] = useState<SkillLifecycleFilter>("all");
  const [actionId, setActionId] = useState<string>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<SkillEditorTab>("basic");
  const [editing, setEditing] = useState<SkillDefinition>();
  const [draft, setDraft] = useState<SkillDraft>(emptyDraft);
  const [toolSearch, setToolSearch] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [versions, setVersions] = useState<SkillDefinitionVersion[]>([]);
  const [audits, setAudits] = useState<SkillAuditLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [testSkill, setTestSkill] = useState<SkillDefinition>();
  const [testMessage, setTestMessage] = useState("");
  const [testBasePrompt, setTestBasePrompt] = useState("");
  const [testResult, setTestResult] = useState<SkillTestResult>();
  const [testError, setTestError] = useState("");
  const [testing, setTesting] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest>();
  const [confirmLoading, setConfirmLoading] = useState(false);

  const visibleSkills = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return skills.filter((skill) => {
      const matchesQuery =
        !normalizedQuery ||
        skill.name.toLowerCase().includes(normalizedQuery) ||
        (skill.description ?? "").toLowerCase().includes(normalizedQuery) ||
        skill.id.toLowerCase().includes(normalizedQuery) ||
        skill.agentNames.some((name) =>
          name.toLowerCase().includes(normalizedQuery),
        ) ||
        skill.toolIds.some((id) => id.toLowerCase().includes(normalizedQuery));
      const matchesLifecycle =
        lifecycle === "all" ||
        (lifecycle === "live" && skill.enabled && skill.publishedVersion > 0) ||
        (lifecycle === "draft" && skill.status === "DRAFT") ||
        (lifecycle === "disabled" && !skill.enabled);
      return matchesQuery && matchesLifecycle;
    });
  }, [skills, query, lifecycle]);

  const counts = useMemo(
    () => ({
      live: skills.filter(
        (skill) => skill.enabled && skill.publishedVersion > 0,
      ).length,
      draft: skills.filter((skill) => skill.status === "DRAFT").length,
      disabled: skills.filter((skill) => !skill.enabled).length,
    }),
    [skills],
  );

  const filteredTools = useMemo(() => {
    const normalizedQuery = toolSearch.trim().toLowerCase();
    if (!normalizedQuery) return tools;
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(normalizedQuery) ||
        (tool.description ?? "").toLowerCase().includes(normalizedQuery) ||
        tool.id.toLowerCase().includes(normalizedQuery),
    );
  }, [tools, toolSearch]);

  useEffect(() => {
    if (!editorOpen || !editing) return;
    const id = editing.id;
    let cancelled = false;
    setHistoryLoading(true);
    Promise.all([
      request<SkillDefinitionVersion[]>(`/admin/skills/${id}/versions`),
      request<SkillAuditLog[]>(`/admin/skills/${id}/audit`),
    ])
      .then(([versionRows, auditRows]) => {
        if (cancelled) return;
        setVersions(versionRows);
        setAudits(auditRows);
      })
      .catch(() => {
        if (cancelled) return;
        setVersions([]);
        setAudits([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editorOpen, editing]);

  const openEditor = (skill?: SkillDefinition) => {
    setEditing(skill);
    setDraft(draftFrom(skill));
    setChangeNote("");
    setToolSearch("");
    setDialogError("");
    setVersions([]);
    setAudits([]);
    setEditorTab("basic");
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setEditing(undefined);
    setDialogError("");
  };

  const validateDraft = () => {
    if (draft.name.trim().length < 2) return t.resourceNameRequired;
    if (!draft.description.trim()) return t.descriptionRequired;
    if (!draft.prompt.trim()) return t.skillPromptRequired;
    if (draft.prompt.length > draft.maxPromptChars) {
      return t.skillMaxPromptCharsHint;
    }
    if (
      draft.activationMode === "KEYWORD" &&
      !draft.keywords
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean).length
    ) {
      return t.skillKeywordsHint;
    }
    return "";
  };

  /** 校验失败时自动切到出错的标签页，避免用户在其它页签里找不到错误。 */
  const tabForValidationError = (error: string): SkillEditorTab => {
    if (error === t.skillPromptRequired || error === t.skillMaxPromptCharsHint)
      return "prompt";
    if (error === t.skillKeywordsHint) return "activation";
    return "basic";
  };

  const saveSkill = async (publish: boolean) => {
    const validationError = validateDraft();
    if (validationError) {
      setDialogError(validationError);
      setEditorTab(tabForValidationError(validationError));
      return;
    }
    setSaving(true);
    setDialogError("");
    let savedSkill: SkillDefinition | undefined;
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        prompt: draft.prompt,
        version: draft.version.trim() || "1.0.0",
        activationMode: draft.activationMode,
        activationConfig:
          draft.activationMode === "KEYWORD"
            ? JSON.stringify({
                keywords: draft.keywords
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              })
            : "{}",
        priority: draft.priority,
        maxPromptChars: draft.maxPromptChars,
        toolIds: draft.toolIds,
        enabled: editing?.enabled ?? false,
        lockVersion: editing?.lockVersion ?? 0,
        changeNote: changeNote.trim(),
      };
      const saved = await request<SkillDefinition>(
        editing ? `/admin/skills/${editing.id}` : "/admin/skills",
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
      );
      savedSkill = saved;
      if (publish) {
        await request<SkillDefinition>(`/admin/skills/${saved.id}/publish`, {
          method: "POST",
          body: JSON.stringify({
            releaseNote: changeNote.trim() || undefined,
            expectedVersion: saved.lockVersion,
          }),
        });
      }
      toast.success(
        publish ? t.skillPublished(saved.name) : t.skillSaved(saved.name),
      );
      setEditorOpen(false);
      setEditing(undefined);
      onReload();
    } catch (error) {
      if (savedSkill) {
        setEditing(savedSkill);
        setDraft(draftFrom(savedSkill));
      }
      setDialogError(errorMessage(error, t.resourceSaveFailed));
    } finally {
      setSaving(false);
    }
  };

  const toggleSkill = async (skill: SkillDefinition) => {
    setActionId(skill.id);
    try {
      const updated = await request<SkillDefinition>(
        `/admin/skills/${skill.id}/enabled`,
        {
          method: "PATCH",
          body: JSON.stringify({
            enabled: !skill.enabled,
            expectedVersion: skill.lockVersion,
          }),
        },
      );
      toast.success(
        updated.enabled
          ? t.skillEnabled(updated.name)
          : t.skillDisabled(updated.name),
      );
      onReload();
    } catch (error) {
      toast.error(errorMessage(error, t.resourceActionFailed));
    } finally {
      setActionId(undefined);
    }
  };

  const publishSkill = (skill: SkillDefinition) => {
    setConfirmRequest({
      title: t.skillPublishTitle,
      description: t.skillPublishConfirm(skill.name),
      confirmLabel: t.skillPublish,
      tone: "primary",
      run: async () => {
        setActionId(skill.id);
        try {
          await request<SkillDefinition>(`/admin/skills/${skill.id}/publish`, {
            method: "POST",
            body: JSON.stringify({
              releaseNote: undefined,
              expectedVersion: skill.lockVersion,
            }),
          });
          toast.success(t.skillPublished(skill.name));
          onReload();
        } finally {
          setActionId(undefined);
        }
      },
    });
  };

  const rollbackSkill = (
    skill: SkillDefinition,
    version: SkillDefinitionVersion,
  ) => {
    setConfirmRequest({
      title: t.skillRollbackTitle,
      description: t.skillRollbackConfirm(
        skill.name,
        `v${version.version} (${version.versionLabel})`,
      ),
      confirmLabel: t.skillRollback,
      tone: "primary",
      run: async () => {
        setActionId(skill.id);
        try {
          await request<SkillDefinition>(`/admin/skills/${skill.id}/rollback`, {
            method: "POST",
            body: JSON.stringify({
              version: version.version,
              expectedVersion: skill.lockVersion,
            }),
          });
          toast.success(t.skillRolledBack(skill.name));
          setEditorOpen(false);
          setEditing(undefined);
          onReload();
        } finally {
          setActionId(undefined);
        }
      },
    });
  };

  const deleteSkill = (skill: SkillDefinition) => {
    setConfirmRequest({
      title: t.confirmDeleteTitle,
      description: t.skillDeleteConfirm(skill.name),
      confirmLabel: t.deleteResource,
      tone: "danger",
      run: async () => {
        setActionId(skill.id);
        try {
          await request(`/admin/skills/${skill.id}`, { method: "DELETE" });
          toast.success(t.skillDeleted(skill.name));
          onReload();
        } finally {
          setActionId(undefined);
        }
      },
    });
  };

  const openTest = (skill: SkillDefinition) => {
    setTestSkill(skill);
    setTestMessage("");
    setTestBasePrompt("");
    setTestResult(undefined);
    setTestError("");
  };

  const runTest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!testSkill) return;
    setTesting(true);
    setTestError("");
    try {
      setTestResult(
        await request<SkillTestResult>(`/admin/skills/${testSkill.id}/test`, {
          method: "POST",
          body: JSON.stringify({
            message: testMessage,
            baseSystemPrompt: testBasePrompt,
          }),
        }),
      );
    } catch (error) {
      setTestError(errorMessage(error, t.resourceActionFailed));
    } finally {
      setTesting(false);
    }
  };

  const runConfirm = async () => {
    if (!confirmRequest) return;
    setConfirmLoading(true);
    try {
      await confirmRequest.run();
      setConfirmRequest(undefined);
    } catch (error) {
      toast.error(errorMessage(error, t.resourceActionFailed));
    } finally {
      setConfirmLoading(false);
    }
  };

  const editorTabs: Array<{ id: SkillEditorTab; label: string }> = [
    { id: "basic", label: t.skillBasicSection },
    { id: "activation", label: t.skillActivationSection },
    { id: "prompt", label: t.skillPromptSection },
    { id: "tools", label: t.skillToolSection },
    { id: "release", label: t.skillReleaseSection },
  ];

  return (
    <section className="skills-page">
      <div className="resource-toolbar skill-toolbar">
        <div>
          <p className="muted">{t.skillsSubtitle}</p>
          <span className="skill-live-hint">{t.skillLiveHint}</span>
        </div>
        <div className="resource-toolbar-actions skill-toolbar-actions">
          <label className="skill-search">
            <Icon name="search" size={15} />
            <span className="sr-only">{t.search}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.skillSearchPlaceholder}
              type="search"
            />
          </label>
          <select
            className="resource-filter"
            value={lifecycle}
            onChange={(event) =>
              setLifecycle(event.target.value as SkillLifecycleFilter)
            }
            aria-label={t.skillStatus}
          >
            <option value="all">{t.skillFilterAll}</option>
            <option value="live">{t.skillFilterLive}</option>
            <option value="draft">{t.skillFilterDraft}</option>
            <option value="disabled">{t.skillFilterDisabled}</option>
          </select>
          <button type="button" onClick={() => openEditor()}>
            <Icon name="plus" size={15} />
            {t.newSkill}
          </button>
        </div>
      </div>

      <div className="skill-summary" aria-label={t.skillStatus}>
        <div>
          <span>{t.skillFilterLive}</span>
          <strong>{counts.live}</strong>
        </div>
        <div>
          <span>{t.skillFilterDraft}</span>
          <strong>{counts.draft}</strong>
        </div>
        <div>
          <span>{t.skillFilterDisabled}</span>
          <strong>{counts.disabled}</strong>
        </div>
      </div>

      <div className="resource-section">
        <div className="resource-section-heading">
          <h3>{t.skill}</h3>
          <span className="section-count">{skills.length}</span>
        </div>
        {loading && skills.length === 0 ? (
          <Skeleton.CardList count={4} />
        ) : skills.length === 0 ? (
          <EmptyState
            icon={<Icon name="sparkle" size={22} />}
            title={t.noResources}
            hint={t.noResourcesHint}
            action={
              <button type="button" onClick={() => openEditor()}>
                {t.newSkill}
              </button>
            }
          />
        ) : visibleSkills.length === 0 ? (
          <EmptyState
            compact
            icon={<Icon name="search" size={22} />}
            title={t.noSearchResults}
            hint={t.noSearchResultsHint}
          />
        ) : (
          <div className="grid">
            {visibleSkills.map((skill) => {
              return (
                <article
                  className={`skill-card resource-card-clickable ${
                    skill.enabled ? "is-live" : "is-disabled"
                  }`}
                  key={skill.id}
                  aria-busy={actionId === skill.id}
                >
                  <button
                    type="button"
                    className="resource-card-hit-area"
                    aria-label={`${t.viewDetails}: ${skill.name}`}
                    onClick={() => onShowDetails(skill)}
                  />
                  <div className="skill-card-header">
                    <div className="skill-card-title">
                      <strong>{skill.name}</strong>
                      {(skill.publishedVersion <= 0 ||
                        skill.status === "DRAFT") && (
                        <div className="skill-card-badges">
                          {skill.publishedVersion <= 0 && (
                            <StatusBadge kind="neutral">
                              {t.skillUnpublished}
                            </StatusBadge>
                          )}
                          {skill.status === "DRAFT" &&
                            skill.publishedVersion > 0 && (
                              <StatusBadge kind="warn">
                                {t.skillHasDraft}
                              </StatusBadge>
                            )}
                        </div>
                      )}
                    </div>
                    <ResourceCardControls
                      enabled={skill.enabled}
                      busy={actionId === skill.id}
                      enableLabel={
                        skill.publishedVersion > 0
                          ? t.enable
                          : t.skillPublishBeforeEnable
                      }
                      disableLabel={t.stop}
                      deleteLabel={t.deleteResource}
                      deleteDisabledHint={
                        skill.agentCount > 0
                          ? t.skillDeleteReferenced
                          : t.deleteDisabledEnabled
                      }
                      toggleDisabled={
                        !skill.enabled && skill.publishedVersion <= 0
                      }
                      toggleDisabledHint={t.skillPublishBeforeEnable}
                      deleteDisabled={skill.agentCount > 0}
                      onToggle={() => void toggleSkill(skill)}
                      onDelete={() => deleteSkill(skill)}
                    />
                  </div>
                  <p className="skill-card-description">
                    {skill.description || t.noDescription}
                  </p>
                  <div className="skill-card-metrics">
                    <span>
                      <Icon name="flag" size={13} />
                      {skill.publishedVersion > 0
                        ? t.skillPublishedVersion(skill.publishedVersion)
                        : t.skillUnpublished}
                    </span>
                    <span>
                      <Icon name="tool" size={13} />
                      {t.skillToolCount(skill.toolCount)}
                    </span>
                    <span>
                      <Icon name="agents" size={13} />
                      {t.skillAgentCount(skill.agentCount)}
                    </span>
                    <span>
                      <Icon name="sparkle" size={13} />
                      {t.skillTokenEstimate(skill.promptTokenEstimate)}
                    </span>
                  </div>
                  <div className="skill-card-footer">
                    <span>
                      {formatDateTime(skill.updatedAt) !== "-"
                        ? t.skillUpdatedAt(formatDateTime(skill.updatedAt))
                        : t.noDescription}
                    </span>
                    <span>{t.skillUsage(skill.invocationCount)}</span>
                  </div>
                  <div className="skill-card-actions">
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => openEditor(skill)}
                      disabled={actionId === skill.id}
                    >
                      <Icon name="edit" size={15} />
                      {t.edit}
                    </button>
                    <Dropdown
                      ariaLabel={t.skillActions}
                      trigger={
                        <Icon name="more" className="dropdown-trigger-icon" />
                      }
                      items={[
                        ...(skill.status === "DRAFT"
                          ? [
                              {
                                key: "publish",
                                label: t.skillPublishDraft,
                                onSelect: () => publishSkill(skill),
                                disabled: actionId === skill.id,
                              },
                            ]
                          : []),
                        {
                          key: "test",
                          label: t.skillTest,
                          onSelect: () => openTest(skill),
                          disabled: actionId === skill.id,
                        },
                        {
                          key: "history",
                          label: t.history,
                          onSelect: () => openEditor(skill),
                          disabled: actionId === skill.id,
                        },
                      ]}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {editorOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditor();
          }}
        >
          <div
            className="modal skill-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="skill-editor-title"
          >
            <div className="modal-header">
              <div>
                <h3 id="skill-editor-title">
                  {editing ? t.skillEditorTitleEdit : t.skillEditorTitleNew}
                  {editing ? ` · ${editing.name}` : ""}
                </h3>
                <p className="modal-subtitle">{t.skillEditorHint}</p>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={closeEditor}
                disabled={saving}
                aria-label={t.close}
              >
                <Icon name="close" size={17} />
              </button>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveSkill(false);
              }}
            >
              <div
                className="config-tabs skill-editor-tabs"
                role="tablist"
                aria-label={t.skillEditorTitleEdit}
              >
                {editorTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={editorTab === tab.id}
                    className={editorTab === tab.id ? "active" : ""}
                    onClick={() => setEditorTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="skill-editor-tab-panels" key={editorTab}>
                {editorTab === "basic" && (
                  <section className="skill-form-section">
                    <div className="skill-section-heading">
                      <h4>{t.skillBasicSection}</h4>
                      <StatusBadge
                        kind={
                          editing?.enabled
                            ? "ok"
                            : editing?.publishedVersion
                              ? "off"
                              : "neutral"
                        }
                      >
                        {editing
                          ? lifecycleBadge(t, editing).label
                          : t.skillUnpublished}
                      </StatusBadge>
                    </div>
                    <div className="field-grid">
                      <label className="field">
                        <span>
                          {t.toolName}
                          <span className="required-mark" aria-hidden="true">
                            *
                          </span>
                        </span>
                        <input
                          autoFocus
                          value={draft.name}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          maxLength={80}
                          required
                        />
                      </label>
                      <label className="field">
                        <span>{t.version}</span>
                        <input
                          value={draft.version}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              version: event.target.value,
                            }))
                          }
                          maxLength={32}
                          placeholder="1.0.0"
                        />
                      </label>
                    </div>
                    <label className="field">
                      <span>
                        {t.descriptionLabel}
                        <span className="required-mark" aria-hidden="true">
                          *
                        </span>
                      </span>
                      <textarea
                        value={draft.description}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                        maxLength={500}
                        rows={3}
                        placeholder={t.noDescription}
                      />
                      <FieldHint>{draft.description.length} / 500</FieldHint>
                    </label>
                  </section>
                )}

                {editorTab === "activation" && (
                  <section className="skill-form-section">
                    <div className="skill-section-heading">
                      <h4>{t.skillActivationSection}</h4>
                    </div>
                    <div className="field-grid">
                      <label className="field">
                        <span>{t.skillActivationMode}</span>
                        <select
                          value={draft.activationMode}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              activationMode: event.target.value as
                                "ALWAYS" | "KEYWORD",
                            }))
                          }
                        >
                          <option value="ALWAYS">
                            {t.skillActivationAlways}
                          </option>
                          <option value="KEYWORD">
                            {t.skillActivationKeyword}
                          </option>
                        </select>
                      </label>
                      <label className="field">
                        <span>{t.skillPriorityLabel}</span>
                        <input
                          type="number"
                          min={0}
                          max={10000}
                          value={draft.priority}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              priority: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                    </div>
                    {draft.activationMode === "KEYWORD" && (
                      <label className="field">
                        <span>{t.skillKeywords}</span>
                        <input
                          value={draft.keywords}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              keywords: event.target.value,
                            }))
                          }
                          placeholder={t.skillKeywordsPlaceholder}
                        />
                        <FieldHint>{t.skillKeywordsHint}</FieldHint>
                      </label>
                    )}
                    <label className="field">
                      <span>{t.skillMaxPromptChars}</span>
                      <input
                        type="number"
                        min={100}
                        max={50000}
                        value={draft.maxPromptChars}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            maxPromptChars: Number(event.target.value),
                          }))
                        }
                      />
                      <FieldHint>{t.skillMaxPromptCharsHint}</FieldHint>
                    </label>
                  </section>
                )}

                {editorTab === "prompt" && (
                  <section className="skill-form-section">
                    <div className="skill-section-heading">
                      <h4>{t.skillPromptSection}</h4>
                      <span
                        className={
                          draft.prompt.length > draft.maxPromptChars
                            ? "skill-counter is-over"
                            : "skill-counter"
                        }
                      >
                        {draft.prompt.length} / {draft.maxPromptChars}
                      </span>
                    </div>
                    <label className="field">
                      <span className="sr-only">{t.skillPrompt}</span>
                      <textarea
                        className="skill-prompt-editor"
                        value={draft.prompt}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            prompt: event.target.value,
                          }))
                        }
                        rows={12}
                        placeholder={t.skillPromptPlaceholder}
                        required
                      />
                    </label>
                  </section>
                )}

                {editorTab === "tools" && (
                  <section className="skill-form-section">
                    <div className="skill-section-heading">
                      <h4>{t.skillToolSection}</h4>
                      <span className="skill-counter">
                        {t.skillToolsSelected(
                          draft.toolIds.length,
                          tools.length,
                        )}
                      </span>
                    </div>
                    {tools.length === 0 ? (
                      <p className="binding-empty">{t.skillNoTools}</p>
                    ) : (
                      <>
                        <label className="binding-search">
                          <span className="sr-only">{t.search}</span>
                          <input
                            value={toolSearch}
                            onChange={(event) =>
                              setToolSearch(event.target.value)
                            }
                            placeholder={t.searchPlaceholder}
                            type="search"
                          />
                        </label>
                        <div className="binding-list skill-tool-list">
                          {filteredTools.map((tool) => {
                            const checked = draft.toolIds.includes(tool.id);
                            return (
                              <label className="binding-option" key={tool.id}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={!tool.enabled && !checked}
                                  onChange={() =>
                                    setDraft((current) => ({
                                      ...current,
                                      toolIds: checked
                                        ? current.toolIds.filter(
                                            (id) => id !== tool.id,
                                          )
                                        : [...current.toolIds, tool.id],
                                    }))
                                  }
                                />
                                <span className="binding-copy">
                                  <span className="binding-name">
                                    {tool.name}
                                  </span>
                                  <span className="binding-meta">
                                    {tool.type || "HTTP"}
                                    {!tool.enabled ? ` · ${t.disabled}` : ""}
                                  </span>
                                  {tool.description && (
                                    <span className="binding-description">
                                      {tool.description}
                                    </span>
                                  )}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </section>
                )}

                {editorTab === "release" && (
                  <section className="skill-form-section">
                    <div className="skill-section-heading">
                      <h4>{t.skillChangeNote}</h4>
                    </div>
                    <label className="field">
                      <span className="sr-only">{t.skillChangeNote}</span>
                      <textarea
                        value={changeNote}
                        onChange={(event) => setChangeNote(event.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder={t.skillChangeNotePlaceholder}
                      />
                    </label>
                  </section>
                )}

                {editorTab === "release" && editing && (
                  <section className="skill-form-section skill-history-section">
                    <div className="skill-history-grid">
                      <div>
                        <div className="skill-section-heading">
                          <h4>{t.skillVersionHistory}</h4>
                          {historyLoading && (
                            <Skeleton width="40px" height="14px" />
                          )}
                        </div>
                        {!historyLoading && versions.length === 0 ? (
                          <p className="binding-empty">{t.skillNoVersions}</p>
                        ) : (
                          <div className="skill-history-list">
                            {versions.map((version) => (
                              <div
                                className="skill-history-item"
                                key={version.id}
                              >
                                <div>
                                  <strong>
                                    v{version.version} · {version.versionLabel}
                                  </strong>
                                  <span>
                                    {formatDateTime(version.createdAt)}
                                    {version.createdBy
                                      ? ` · ${version.createdBy}`
                                      : ""}
                                  </span>
                                  {version.changeNote && (
                                    <p>{version.changeNote}</p>
                                  )}
                                </div>
                                {version.version !==
                                  editing.publishedVersion && (
                                  <button
                                    type="button"
                                    className="secondary"
                                    onClick={() =>
                                      rollbackSkill(editing, version)
                                    }
                                    disabled={actionId === editing.id}
                                  >
                                    {t.skillRollback}
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="skill-section-heading">
                          <h4>{t.skillAuditHistory}</h4>
                        </div>
                        {!historyLoading && audits.length === 0 ? (
                          <p className="binding-empty">{t.skillNoAudit}</p>
                        ) : (
                          <div className="skill-history-list">
                            {audits.slice(0, 12).map((audit) => (
                              <div
                                className="skill-history-item"
                                key={audit.id}
                              >
                                <div>
                                  <strong>{audit.action}</strong>
                                  <span>
                                    {formatDateTime(audit.createdAt)}
                                    {audit.actor ? ` · ${audit.actor}` : ""}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                )}
              </div>

              {dialogError && (
                <p className="error" role="alert">
                  {dialogError}
                </p>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeEditor}
                  disabled={saving}
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={saving}
                  onClick={() => void saveSkill(false)}
                >
                  {saving ? t.saving : t.skillSaveDraft}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveSkill(true)}
                >
                  {saving ? t.saving : t.skillSaveAndPublish}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {testSkill && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTestSkill(undefined);
          }}
        >
          <div
            className="modal skill-test-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="skill-test-title"
          >
            <div className="modal-header">
              <div>
                <h3 id="skill-test-title">
                  {t.skillTestTitle(testSkill.name)}
                </h3>
                <p className="modal-subtitle">{t.skillTestHint}</p>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setTestSkill(undefined)}
                aria-label={t.close}
              >
                <Icon name="close" size={17} />
              </button>
            </div>
            <form onSubmit={runTest}>
              <label className="field">
                <span>{t.skillTestMessage}</span>
                <textarea
                  autoFocus
                  value={testMessage}
                  onChange={(event) => setTestMessage(event.target.value)}
                  rows={3}
                  placeholder={t.skillTestMessagePlaceholder}
                />
              </label>
              <label className="field">
                <span>{t.skillTestBasePrompt}</span>
                <textarea
                  value={testBasePrompt}
                  onChange={(event) => setTestBasePrompt(event.target.value)}
                  rows={2}
                />
              </label>
              {testError && (
                <p className="error" role="alert">
                  {testError}
                </p>
              )}
              {testResult && (
                <div className="skill-test-result">
                  <div className="skill-test-summary">
                    <StatusBadge
                      kind={testResult.appliedSkills.length > 0 ? "ok" : "warn"}
                    >
                      {testResult.appliedSkills.length > 0
                        ? t.skillTestApplied
                        : t.skillTestNotApplied}
                    </StatusBadge>
                    <span>
                      {testResult.promptChars} ·{" "}
                      {t.skillTokenEstimate(testResult.promptTokenEstimate)}
                    </span>
                  </div>
                  {testResult.warnings.length > 0 && (
                    <div className="skill-test-warning">
                      <strong>{t.skillTestWarnings}</strong>
                      {testResult.warnings.map((warning) => (
                        <span key={warning}>{warning}</span>
                      ))}
                    </div>
                  )}
                  <div>
                    <span className="detail-label">
                      {t.skillTestSystemPrompt}
                    </span>
                    <pre>{testResult.systemPrompt}</pre>
                  </div>
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setTestSkill(undefined)}
                  disabled={testing}
                >
                  {t.close}
                </button>
                <button type="submit" disabled={testing}>
                  {testing ? t.skillTestRunning : t.skillRunTest}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmRequest)}
        title={confirmRequest?.title ?? ""}
        description={confirmRequest?.description}
        confirmLabel={confirmRequest?.confirmLabel ?? ""}
        cancelLabel={t.cancelLabel}
        tone={confirmRequest?.tone}
        loading={confirmLoading}
        onCancel={() => {
          if (!confirmLoading) setConfirmRequest(undefined);
        }}
        onConfirm={() => void runConfirm()}
      />
    </section>
  );
}
