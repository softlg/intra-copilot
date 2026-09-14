import { Icon } from "../components/Icon";
import { Skeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { TruncatedId } from "../components/TruncatedId";
import { formatDateTime, parseIds } from "../lib/format";
import {
  useEffect,
  useState,
  type Dispatch,
  type FormEventHandler,
  type SetStateAction,
} from "react";
import type { Translations } from "../i18n/translations";
import type {
  Agent,
  AgentConfigVersion,
  Base,
  ToolDefinition,
  SkillDefinition,
  ResourceDetails,
} from "../types";

export type AgentConfigSection =
  | "basic"
  | "routing"
  | "strategy"
  | "children"
  | "knowledge"
  | "tools"
  | "skills"
  | "versions";

function parseVersionSnapshot(value?: string): Partial<Agent> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const candidate =
      "definition" in parsed &&
      parsed.definition &&
      typeof parsed.definition === "object"
        ? parsed.definition
        : parsed;
    return candidate as Partial<Agent>;
  } catch {
    return undefined;
  }
}

function formatSnapshotIds(value?: string) {
  const ids = parseIds(value);
  return ids.length > 0 ? ids.join(", ") : "-";
}

export interface AgentSettingsPageProps {
  t: Translations;
  agentId: string;
  agentDisplayName: string;
  agentRole: string;
  agentParentId: string;
  agentDescription: string;
  agentSystemPrompt: string;
  agentBrowserActions: boolean;
  agentEnabled: boolean;
  agentPriority: number;
  agentTemperature: string;
  agentModel: string;
  agentRoutingRules: string;
  agentHandlingMode: string;
  agentReturnMode: string;
  agentChildIds: string[];
  agentChildSearch: string;
  agentChildRules: Record<string, string>;
  agentKnowledgeBaseIds: string;
  agentKnowledgeSearch: string;
  bases: Base[];
  tools: ToolDefinition[];
  skills: SkillDefinition[];
  agentToolIds: string[];
  agentToolSearch: string;
  agentSkillIds: string[];
  agentSkillSearch: string;
  configuredAgent: Agent | undefined;
  configuredAgentIsSystem: boolean;
  agentSubmitting: boolean;
  agentConfigSection: AgentConfigSection;
  agentConfigDirty: boolean;
  agentVersions: AgentConfigVersion[];
  agents: Agent[];
  closeAgentConfig: () => void;
  openAgentTest: (agent: Agent) => void;
  requestAgentConfigSection: (key: AgentConfigSection) => void;
  setAgentRole: Dispatch<SetStateAction<string>>;
  setAgentParentId: Dispatch<SetStateAction<string>>;
  setAgentDisplayName: Dispatch<SetStateAction<string>>;
  setAgentDescription: Dispatch<SetStateAction<string>>;
  setAgentSystemPrompt: Dispatch<SetStateAction<string>>;
  setAgentBrowserActions: Dispatch<SetStateAction<boolean>>;
  setAgentEnabled: Dispatch<SetStateAction<boolean>>;
  setAgentPriority: Dispatch<SetStateAction<number>>;
  setAgentTemperature: Dispatch<SetStateAction<string>>;
  setAgentModel: Dispatch<SetStateAction<string>>;
  setAgentRoutingRules: Dispatch<SetStateAction<string>>;
  setAgentHandlingMode: Dispatch<SetStateAction<string>>;
  setAgentReturnMode: Dispatch<SetStateAction<string>>;
  setAgentChildIds: Dispatch<SetStateAction<string[]>>;
  setAgentChildRules: Dispatch<SetStateAction<Record<string, string>>>;
  setAgentChildSearch: Dispatch<SetStateAction<string>>;
  setAgentKnowledgeBaseIds: Dispatch<SetStateAction<string>>;
  setAgentKnowledgeSearch: Dispatch<SetStateAction<string>>;
  setAgentToolIds: Dispatch<SetStateAction<string[]>>;
  setAgentToolSearch: Dispatch<SetStateAction<string>>;
  setAgentSkillIds: Dispatch<SetStateAction<string[]>>;
  setAgentSkillSearch: Dispatch<SetStateAction<string>>;
  setResourceDetails: Dispatch<SetStateAction<ResourceDetails | undefined>>;
  saveAgent: FormEventHandler<HTMLFormElement>;
  publishAgent: () => void;
  rollbackAgent: (version: number) => void;
}

