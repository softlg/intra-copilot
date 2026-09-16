import { useEffect, useMemo, useState } from "react";
import type { Language } from "../i18n/translations";
import {
  applyCopilotProposal,
  createCopilotSession,
  generateAgentValidationCases,
  getCopilotSession,
  listAgentValidationHistory,
  listCopilotSessions,
  respondCopilot,
  validateAgentBehavior,
  validateAgentStatic,
  type AgentValidationCase,
  type AgentValidationHistoryItem,
  type AgentValidationIssue,
  type AgentValidationReport,
  type CopilotMode,
  type CopilotProposal,
  type CopilotProposalPayload,
  type CopilotRespondResult,
  type CopilotSession,
  type CopilotSessionSummary,
} from "../lib/adminCopilot";
import { formatDateTime } from "../lib/format";
import { Icon } from "./Icon";
import { toast } from "./Toast";
import "./AdminCopilotPanel.css";

type PanelView = "assist" | "build" | "validate";

export type AdminCopilotPanelProps = {
  language: Language;
  currentAgentId?: string;
  currentAgentName?: string;
  currentAgentSnapshot: Record<string, unknown>;
  onClose: () => void;
  onApplyPatch: (changes: Record<string, unknown>) => void;
  onAppliedAgent: (agentId: string) => void;
  onResourcesChanged: () => void;
};

const copy = {
  zh: {
    title: "AI 工作台",
    subtitle: "辅助配置、生成 Agent 和验证执行效果",
    assist: "助手",
    build: "生成 Agent",
    validate: "验证 Agent",
    close: "关闭",
    history: "会话历史",
    newSession: "新会话",
    noSessions: "暂无会话，发送消息时会自动创建。",
    inputPlaceholder: "描述你想修改的内容，或直接粘贴报错信息…",
    send: "发送",
    sending: "分析中…",
    createSession: "新建会话",
    applyPatch: "应用到当前表单",
    patchApplied: "建议已应用到当前表单，请检查后保存。",
    noCurrentAgent: "打开一个 Agent 配置后可使用表单修改能力。",
    proposal: "待确认提案",
    proposalHint: "应用后才会创建资源；Agent 会以停用、未发布草案保存。",
    resources: "新增资源",
    noResources: "不新增资源",
    applyProposal: "确认并创建",
    applying: "创建中…",
    proposalApplied: "提案已应用，Agent 已保存为未发布草案。",
    resourceProposalApplied: "资源提案已应用。",
    validationAgent: "当前 Agent",
    staticCheck: "静态检查",
    checking: "检查中…",
    generateCases: "生成验证场景",
    generating: "生成中…",
    runSelected: "执行选中场景",
    running: "执行中…",
    selectedCount: "已选择 {count} 个场景",
    noCases: "尚未生成验证场景。",
    noIssues: "静态检查未发现问题。",
    issue: "建议",
    applyIssuePatch: "采用建议",
    pass: "通过",
    fail: "未通过",
    actualResponse: "实际回答",
    reason: "评估说明",
    historyTitle: "最近验证",
    status: "状态",
    emptyHistory: "暂无验证记录。",
    role: "角色",
    input: "输入",
    expected: "预期标准",
    checklist: "需求进度",
    readyToApply: "需求已完整，确认后创建 Agent 草案。",
    clarifying: "继续补充信息",
    error: "操作失败",
    loadFailed: "加载失败，请刷新后重试。",
    sessionFailed: "会话加载失败。",
    proposalSelected: "确认提案后会创建以下内容，不会自动发布 Agent。",
    noProposal: "完成需求访谈后会在这里显示资源与 Agent 草案。",
  },
  en: {
    title: "AI Workspace",
    subtitle: "Configure, generate, and validate agents",
    assist: "Assist",
    build: "Build Agent",
    validate: "Validate",
    close: "Close",
    history: "Session history",
    newSession: "New session",
    noSessions: "No session yet. One is created when you send a message.",
    inputPlaceholder:
      "Describe the change, paste an error, or explain what the Agent should do…",
    send: "Send",
    sending: "Analyzing…",
    createSession: "Create session",
    applyPatch: "Apply to current form",
    patchApplied: "Suggestion applied to the form. Review and save it.",
    noCurrentAgent: "Open an Agent configuration to apply form changes.",
    proposal: "Proposal awaiting confirmation",
    proposalHint:
      "Nothing is created until applied. Agents are saved disabled and unpublished.",
    resources: "New resources",
    noResources: "No new resources",
    applyProposal: "Confirm and create",
    applying: "Creating…",
    proposalApplied: "Proposal applied as an unpublished Agent draft.",
    resourceProposalApplied: "Resource proposal applied.",
    validationAgent: "Current Agent",
    staticCheck: "Static check",
    checking: "Checking…",
    generateCases: "Generate scenarios",
    generating: "Generating…",
    runSelected: "Run selected scenarios",
    running: "Running…",
    selectedCount: "{count} selected",
    noCases: "No validation scenarios generated yet.",
    noIssues: "Static check found no issues.",
    issue: "Advice",
    applyIssuePatch: "Apply advice",
    pass: "Passed",
    fail: "Failed",
    actualResponse: "Actual response",
    reason: "Evaluation",
    historyTitle: "Recent validations",
    status: "Status",
    emptyHistory: "No validation history.",
    role: "Role",
    input: "Input",
    expected: "Expected",
    checklist: "Requirement progress",
    readyToApply: "Requirements complete. Confirm to create an Agent draft.",
    clarifying: "More information needed",
    error: "Operation failed",
    loadFailed: "Unable to load. Refresh and try again.",
    sessionFailed: "Unable to load the session.",
    proposalSelected:
      "Confirming creates the resources below. The Agent is not published automatically.",
    noProposal:
      "Complete the interview to preview resources and the Agent draft.",
  },
} as const;

function parseJson<T>(value?: string): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function proposalResources(
  proposal: CopilotProposalPayload | undefined,
): Array<{ ref: string; kind: string }> {
  return (proposal?.resources ?? []).map((item) => ({
    ref: item.ref || "-",
    kind: item.kind || "RESOURCE",
  }));
}

function severityLabel(
  severity: AgentValidationIssue["severity"],
  language: Language,
) {
  const labels = {
    zh: {
      critical: "严重",
      error: "错误",
      warning: "警告",
      info: "提示",
    },
    en: {
      critical: "Critical",
      error: "Error",
      warning: "Warning",
      info: "Info",
    },
  };
  return labels[language][severity];
}

export function AdminCopilotPanel({
  language,
  currentAgentId,
  currentAgentName,
  currentAgentSnapshot,
  onClose,
  onApplyPatch,
  onAppliedAgent,
  onResourcesChanged,
}: AdminCopilotPanelProps) {
  const text = copy[language];
  const [view, setView] = useState<PanelView>("assist");
  const [sessions, setSessions] = useState<CopilotSessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<CopilotSession>();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [applyingProposalId, setApplyingProposalId] = useState<string>();
  const [panelError, setPanelError] = useState("");
  const [validationReport, setValidationReport] =
    useState<AgentValidationReport>();
  const [validationCases, setValidationCases] = useState<AgentValidationCase[]>(
    [],
  );
  const [selectedCases, setSelectedCases] = useState<Set<number>>(new Set());
  const [validationBusy, setValidationBusy] = useState<
    "static" | "cases" | "behavior"
  >();
  const [validationHistory, setValidationHistory] = useState<
    AgentValidationHistoryItem[]
  >([]);

  const mode: CopilotMode = view === "build" ? "BUILD" : "ASSIST";
  const visibleSessions = useMemo(
    () => sessions.filter((session) => session.mode === mode),
    [mode, sessions],
  );
  const latestAssistantPayload = useMemo(() => {
    const item = [...(activeSession?.messages ?? [])]
      .reverse()
      .find((entry) => entry.role === "assistant");
    return parseJson<CopilotRespondResult>(item?.payloadJson);
  }, [activeSession]);
  const readyProposals = useMemo(
    () =>
      (activeSession?.proposals ?? []).filter(
        (proposal) => proposal.status === "READY",
      ),
    [activeSession],
  );

  useEffect(() => {
    void loadSessions();
  }, []);

  useEffect(() => {
    setValidationReport(undefined);
    setValidationCases([]);
    setSelectedCases(new Set());
    if (!currentAgentId) {
      setValidationHistory([]);
      return;
    }
    void loadValidationHistory(currentAgentId);
  }, [currentAgentId]);

  const loadSessions = async () => {
    try {
      setSessions(await listCopilotSessions());
    } catch (error) {
      setPanelError(errorMessage(error, text.loadFailed));
    }
  };

  const loadSession = async (id: string) => {
    try {
      const session = await getCopilotSession(id);
      setActiveSession(session);
      setPanelError("");
      return session;
    } catch (error) {
      setPanelError(errorMessage(error, text.sessionFailed));
      return undefined;
    }
  };

  const startSession = async () => {
    try {
      const session = await createCopilotSession(mode, currentAgentId);
      setActiveSession(session);
      await loadSessions();
      setPanelError("");
      return session;
    } catch (error) {
      setPanelError(errorMessage(error, text.loadFailed));
      return undefined;
    }
  };

  const switchView = (next: PanelView) => {
    setView(next);
    if (next === "validate") {
      setActiveSession(undefined);
      return;
    }
    const nextMode: CopilotMode = next === "build" ? "BUILD" : "ASSIST";
    const candidate = sessions.find((session) => session.mode === nextMode);
    if (candidate) void loadSession(candidate.id);
    else setActiveSession(undefined);
  };

  const currentAgentContext = useMemo(
    () => ({
      ...currentAgentSnapshot,
      id: currentAgentId,
      displayName:
        currentAgentName || String(currentAgentSnapshot.displayName ?? ""),
    }),
    [currentAgentId, currentAgentName, currentAgentSnapshot],
  );

  const send = async () => {
    const content = message.trim();
    if (!content || sending) return;
    setSending(true);
    setPanelError("");
    try {
      let session = activeSession;
      if (!session || session.mode !== mode) {
        session = await startSession();
      }
      if (!session) return;
      await respondCopilot(
        session.id,
        content,
        currentAgentId,
        currentAgentContext,
      );
      setMessage("");
      await loadSession(session.id);
      await loadSessions();
    } catch (error) {
      setPanelError(errorMessage(error, text.error));
    } finally {
      setSending(false);
    }
  };

  const applyProposal = async (proposal: CopilotProposal) => {
    setApplyingProposalId(proposal.id);
    setPanelError("");
    try {
      const applied = await applyCopilotProposal(proposal.id);
      if (applied.targetType === "AGENT") {
        onAppliedAgent(applied.targetId);
        toast.success(text.proposalApplied);
      } else {
        onResourcesChanged();
        toast.success(text.resourceProposalApplied);
      }
      if (activeSession) await loadSession(activeSession.id);
    } catch (error) {
      setPanelError(errorMessage(error, text.error));
    } finally {
      setApplyingProposalId(undefined);
    }
  };

  const runStaticValidation = async () => {
    if (!currentAgentId || validationBusy) return;
    setValidationBusy("static");
    setPanelError("");
    try {
      setValidationReport(await validateAgentStatic(currentAgentId));
      setValidationCases([]);
      setSelectedCases(new Set());
      await loadValidationHistory(currentAgentId);
    } catch (error) {
      setPanelError(errorMessage(error, text.error));
    } finally {
      setValidationBusy(undefined);
    }
  };

  const generateCases = async () => {
    if (!currentAgentId || validationBusy) return;
    setValidationBusy("cases");
    setPanelError("");
    try {
      const result = await generateAgentValidationCases(currentAgentId);
      setValidationCases(result.cases);
      setSelectedCases(new Set());
    } catch (error) {
      setPanelError(errorMessage(error, text.error));
    } finally {
      setValidationBusy(undefined);
    }
  };

  const runBehaviorValidation = async () => {
    if (!currentAgentId || validationBusy) return;
    const selected = validationCases.filter((_, index) =>
      selectedCases.has(index),
    );
    if (selected.length === 0) return;
    setValidationBusy("behavior");
    setPanelError("");
    try {
      setValidationReport(
        await validateAgentBehavior(currentAgentId, selected),
      );
      await loadValidationHistory(currentAgentId);
    } catch (error) {
      setPanelError(errorMessage(error, text.error));
    } finally {
      setValidationBusy(undefined);
    }
  };

  const loadValidationHistory = async (agentId: string) => {
    try {
      setValidationHistory(await listAgentValidationHistory(agentId));
    } catch {
      setValidationHistory([]);
    }
  };

  const toggleCase = (index: number) => {
    setSelectedCases((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const applySuggestedPatch = (patch?: Record<string, unknown>) => {
    if (!patch || Object.keys(patch).length === 0) return;
    onApplyPatch(patch);
    toast.success(text.patchApplied);
  };

  return (
    <>
      <button
        type="button"
        className="copilot-scrim"
        aria-label={text.close}
        onClick={onClose}
      />
      <section
        className="admin-copilot-panel"
        role="complementary"
        aria-labelledby="admin-copilot-title"
      >
        <header className="copilot-header">
          <div className="copilot-heading">
            <span className="copilot-mark" aria-hidden="true">
              <Icon name="sparkle" size={18} />
            </span>
            <div>
              <h2 id="admin-copilot-title">{text.title}</h2>
              <p>{text.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            className="copilot-close"
            onClick={onClose}
            aria-label={text.close}
            title={text.close}
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="copilot-modes" role="tablist" aria-label={text.title}>
          {(
            [
              ["assist", text.assist],
              ["build", text.build],
              ["validate", text.validate],
            ] as const
          ).map(([key, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={view === key}
              className={view === key ? "active" : undefined}
              onClick={() => switchView(key)}
              key={key}
            >
              {label}
            </button>
          ))}
        </div>

        {panelError && (
          <p className="copilot-error" role="alert">
            <Icon name="alert" size={15} />
            {panelError}
          </p>
        )}

        {view === "validate" ? (
          <ValidationView
            text={text}
            language={language}
            agentId={currentAgentId}
            agentName={currentAgentName}
            report={validationReport}
            cases={validationCases}
            selectedCases={selectedCases}
            busy={validationBusy}
            history={validationHistory}
            onStatic={() => void runStaticValidation()}
            onGenerate={() => void generateCases()}
            onRun={() => void runBehaviorValidation()}
            onToggleCase={toggleCase}
            onApplyPatch={applySuggestedPatch}
          />
        ) : (
          <div className="copilot-chat">
            <div className="copilot-session-bar">
              <label>
                <span className="sr-only">{text.history}</span>
                <select
                  value={activeSession?.id ?? ""}
                  onChange={(event) => {
                    if (event.target.value)
                      void loadSession(event.target.value);
                    else setActiveSession(undefined);
                  }}
                >
                  <option value="">{text.history}</option>
                  {visibleSessions.map((session) => (
                    <option value={session.id} key={session.id}>
                      {session.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() => void startSession()}
                aria-label={text.newSession}
                title={text.newSession}
              >
                <Icon name="plus" size={15} />
              </button>
            </div>

            <div className="copilot-messages" aria-live="polite">
              {!activeSession && visibleSessions.length === 0 && (
                <p className="copilot-empty">{text.noSessions}</p>
              )}
              {activeSession?.messages.map((item) => (
                <article
                  className={`copilot-message is-${item.role}`}
                  key={item.id}
                >
                  <span className="copilot-message-role">
                    {item.role === "assistant" ? text.title : "Admin"}
                  </span>
                  <p>{item.content}</p>
                  <time>{formatDateTime(item.createdAt)}</time>
                  {item.role === "assistant" &&
                    (() => {
                      const payload = parseJson<CopilotRespondResult>(
                        item.payloadJson,
                      );
                      return (
                        <AssistantDetails
                          text={text}
                          payload={payload}
                          onApplyPatch={applySuggestedPatch}
                          canApplyPatch={Boolean(currentAgentId)}
                        />
                      );
                    })()}
                </article>
              ))}
            </div>

            {view === "build" && latestAssistantPayload && (
              <p className="copilot-phase-note">
                <Icon
                  name={
                    latestAssistantPayload.phase === "READY_TO_APPLY"
                      ? "check"
                      : "info"
                  }
                  size={15}
                />
                {latestAssistantPayload.phase === "READY_TO_APPLY"
                  ? text.readyToApply
                  : text.clarifying}
                {latestAssistantPayload.requirements && (
                  <span>
                    {text.checklist}:{" "}
                    {
                      Object.values(latestAssistantPayload.requirements).filter(
                        (value) => {
                          if (Array.isArray(value)) return value.length > 0;
                          return typeof value === "boolean"
                            ? value
                            : Boolean(value);
                        },
                      ).length
                    }
                  </span>
                )}
              </p>
            )}

            {readyProposals.length === 0 && view === "build" && (
              <p className="copilot-empty">{text.noProposal}</p>
            )}
            {readyProposals.map((proposal) => (
              <ProposalPreview
                key={proposal.id}
                text={text}
                proposal={proposal}
                applying={applyingProposalId === proposal.id}
                onApply={() => void applyProposal(proposal)}
              />
            ))}

            <div className="copilot-composer">
              <label htmlFor="admin-copilot-message" className="sr-only">
                {text.inputPlaceholder}
              </label>
              <textarea
                id="admin-copilot-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={text.inputPlaceholder}
                rows={4}
                maxLength={16000}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (event.ctrlKey || event.metaKey)
                  ) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || !message.trim()}
              >
                {sending ? text.sending : text.send}
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function AssistantDetails({
  text,
  payload,
  onApplyPatch,
  canApplyPatch,
}: {
  text: (typeof copy)[Language];
  payload?: CopilotRespondResult;
  onApplyPatch: (patch?: Record<string, unknown>) => void;
  canApplyPatch: boolean;
}) {
  if (!payload) return null;
  const questions = payload.questions ?? [];
  const changes = payload.patch?.changes;
  const hasChanges = changes && Object.keys(changes).length > 0;
  return (
    <div className="copilot-assistant-details">
      {questions.length > 0 && (
        <ol className="copilot-questions">
          {questions.map((question, index) => (
            <li key={`${question.field}-${index}`}>
              {question.prompt || question.field}
            </li>
          ))}
        </ol>
      )}
      {hasChanges && (
        <div className="copilot-patch">
          <div className="copilot-patch-title">
            <strong>{text.applyPatch}</strong>
            <button
              type="button"
              onClick={() => onApplyPatch(changes)}
              disabled={!canApplyPatch}
            >
              <Icon name="edit" size={14} />
              {text.applyPatch}
            </button>
          </div>
          <pre>{JSON.stringify(changes, null, 2)}</pre>
          {!canApplyPatch && <p>{text.noCurrentAgent}</p>}
        </div>
      )}
    </div>
  );
}

function ProposalPreview({
  text,
  proposal,
  applying,
  onApply,
}: {
  text: (typeof copy)[Language];
  proposal: CopilotProposal;
  applying: boolean;
  onApply: () => void;
}) {
  const payload = parseJson<CopilotProposalPayload>(proposal.payloadJson);
  const resources = proposalResources(payload);
  return (
    <section className="copilot-proposal">
      <div className="copilot-proposal-heading">
        <div>
          <strong>{text.proposal}</strong>
          <p>{text.proposalHint}</p>
        </div>
        <span className="copilot-status">READY</span>
      </div>
      <div className="copilot-proposal-grid">
        <div>
          <span>{text.resources}</span>
          <strong>{resources.length || text.noResources}</strong>
        </div>
        <div>
          <span>Agent</span>
          <strong>{payload?.agent?.displayName || proposal.title}</strong>
        </div>
      </div>
      {resources.length > 0 && (
        <ul className="copilot-resource-list">
          {resources.map((item) => (
            <li key={`${item.kind}-${item.ref}`}>
              <span>{item.kind}</span>
              <code>{item.ref}</code>
            </li>
          ))}
        </ul>
      )}
      <p className="copilot-proposal-note">{text.proposalSelected}</p>
      <button type="button" onClick={onApply} disabled={applying}>
        {applying ? text.applying : text.applyProposal}
      </button>
    </section>
  );
}

function ValidationView({
  text,
  language,
  agentId,
  agentName,
  report,
  cases,
  selectedCases,
  busy,
  history,
  onStatic,
  onGenerate,
  onRun,
  onToggleCase,
  onApplyPatch,
}: {
  text: (typeof copy)[Language];
  language: Language;
  agentId?: string;
  agentName?: string;
  report?: AgentValidationReport;
  cases: AgentValidationCase[];
  selectedCases: Set<number>;
  busy?: "static" | "cases" | "behavior";
  history: AgentValidationHistoryItem[];
  onStatic: () => void;
  onGenerate: () => void;
  onRun: () => void;
  onToggleCase: (index: number) => void;
  onApplyPatch: (patch?: Record<string, unknown>) => void;
}) {
  if (!agentId) {
    return <p className="copilot-empty">{text.noCurrentAgent}</p>;
  }
  return (
    <div className="copilot-validation">
      <div className="copilot-validation-agent">
        <span>{text.validationAgent}</span>
        <strong>{agentName || agentId}</strong>
        <code>{agentId}</code>
      </div>
      <div className="copilot-validation-actions">
        <button
          type="button"
          className="secondary"
          onClick={onStatic}
          disabled={Boolean(busy)}
        >
          <Icon name="check" size={14} />
          {busy === "static" ? text.checking : text.staticCheck}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={onGenerate}
          disabled={Boolean(busy)}
        >
          <Icon name="sparkle" size={14} />
          {busy === "cases" ? text.generating : text.generateCases}
        </button>
        <button
          type="button"
          onClick={onRun}
          disabled={Boolean(busy) || selectedCases.size === 0}
        >
          <Icon name="play" size={14} />
          {busy === "behavior" ? text.running : text.runSelected}
        </button>
      </div>

      {report && (
        <section className="copilot-validation-section">
          <div className="copilot-section-heading">
            <h3>{text.staticCheck}</h3>
            <span>
              {report.summary.issueCount === 0
                ? text.noIssues
                : `${report.summary.issueCount} ${text.issue}`}
            </span>
          </div>
          <div className="copilot-issue-list">
            {report.staticIssues.map((issue, index) => (
              <article
                className={`copilot-issue is-${issue.severity}`}
                key={`${issue.code}-${index}`}
              >
                <div>
                  <span>{severityLabel(issue.severity, language)}</span>
                  <strong>{issue.title}</strong>
                </div>
                <p>{issue.detail}</p>
                {issue.patch && Object.keys(issue.patch).length > 0 && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => onApplyPatch(issue.patch)}
                  >
                    {text.applyIssuePatch}
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="copilot-validation-section">
        <div className="copilot-section-heading">
          <h3>{text.generateCases}</h3>
          <span>
            {text.selectedCount.replace("{count}", String(selectedCases.size))}
          </span>
        </div>
        {cases.length === 0 ? (
          <p className="copilot-empty">{text.noCases}</p>
        ) : (
          <div className="copilot-case-list">
            {cases.map((item, index) => {
              const result = report?.cases?.find(
                (candidate) =>
                  candidate.title === item.title &&
                  candidate.input === item.input,
              );
              return (
                <article
                  className={
                    result
                      ? `copilot-case ${result.passed ? "is-pass" : "is-fail"}`
                      : "copilot-case"
                  }
                  key={`${item.title}-${index}`}
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedCases.has(index)}
                      onChange={() => onToggleCase(index)}
                    />
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {text.input}: {item.input}
                      </small>
                    </span>
                  </label>
                  <p>
                    <b>{text.expected}:</b> {item.expected}
                  </p>
                  {result && (
                    <>
                      <span
                        className={
                          result.passed
                            ? "copilot-result is-pass"
                            : "copilot-result is-fail"
                        }
                      >
                        <Icon
                          name={result.passed ? "check" : "close"}
                          size={14}
                        />
                        {result.passed ? text.pass : text.fail}
                      </span>
                      <div className="copilot-case-output">
                        <b>{text.actualResponse}</b>
                        <pre>{result.actualResponse || "-"}</pre>
                      </div>
                      {result.reason && (
                        <p>
                          <b>{text.reason}:</b> {result.reason}
                        </p>
                      )}
                      {result.suggestedPatch &&
                        Object.keys(result.suggestedPatch).length > 0 && (
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => onApplyPatch(result.suggestedPatch)}
                          >
                            {text.applyIssuePatch}
                          </button>
                        )}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="copilot-validation-section">
        <div className="copilot-section-heading">
          <h3>{text.historyTitle}</h3>
        </div>
        {history.length === 0 ? (
          <p className="copilot-empty">{text.emptyHistory}</p>
        ) : (
          <ul className="copilot-history">
            {history.map((item) => (
              <li key={item.id}>
                <span>{text.status}</span>
                <strong>{item.status}</strong>
                <time>{formatDateTime(item.createdAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