/** Per-agent configuration: identity, routing, child binding, resources and versions. */
export function AgentSettingsPage({
  t,
  agentId,
  agentDisplayName,
  agentRole,
  agentParentId,
  agentDescription,
  agentSystemPrompt,
  agentBrowserActions,
  agentEnabled,
  agentPriority,
  agentTemperature,
  agentModel,
  agentRoutingRules,
  agentHandlingMode,
  agentReturnMode,
  agentChildIds,
  agentChildSearch,
  agentChildRules,
  agentKnowledgeBaseIds,
  agentKnowledgeSearch,
  bases,
  tools,
  skills,
  agentToolIds,
  agentToolSearch,
  agentSkillIds,
  agentSkillSearch,
  configuredAgent,
  configuredAgentIsSystem,
  agentSubmitting,
  agentConfigSection,
  agentConfigDirty,
  agentVersions,
  agents,
  closeAgentConfig,
  openAgentTest,
  requestAgentConfigSection,
  setAgentRole,
  setAgentParentId,
  setAgentDisplayName,
  setAgentDescription,
  setAgentSystemPrompt,
  setAgentBrowserActions,
  setAgentEnabled,
  setAgentPriority,
  setAgentTemperature,
  setAgentModel,
  setAgentRoutingRules,
  setAgentHandlingMode,
  setAgentReturnMode,
  setAgentChildIds,
  setAgentChildRules,
  setAgentChildSearch,
  setAgentKnowledgeBaseIds,
  setAgentKnowledgeSearch,
  setAgentToolIds,
  setAgentToolSearch,
  setAgentSkillIds,
  setAgentSkillSearch,
  setResourceDetails,
  saveAgent,
  publishAgent,
  rollbackAgent,
}: AgentSettingsPageProps) {
  const [selectedVersion, setSelectedVersion] = useState<AgentConfigVersion>();

  useEffect(() => {
    if (!selectedVersion) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedVersion(undefined);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedVersion]);

  const availableChildAgents = agents.filter(
    (item) =>
      item.role === "SUB" &&
      item.enabled &&
      (!item.parentAgentId || item.parentAgentId === agentId),
  );
  const hasUnpublishedChanges = Boolean(
    configuredAgent &&
    (configuredAgent.published === false ||
      (configuredAgent.published === undefined &&
        (configuredAgent.version ?? 0) >
          (configuredAgent.publishedVersion ?? 0))),
  );
  const publicationState = agentConfigDirty
    ? "unsaved"
    : hasUnpublishedChanges
      ? "unpublished"
      : "published";
  const publicationLabel = agentConfigDirty
    ? t.unsavedPublicationChanges
    : hasUnpublishedChanges
      ? t.unpublishedChanges
      : t.publishedAndCurrent;

  return (
    <section className="agent-settings-page">
      <div className="detail-header agent-settings-header">
        <button className="back-button" onClick={closeAgentConfig}>
          {t.backToAgents}
        </button>
        <div>
          <h3>{agentDisplayName || agentId}</h3>
          <div
            className={`agent-publish-state is-${publicationState}`}
            role="status"
            aria-live="polite"
          >
            <Icon
              name={publicationState === "published" ? "check" : "alert"}
              size={14}
            />
            <span>{publicationLabel}</span>
            {configuredAgent && (
              <small>
                {t.publishedVersionValue(configuredAgent.publishedVersion ?? 0)}
              </small>
            )}
          </div>
          <p>{t.editAgentSubtitle}</p>
        </div>
        <div className="agent-settings-header-actions">
          <button
            type="button"
            className="agent-test"
            onClick={() => {
              if (configuredAgent) openAgentTest(configuredAgent);
            }}
            disabled={!agentEnabled || !configuredAgent}
          >
            {t.testAgent}
          </button>
          <button
            type="submit"
            form="agent-settings-form"
            disabled={agentSubmitting}
          >
            {agentSubmitting ? t.saving : t.saveAgent}
          </button>
        </div>
      </div>
      <div className="config-tabs">
        {(
          [
            ["basic", t.basicInfo],
            ...(agentRole === "MAIN"
              ? ([["routing", t.intentRouting]] as const)
              : []),
            ...(agentRole === "DOMAIN"
              ? ([
                  ["strategy", t.handlingMode],
                  ["children", t.childBinding],
                ] as const)
              : []),
            ["knowledge", t.knowledgeBinding],
            ["tools", t.tools],
            ["skills", t.skills],
            ["versions", t.versions],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={agentConfigSection === key ? "active" : undefined}
            onClick={() => requestAgentConfigSection(key)}
          >
            {label}
            {agentConfigSection !== key && agentConfigDirty && (
              <span
                className="config-tab-dirty"
                aria-label={t.unsavedChangesTitle}
              />
            )}
          </button>
        ))}
      </div>
      <form
        id="agent-settings-form"
        className="agent-settings-form"
        onSubmit={saveAgent}
      >
        {agentConfigSection === "basic" && (
          <div className="settings-panel">
            <label className="field">
              <span>{t.agentId}</span>
              <input value={agentId} disabled />
              <small className="field-hint">{t.agentIdHint}</small>
            </label>
            <div className="field-grid">
              <label className="field">
                <span>{t.agentRole}</span>
                <select
                  value={agentRole}
                  onChange={(event) => setAgentRole(event.target.value)}
                  disabled={configuredAgentIsSystem}
                >
                  <option value="GENERAL">{t.roleGeneral}</option>
                  <option value="DOMAIN">{t.roleDomain}</option>
                  <option value="SUB">{t.roleSub}</option>
                  {configuredAgentIsSystem && (
                    <option value="MAIN">{t.roleMain}</option>
                  )}
                </select>
              </label>
              {agentRole === "SUB" && (
                <label className="field">
                  <span>{t.parentAgent}</span>
                  <select
                    value={agentParentId}
                    onChange={(event) => setAgentParentId(event.target.value)}
                  >
                    <option value="">{t.parentAgentUnbound}</option>
                    {agents
                      .filter((item) => item.role === "DOMAIN" && item.enabled)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.displayName}
                        </option>
                      ))}
                  </select>
                  <small className="field-hint">{t.parentAgentHint}</small>
                </label>
              )}
            </div>
            <label className="field">
              <span>{t.displayName}</span>
              <input
                value={agentDisplayName}
                onChange={(event) => setAgentDisplayName(event.target.value)}
                maxLength={100}
              />
            </label>
            <label className="field">
              <span>{t.descriptionOptional}</span>
              <textarea
                value={agentDescription}
                onChange={(event) => setAgentDescription(event.target.value)}
                rows={3}
                maxLength={500}
              />
            </label>
            <label className="field">
              <span>{t.systemPrompt}</span>
              <textarea
                value={agentSystemPrompt}
                onChange={(event) => setAgentSystemPrompt(event.target.value)}
                rows={7}
                maxLength={8000}
              />
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={agentBrowserActions}
                onChange={(event) =>
                  setAgentBrowserActions(event.target.checked)
                }
              />
              <span>{t.browserActions}</span>
            </label>
            <label className="embedding-toggle-row agent-enabled-toggle">
              <div>
                <span className="embedding-toggle-label">{t.enable}</span>
                <p className="field-hint">
                  {agentEnabled ? t.enabled : t.disabled}
                </p>
              </div>
              <span className="switch">
                <input
                  type="checkbox"
                  role="switch"
                  checked={agentEnabled}
                  onChange={(event) => setAgentEnabled(event.target.checked)}
                />
                <span className="switch-track" aria-hidden="true" />
              </span>
            </label>
            <div className="field-grid">
              <label className="field">
                <span>{t.priority}</span>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={agentPriority}
                  onChange={(event) =>
                    setAgentPriority(Number(event.target.value) || 0)
                  }
                />
              </label>
              <label className="field">
                <span>{t.temperature}</span>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={agentTemperature}
                  onChange={(event) => setAgentTemperature(event.target.value)}
                />
              </label>
            </div>
            <label className="field">
              <span>{t.model}</span>
              <input
                value={agentModel}
                onChange={(event) => setAgentModel(event.target.value)}
                placeholder={t.modelPlaceholder}
              />
            </label>
          </div>
        )}
        {agentConfigSection === "routing" && agentRole === "MAIN" && (
          <div className="settings-panel routing-panel">
            <div className="binding-heading">
              <div>
                <h4>{t.intentRouting}</h4>
                <p>{t.intentRoutingHint}</p>
              </div>
              <span className="route-badge">系统 Agent</span>
            </div>
            <label className="field">
              <span>{t.routingRules}</span>
              <textarea
                value={agentRoutingRules}
                onChange={(event) => setAgentRoutingRules(event.target.value)}
                placeholder={t.routingRulesPlaceholder}
                rows={12}
                maxLength={8000}
              />
              <small className="field-hint">{t.idsHint}</small>
            </label>
            <div className="routing-priority-note">
              <strong>{t.priority}</strong>
              <input
                type="number"
                min={0}
                max={10000}
                value={agentPriority}
                onChange={(event) =>
                  setAgentPriority(Number(event.target.value) || 0)
                }
                aria-label={t.priority}
              />
              <small>{t.intentRoutingHint}</small>
            </div>
          </div>
        )}
        {agentConfigSection === "strategy" && agentRole === "DOMAIN" && (
          <div className="settings-panel">
            <div className="binding-heading">
              <div>
                <h4>{t.handlingMode}</h4>
                <p>{t.intentRoutingHint}</p>
              </div>
            </div>
            <label className="field">
              <span>{t.handlingMode}</span>
              <select
                value={agentHandlingMode}
                onChange={(event) => setAgentHandlingMode(event.target.value)}
              >
                <option value="DIRECT">{t.directMode}</option>
                <option value="DELEGATE">{t.delegateMode}</option>
                <option value="AUTO">{t.autoMode}</option>
              </select>
            </label>
            <label className="field">
              <span>{t.returnMode}</span>
              <select
                value={agentReturnMode}
                onChange={(event) => setAgentReturnMode(event.target.value)}
              >
                <option value="CHILD_DIRECT">{t.childDirectMode}</option>
                <option value="DOMAIN_SUMMARY">{t.domainSummaryMode}</option>
              </select>
            </label>
          </div>
        )}
        {agentConfigSection === "children" && agentRole === "DOMAIN" && (
          <div className="settings-panel">
            <div className="binding-heading">
              <div>
                <h4>{t.childBinding}</h4>
                <p>{t.childRoutingRuleHint}</p>
              </div>
              <span className="binding-count">{agentChildIds.length}</span>
            </div>
            <label className="binding-search">
              <span className="sr-only">{t.search}</span>
              <input
                type="search"
                value={agentChildSearch}
                onChange={(event) => setAgentChildSearch(event.target.value)}
                placeholder={t.searchPlaceholder}
              />
            </label>
            <div className="binding-list binding-list-tall">
              {availableChildAgents
                .filter((item) => {
                  const query = agentChildSearch.trim().toLowerCase();
                  return (
                    !query ||
                    [item.id, item.displayName, item.description ?? ""].some(
                      (value) => value.toLowerCase().includes(query),
                    )
                  );
                })
                .map((item) => {
                  const checked = agentChildIds.includes(item.id);
                  return (
                    <div className="child-binding" key={item.id}>
                      <label className="binding-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setAgentChildIds((current) =>
                              checked
                                ? current.filter((id) => id !== item.id)
                                : [...current, item.id],
                            );
                            if (checked)
                              setAgentChildRules((current) => {
                                const next = { ...current };
                                delete next[item.id];
                                return next;
                              });
                          }}
                        />
                        <span className="binding-copy">
                          <span className="binding-name">
                            {item.displayName}
                          </span>
                          <span className="binding-meta">{item.id}</span>
                          {item.description && (
                            <span className="binding-description">
                              {item.description}
                            </span>
                          )}
                        </span>
                      </label>
                      {checked && (
                        <label className="child-rule">
                          <span>{t.childRoutingRule}</span>
                          <input
                            value={agentChildRules[item.id] ?? ""}
                            onChange={(event) =>
                              setAgentChildRules((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                            placeholder={t.childRoutingRulePlaceholder}
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
            </div>
            {availableChildAgents.length === 0 && (
              <p className="binding-empty">{t.noChildAgents}</p>
            )}
          </div>
        )}
        {agentConfigSection === "knowledge" && (
          <div className="settings-panel">
            <div className="binding-heading">
              <div>
                <h4>{t.knowledgeBases}</h4>
                <p>{t.idsHint}</p>
              </div>
              <span className="binding-count">
                {parseIds(agentKnowledgeBaseIds).length}
              </span>
            </div>
            {bases.length === 0 ? (
              <p className="binding-empty">{t.noKnowledgeBases}</p>
            ) : (
              <>
                <label className="binding-search">
                  <span className="sr-only">{t.search}</span>
                  <input
                    value={agentKnowledgeSearch}
                    onChange={(event) =>
                      setAgentKnowledgeSearch(event.target.value)
                    }
                    placeholder={t.searchPlaceholder}
                    type="search"
                  />
                </label>
                {bases.filter((base) => {
                  const query = agentKnowledgeSearch.trim().toLowerCase();
                  if (!query) return true;
                  return [base.id, base.name, base.description ?? ""].some(
                    (value) => value.toLowerCase().includes(query),
                  );
                }).length === 0 ? (
                  <p className="binding-empty">{t.noSearchResults}</p>
                ) : (
                  <div className="binding-list">
                    {bases
                      .filter((base) => {
                        const query = agentKnowledgeSearch.trim().toLowerCase();
                        if (!query) return true;
                        return [
                          base.id,
                          base.name,
                          base.description ?? "",
                        ].some((value) => value.toLowerCase().includes(query));
                      })
                      .map((base) => {
                        const selected = parseIds(
                          agentKnowledgeBaseIds,
                        ).includes(base.id);
                        return (
                          <label className="binding-option" key={base.id}>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => {
                                const current = parseIds(agentKnowledgeBaseIds);
                                const next = selected
                                  ? current.filter((id) => id !== base.id)
                                  : [...current, base.id];
                                setAgentKnowledgeBaseIds(JSON.stringify(next));
                              }}
                            />
                            <span className="binding-copy">
                              <span className="binding-name">{base.name}</span>
                              <span className="binding-meta">
                                {base.enabled ? t.enabled : t.disabled}
                              </span>
                              {base.description && (
                                <span className="binding-description">
                                  {base.description}
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {(agentConfigSection === "tools" ||
          agentConfigSection === "skills") && (
          <div className="settings-panel">
            {agentConfigSection === "tools" && (
              <section className="binding-section">
                <div className="binding-heading">
                  <div>
                    <h4>{t.tools}</h4>
                    <p>{t.browserActions}</p>
                  </div>
                  <span className="binding-count">{agentToolIds.length}</span>
                </div>
                {tools.filter((tool) => tool.enabled).length === 0 ? (
                  <p className="binding-empty">{t.noTools}</p>
                ) : (
                  <>
                    <label className="binding-search">
                      <span className="sr-only">{t.search}</span>
                      <input
                        value={agentToolSearch}
                        onChange={(event) =>
                          setAgentToolSearch(event.target.value)
                        }
                        placeholder={t.searchPlaceholder}
                        type="search"
                      />
                    </label>
                    {tools.filter((tool) => {
                      if (!tool.enabled) return false;
                      const query = agentToolSearch.trim().toLowerCase();
                      if (!query) return true;
                      return [
                        tool.id,
                        tool.name,
                        tool.description ?? "",
                        tool.type ?? "",
                        tool.endpoint ?? "",
                      ].some((value) => value.toLowerCase().includes(query));
                    }).length === 0 ? (
                      <p className="binding-empty">{t.noSearchResults}</p>
                    ) : (
                      <div className="binding-list">
                        {tools
                          .filter((tool) => {
                            if (!tool.enabled) return false;
                            const query = agentToolSearch.trim().toLowerCase();
                            if (!query) return true;
                            return [
                              tool.id,
                              tool.name,
                              tool.description ?? "",
                              tool.type ?? "",
                              tool.endpoint ?? "",
                            ].some((value) =>
                              value.toLowerCase().includes(query),
                            );
                          })
                          .map((tool) => {
                            const checked = agentToolIds.includes(tool.id);
                            return (
                              <label className="binding-option" key={tool.id}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setAgentToolIds((current) =>
                                      checked
                                        ? current.filter((id) => id !== tool.id)
                                        : [...current, tool.id],
                                    )
                                  }
                                />
                                <span className="binding-copy">
                                  <span className="binding-name">
                                    {tool.name}
                                  </span>
                                  <span className="binding-meta">
                                    {tool.type === "BROWSER_PROPOSAL"
                                      ? t.browserProposal
                                      : tool.type}
                                  </span>
                                  {tool.description && (
                                    <span className="binding-description">
                                      {tool.description}
                                    </span>
                                  )}
                                </span>
                                <button
                                  type="button"
                                  className="binding-detail-button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setResourceDetails({
                                      kind: "tool",
                                      resource: tool,
                                    });
                                  }}
                                >
                                  {t.viewDetails}
                                </button>
                              </label>
                            );
                          })}
                      </div>
                    )}
                  </>
                )}
              </section>
            )}
            {agentConfigSection === "skills" && (
              <section className="binding-section">
                <div className="binding-heading">
                  <div>
                    <h4>{t.skills}</h4>
                    <p>{t.idsHint}</p>
                  </div>
                  <span className="binding-count">{agentSkillIds.length}</span>
                </div>
                {skills.filter((skill) => skill.enabled).length === 0 ? (
                  <p className="binding-empty">{t.noSkills}</p>
                ) : (
                  <>
                    <label className="binding-search">
                      <span className="sr-only">{t.search}</span>
                      <input
                        value={agentSkillSearch}
                        onChange={(event) =>
                          setAgentSkillSearch(event.target.value)
                        }
                        placeholder={t.searchPlaceholder}
                        type="search"
                      />
                    </label>
                    {skills.filter((skill) => {
                      if (!skill.enabled) return false;
                      const query = agentSkillSearch.trim().toLowerCase();
                      if (!query) return true;
                      return [
                        skill.id,
                        skill.name,
                        skill.description ?? "",
                        skill.prompt,
                        skill.version ?? "",
                      ].some((value) => value.toLowerCase().includes(query));
                    }).length === 0 ? (
                      <p className="binding-empty">{t.noSearchResults}</p>
                    ) : (
                      <div className="binding-list">
                        {skills
                          .filter((skill) => {
                            if (!skill.enabled) return false;
                            const query = agentSkillSearch.trim().toLowerCase();
                            if (!query) return true;
                            return [
                              skill.id,
                              skill.name,
                              skill.description ?? "",
                              skill.prompt,
                              skill.version ?? "",
                            ].some((value) =>
                              value.toLowerCase().includes(query),
                            );
                          })
                          .map((skill) => {
                            const checked = agentSkillIds.includes(skill.id);
                            return (
                              <label className="binding-option" key={skill.id}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setAgentSkillIds((current) =>
                                      checked
                                        ? current.filter(
                                            (id) => id !== skill.id,
                                          )
                                        : [...current, skill.id],
                                    )
                                  }
                                />
                                <span className="binding-copy">
                                  <span className="binding-name">
                                    {skill.name}
                                  </span>
                                  {skill.version && (
                                    <span className="binding-meta">
                                      v{skill.version}
                                    </span>
                                  )}
                                  {skill.description && (
                                    <span className="binding-description">
                                      {skill.description}
                                    </span>
                                  )}
                                </span>
                                <button
                                  type="button"
                                  className="binding-detail-button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setResourceDetails({
                                      kind: "skill",
                                      resource: skill,
                                    });
                                  }}
                                >
                                  {t.viewDetails}
                                </button>
                              </label>
                            );
                          })}
                      </div>
                    )}
                  </>
                )}
              </section>
            )}
          </div>
        )}
        {agentConfigSection === "versions" && (
          <div className="settings-panel">
            <div className="binding-heading">
              <div>
                <h4>{t.versions}</h4>
                <p>
                  {t.publishedVersion}: {configuredAgent?.publishedVersion ?? 0}
                </p>
              </div>
              <button
                type="button"
                onClick={publishAgent}
                disabled={
                  agentSubmitting || agentConfigDirty || !hasUnpublishedChanges
                }
                title={
                  agentConfigDirty
                    ? t.saveBeforePublish
                    : !hasUnpublishedChanges
                      ? t.publishedAndCurrent
                      : undefined
                }
              >
                {agentSubmitting
                  ? t.publishing
                  : hasUnpublishedChanges
                    ? t.publish
                    : t.published}
              </button>
            </div>
            <p
              className={`publish-guidance ${
                agentConfigDirty || hasUnpublishedChanges
                  ? "is-warning"
                  : "is-success"
              }`}
            >
              <Icon
                name={
                  agentConfigDirty || hasUnpublishedChanges ? "alert" : "check"
                }
                size={14}
              />
              <span>
                {agentConfigDirty
                  ? t.saveBeforePublish
                  : hasUnpublishedChanges
                    ? t.unpublishedChanges
                    : t.publishedAndCurrent}
              </span>
            </p>
            {agentVersions.length === 0 ? (
              <p className="binding-empty">{t.draft}</p>
            ) : (
              <div className="version-list">
                {agentVersions.map((version) => (
                  <div className="version-row" key={version.id}>
                    <div className="version-row-content">
                      <strong>v{version.version}</strong>
                      <span className="binding-meta">
                        {version.status === "PUBLISHED" ? t.published : t.draft}
                      </span>
                      {version.releaseNote && <p>{version.releaseNote}</p>}
                    </div>
                    <div className="version-row-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setSelectedVersion(version)}
                        aria-label={`${t.detail} v${version.version}`}
                      >
                        {t.detail}
                      </button>
                      {version.status !== "PUBLISHED" && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => rollbackAgent(version.version)}
                          disabled={agentSubmitting || agentConfigDirty}
                          title={
                            agentConfigDirty ? t.saveBeforePublish : undefined
                          }
                        >
                          {t.rollback}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {selectedVersion && (
          <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget)
                setSelectedVersion(undefined);
            }}
          >
            <VersionDetailsDialog
              t={t}
              version={selectedVersion}
              onClose={() => setSelectedVersion(undefined)}
            />
          </div>
        )}
      </form>
    </section>
  );
}

function VersionDetailsDialog({
  t,
  version,
  onClose,
}: {
  t: Translations;
  version: AgentConfigVersion;
  onClose: () => void;
}) {
  const snapshot = parseVersionSnapshot(version.snapshot);

  return (
    <div
      className="modal version-details-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="version-details-title"
    >
      <div className="modal-header">
        <div>
          <h3 id="version-details-title">
            v{version.version} · {snapshot?.displayName || t.versionDetails}
          </h3>
          <p className="modal-subtitle">{t.versionDetailsSubtitle}</p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label={t.close}
          autoFocus
        >
          <Icon name="close" size={18} />
        </button>
      </div>
      {snapshot ? (
        <div className="resource-detail-grid version-detail-grid">
          <div>
            <span className="detail-label">{t.versionStatus}</span>
            <span>
              {version.status === "PUBLISHED" ? t.published : t.draft}
            </span>
          </div>
          <div>
            <span className="detail-label">{t.versionPublishedAt}</span>
            <span>{formatDateTime(version.createdAt)}</span>
          </div>
          <div>
            <span className="detail-label">{t.agentRole}</span>
            <span>{snapshot.role || "-"}</span>
          </div>
          <div>
            <span className="detail-label">{t.model}</span>
            <span>{snapshot.model || "-"}</span>
          </div>
          <div>
            <span className="detail-label">{t.temperature}</span>
            <span>{snapshot.temperature ?? "-"}</span>
          </div>
          <div>
            <span className="detail-label">{t.priority}</span>
            <span>{snapshot.priority ?? "-"}</span>
          </div>
          <div>
            <span className="detail-label">{t.handlingMode}</span>
            <span>{snapshot.handlingMode || "-"}</span>
          </div>
          <div>
            <span className="detail-label">{t.returnMode}</span>
            <span>{snapshot.returnMode || "-"}</span>
          </div>
          <div>
            <span className="detail-label">{t.enabled}</span>
            <span>{snapshot.enabled === false ? t.disabled : t.enabled}</span>
          </div>
          <div>
            <span className="detail-label">{t.browserActions}</span>
            <span>
              {snapshot.supportsBrowserActions ? t.enabled : t.disabled}
            </span>
          </div>
          <div className="detail-full">
            <span className="detail-label">{t.descriptionLabel}</span>
            <p>{snapshot.description || t.noDescription}</p>
          </div>
          <div className="detail-full">
            <span className="detail-label">{t.systemPrompt}</span>
            <pre>{snapshot.systemPrompt || "-"}</pre>
          </div>
          {snapshot.routingRules && (
            <div className="detail-full">
              <span className="detail-label">{t.routingRules}</span>
              <pre>{snapshot.routingRules}</pre>
            </div>
          )}
          <div>
            <span className="detail-label">{t.knowledgeBases}</span>
            <span>{formatSnapshotIds(snapshot.knowledgeBaseIds)}</span>
          </div>
          <div>
            <span className="detail-label">{t.tools}</span>
            <span>{formatSnapshotIds(snapshot.toolIds)}</span>
          </div>
          <div>
            <span className="detail-label">{t.skills}</span>
            <span>{formatSnapshotIds(snapshot.skillIds)}</span>
          </div>
          {version.releaseNote && (
            <div className="detail-full">
              <span className="detail-label">{t.versionReleaseNote}</span>
              <p>{version.releaseNote}</p>
            </div>
          )}
          <details className="version-raw-snapshot detail-full">
            <summary>{t.rawSnapshot}</summary>
            <pre>{version.snapshot}</pre>
          </details>
        </div>
      ) : (
        <p className="error">{t.versionSnapshotUnavailable}</p>
      )}
    </div>
  );
}
