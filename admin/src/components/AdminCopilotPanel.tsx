import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Language } from "../i18n/translations";
import {
  applyCopilotProposal,
  cancelValidationStream,
  createCopilotSession,
  deleteCopilotSessions,
  generateAgentValidationCases,
  getCopilotSession,
  listAgentValidationHistory,
  listCopilotSessions,
  renameCopilotSession,
  respondCopilot,
  streamValidateAgentBehavior,
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

type CaseRunState = "queued" | "running" | "passed" | "failed" | "skipped";

type ValidationRunItem = {
  key: string;
  index: number;
  title: string;
  state: CaseRunState;
  detail?: string;
};

type ValidationRunTracker = {
  runId?: string;
  active: boolean;
  stopping: boolean;
  cancelled: boolean;
  finished: boolean;
  startedAt: number;
  elapsedMs: number;
  items: ValidationRunItem[];
};

const DEFAULT_PANEL_WIDTH = 430;
const MIN_PANEL_WIDTH = 360;
const MAX_PANEL_WIDTH = 900;
const MIN_MAIN_CONTENT_WIDTH = 420;
const PANEL_WIDTH_STORAGE_KEY = "admin-copilot-width";

function panelWidthLimit(workspaceWidth?: number) {
  if (!workspaceWidth || workspaceWidth <= 0) return MAX_PANEL_WIDTH;
  return Math.max(
    MIN_PANEL_WIDTH,
    Math.min(MAX_PANEL_WIDTH, workspaceWidth - MIN_MAIN_CONTENT_WIDTH),
  );
}

function clampPanelWidth(width: number, workspaceWidth?: number) {
  return Math.min(
    Math.max(MIN_PANEL_WIDTH, width),
    panelWidthLimit(workspaceWidth),
  );
}

export type AdminCopilotPanelProps = {
  language: Language;
  currentAgentId?: string;
  currentAgentName?: string;
  currentAgentSnapshot: Record<string, unknown>;
  onClose: () => void;
  onApplyPatch: (changes: Record<string, unknown>) => void;
  onAppliedAgent: (agentId: string) => void;
  onResourcesChanged: () => void;
  resourceLabels?: Record<string, string>;
};

const copy = {
  zh: {
    title: "AI 工作台",
    subtitle: "辅助配置、生成 Agent 和验证执行效果",
    assist: "助手",
    build: "生成 Agent",
    validate: "验证 Agent",
    close: "关闭",
    resizePanel: "拖动调整 AI 工作台宽度，双击恢复默认",
    history: "会话历史",
    newSession: "新会话",
    noSessions: "暂无会话，发送消息时会自动创建。",
    renameSession: "重命名",
    renameSave: "保存名称",
    renameCancel: "取消重命名",
    deleteSession: "删除会话",
    deleteSelected: "删除选中 ({count})",
    confirmDeleteOne: "确认删除这个会话？",
    confirmDeleteMany: "确认删除选中的 {count} 个会话？",
    cancel: "取消",
    delete: "删除",
    expandSessions: "… 展开其余 {count} 条",
    collapseSessions: "收起",
    sessionRenamed: "会话已重命名。",
    sessionsDeleted: "已删除 {count} 个会话。",
    inputPlaceholder: "描述你想修改的内容，或直接粘贴报错信息…",
    send: "发送",
    thinking: "正在思考…",
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
    proposalApplied: "已应用提案「{title}」，Agent 已保存为未发布草案。",
    resourceProposalApplied: "已应用资源提案「{title}」。",
    appliedAgentDetail: "Agent 已保存为未发布草案，记得保存后发布。",
    appliedResourceDetail: "资源已创建并加入当前 Agent。",
    validationAgent: "当前 Agent",
    staticCheck: "静态检查",
    checking: "检查中…",
    generateCases: "生成验证场景",
    generating: "生成中…",
    runSelected: "执行选中场景",
    running: "执行中…",
    runStep: "正在执行第 {current}/{total} 个场景",
    runFinished: "执行完成",
    runCancelled: "已中止执行",
    runQueued: "等待执行",
    runRunning: "执行中",
    runSkipped: "已跳过",
    runStop: "中止执行",
    runStopping: "中止中…",
    runSummary: "通过 {passed} · 未通过 {failed} · 共 {total} 个场景",
    runCancelHint: "剩余场景已跳过，已完成的结果仍然有效。",
    runHint: "逐个场景调用模型验证，进度与结果实时更新，可随时中止。",
    selectedCount: "已选择 {count} 个场景",
    selectAll: "全选",
    clearSelection: "取消全选",
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
    appliedPatchTitle: "已应用修改（{count} 项）",
    before: "改前",
    after: "改后",
    applied: "已应用",
    appliedPatchHint:
      "已写入当前表单，请检查无误后保存；建议重新运行静态检查确认效果。",
  },
  en: {
    title: "AI Workspace",
    subtitle: "Configure, generate, and validate agents",
    assist: "Assist",
    build: "Build Agent",
    validate: "Validate",
    close: "Close",
    resizePanel: "Drag to resize the AI workspace; double-click to reset",
    history: "Session history",
    newSession: "New session",
    noSessions: "No session yet. One is created when you send a message.",
    renameSession: "Rename",
    renameSave: "Save name",
    renameCancel: "Cancel rename",
    deleteSession: "Delete session",
    deleteSelected: "Delete selected ({count})",
    confirmDeleteOne: "Delete this session?",
    confirmDeleteMany: "Delete the {count} selected sessions?",
    cancel: "Cancel",
    delete: "Delete",
    expandSessions: "… Show {count} more",
    collapseSessions: "Collapse",
    sessionRenamed: "Session renamed.",
    sessionsDeleted: "{count} sessions deleted.",
    inputPlaceholder:
      "Describe the change, paste an error, or explain what the Agent should do…",
    send: "Send",
    thinking: "Thinking…",
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
    proposalApplied:
      'Applied proposal "{title}" as an unpublished Agent draft.',
    resourceProposalApplied: 'Applied resource proposal "{title}".',
    appliedAgentDetail:
      "Agent saved as an unpublished draft; remember to publish after saving.",
    appliedResourceDetail: "Resources created and added to the current Agent.",
    validationAgent: "Current Agent",
    staticCheck: "Static check",
    checking: "Checking…",
    generateCases: "Generate scenarios",
    generating: "Generating…",
    runSelected: "Run selected scenarios",
    running: "Running…",
    runStep: "Running scenario {current}/{total}",
    runFinished: "Run complete",
    runCancelled: "Run cancelled",
    runQueued: "Queued",
    runRunning: "Running",
    runSkipped: "Skipped",
    runStop: "Stop",
    runStopping: "Stopping…",
    runSummary: "{passed} passed · {failed} failed · {total} total",
    runCancelHint:
      "Remaining scenarios were skipped; collected results are kept.",
    runHint:
      "Scenarios call the model one by one. Progress updates live and you can stop anytime.",
    selectedCount: "{count} selected",
    selectAll: "Select all",
    clearSelection: "Clear selection",
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
    appliedPatchTitle: "Applied changes ({count})",
    before: "Before",
    after: "After",
    applied: "Applied",
    appliedPatchHint:
      "Written to the form. Review and save; re-run the static check to confirm.",
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

function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 100) / 10);
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

function patchRunItem(
  tracker: ValidationRunTracker,
  position: number,
  patch: Partial<ValidationRunItem>,
) {
  return {
    ...tracker,
    items: tracker.items.map((item, index) =>
      index === position ? { ...item, ...patch } : item,
    ),
  };
}

function runStateLabel(state: CaseRunState, text: (typeof copy)[Language]) {
  if (state === "queued") return text.runQueued;
  if (state === "running") return text.runRunning;
  if (state === "passed") return text.pass;
  if (state === "failed") return text.fail;
  return text.runSkipped;
}

function runStateIcon(state: CaseRunState) {
  if (state === "queued") return "clock";
  if (state === "running") return "refresh";
  if (state === "passed") return "check";
  if (state === "failed") return "close";
  return "minus";
}

const FIELD_LABELS: Record<string, { zh: string; en: string }> = {
  displayName: { zh: "名称", en: "Name" },
  description: { zh: "描述", en: "Description" },
  systemPrompt: { zh: "系统提示词", en: "System prompt" },
  routingRules: { zh: "路由规则", en: "Routing rules" },
  model: { zh: "模型", en: "Model" },
  temperature: { zh: "温度", en: "Temperature" },
  planningMode: { zh: "规划模式", en: "Planning mode" },
  maxPlanSteps: { zh: "最大规划步数", en: "Max plan steps" },
  knowledgeBaseIds: { zh: "知识库", en: "Knowledge bases" },
  toolIds: { zh: "工具", en: "Tools" },
  skillIds: { zh: "技能", en: "Skills" },
};

const ID_LIST_FIELDS = new Set(["knowledgeBaseIds", "toolIds", "skillIds"]);

function normalizeIdList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item)).filter(Boolean);
      }
    } catch {
      // fall through to plain split
    }
    return trimmed
      .split(/[,\n;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function formatPatchValue(
  value: unknown,
  field: string,
  labels?: Record<string, string>,
): string {
  if (value === null || value === undefined) return "—";
  if (ID_LIST_FIELDS.has(field)) {
    const ids = normalizeIdList(value);
    if (ids.length === 0) return "（无）";
    return ids.map((id) => labels?.[id] ?? id).join("、");
  }
  if (Array.isArray(value)) {
    return value.length
      ? value.map((item) => String(item)).join("、")
      : "（无）";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function PatchValue({
  field,
  value,
  labels,
  highlight,
}: {
  field: string;
  value: unknown;
  labels?: Record<string, string>;
  highlight?: boolean;
}) {
  const display = formatPatchValue(value, field, labels);
  const long = display.length > 56 || display.includes("\n");
  const className = highlight ? "is-after" : undefined;
  if (long) {
    return <pre className={className}>{display}</pre>;
  }
  return <span className={className}>{display}</span>;
}

function AppliedPatchSummary({
  text,
  language,
  patch,
  before,
  labels,
  onDismiss,
}: {
  text: (typeof copy)[Language];
  language: Language;
  patch: Record<string, unknown>;
  before: Record<string, unknown>;
  labels?: Record<string, string>;
  onDismiss: () => void;
}) {
  const entries = Object.entries(patch).filter(([key]) => key !== "agentId");
  if (entries.length === 0) return null;
  return (
    <section className="copilot-applied-patch" aria-live="polite">
      <div className="copilot-applied-head">
        <span className="copilot-applied-title">
          <Icon name="check" size={15} />
          {text.appliedPatchTitle.replace("{count}", String(entries.length))}
        </span>
        <button
          type="button"
          className="copilot-applied-dismiss"
          onClick={onDismiss}
          aria-label={text.close}
          title={text.close}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
      <ul className="copilot-applied-list">
        {entries.map(([field, value]) => (
          <li key={field}>
            <span className="copilot-applied-field">
              {FIELD_LABELS[field]?.[language] ?? field}
            </span>
            <div className="copilot-applied-diff">
              <div className="copilot-applied-side">
                <span className="copilot-applied-tag">{text.before}</span>
                <PatchValue
                  field={field}
                  value={before[field]}
                  labels={labels}
                />
              </div>
              <Icon
                name="chevron-right"
                size={13}
                className="copilot-applied-arrow"
              />
              <div className="copilot-applied-side is-after">
                <span className="copilot-applied-tag">{text.after}</span>
                <PatchValue
                  field={field}
                  value={value}
                  labels={labels}
                  highlight
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="copilot-applied-hint">{text.appliedPatchHint}</p>
    </section>
  );
}

function AppliedProposalBanner({
  text,
  title,
  detail,
  onDismiss,
}: {
  text: (typeof copy)[Language];
  title: string;
  detail: string;
  onDismiss: () => void;
}) {
  return (
    <section className="copilot-applied-banner" aria-live="polite">
      <Icon name="check" size={15} className="copilot-applied-banner-icon" />
      <div className="copilot-applied-banner-body">
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      <button
        type="button"
        className="copilot-applied-dismiss"
        onClick={onDismiss}
        aria-label={text.close}
        title={text.close}
      >
        <Icon name="close" size={14} />
      </button>
    </section>
  );
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
  resourceLabels,
}: AdminCopilotPanelProps) {
  const text = copy[language];
  const [view, setView] = useState<PanelView>("assist");
  const [sessions, setSessions] = useState<CopilotSessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<CopilotSession>();
  const [sessionActionBusy, setSessionActionBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<string>();
  const pendingMessageRef = useRef<HTMLDivElement>(null);
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
  const [validationRunTracker, setValidationRunTracker] =
    useState<ValidationRunTracker>();
  const [validationHistory, setValidationHistory] = useState<
    AgentValidationHistoryItem[]
  >([]);
  const [appliedPatchSummary, setAppliedPatchSummary] = useState<{
    patch: Record<string, unknown>;
    before: Record<string, unknown>;
  }>();
  const [appliedPatchKeys, setAppliedPatchKeys] = useState<Set<string>>(
    new Set(),
  );
  const [appliedProposalSummary, setAppliedProposalSummary] = useState<{
    title: string;
    detail: string;
  }>();
  const [panelWidth, setPanelWidth] = useState(() =>
    clampPanelWidth(
      Number(localStorage.getItem(PANEL_WIDTH_STORAGE_KEY)) ||
        DEFAULT_PANEL_WIDTH,
    ),
  );
  const [resizingPanel, setResizingPanel] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const resizeStateRef = useRef({ active: false, pointerId: -1 });

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
    const panel = panelRef.current;
    const workspace = panel?.parentElement;
    if (!panel || !workspace) return undefined;

    const syncWidth = () => {
      setPanelWidth((current) =>
        clampPanelWidth(current, workspace.clientWidth),
      );
    };
    const frame = window.requestAnimationFrame(syncWidth);
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(syncWidth);
    observer?.observe(workspace);
    window.addEventListener("resize", syncWidth);
    window.addEventListener("admin:page-zoom-change", syncWidth);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", syncWidth);
      window.removeEventListener("admin:page-zoom-change", syncWidth);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(
      PANEL_WIDTH_STORAGE_KEY,
      String(Math.round(panelWidth)),
    );
  }, [panelWidth]);

  useEffect(() => {
    document.body.classList.toggle("copilot-panel-resizing", resizingPanel);
    return () => document.body.classList.remove("copilot-panel-resizing");
  }, [resizingPanel]);

  useEffect(() => {
    if (!validationRunTracker?.active) return undefined;
    const timer = window.setInterval(() => {
      setValidationRunTracker((current) =>
        current && current.active
          ? { ...current, elapsedMs: Date.now() - current.startedAt }
          : current,
      );
    }, 500);
    return () => window.clearInterval(timer);
  }, [validationRunTracker?.active]);

  useEffect(() => {
    setValidationReport(undefined);
    setValidationCases([]);
    setSelectedCases(new Set());
    setAppliedPatchSummary(undefined);
    setAppliedPatchKeys(new Set());
    setAppliedProposalSummary(undefined);
    setValidationRunTracker(undefined);
    if (!currentAgentId) {
      setValidationHistory([]);
      return;
    }
    void loadValidationHistory(currentAgentId);
  }, [currentAgentId]);

  useEffect(() => {
    if (!pendingUserMessage) return;
    pendingMessageRef.current?.scrollIntoView({ block: "nearest" });
  }, [pendingUserMessage, activeSession?.messages.length]);

  const loadSessions = async () => {
    try {
      const values = await listCopilotSessions();
      setSessions(values);
      return values;
    } catch (error) {
      setPanelError(errorMessage(error, text.loadFailed));
      return [] as CopilotSessionSummary[];
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

  const renameSession = async (id: string, title: string) => {
    setSessionActionBusy(true);
    setPanelError("");
    try {
      const updated = await renameCopilotSession(id, title);
      setSessions((current) =>
        current.map((session) =>
          session.id === id
            ? {
                ...session,
                title: updated.title,
                updatedAt: updated.updatedAt,
              }
            : session,
        ),
      );
      setActiveSession((current) =>
        current?.id === id
          ? { ...current, title: updated.title, updatedAt: updated.updatedAt }
          : current,
      );
      toast.success(text.sessionRenamed);
      return true;
    } catch (error) {
      setPanelError(errorMessage(error, text.error));
      return false;
    } finally {
      setSessionActionBusy(false);
    }
  };

  const deleteSessions = async (ids: string[]) => {
    if (ids.length === 0) return false;
    const uniqueIds = [...new Set(ids)];
    setSessionActionBusy(true);
    setPanelError("");
    try {
      const result = await deleteCopilotSessions(uniqueIds);
      const remaining = await loadSessions();
      if (activeSession && uniqueIds.includes(activeSession.id)) {
        const replacement = remaining.find(
          (session) => session.mode === activeSession.mode,
        );
        if (replacement) await loadSession(replacement.id);
        else setActiveSession(undefined);
      }
      toast.success(
        text.sessionsDeleted.replace("{count}", String(result.deleted)),
      );
      return true;
    } catch (error) {
      setPanelError(errorMessage(error, text.error));
      return false;
    } finally {
      setSessionActionBusy(false);
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
    setMessage("");
    setPendingUserMessage(content);
    try {
      let session = activeSession;
      if (!session || session.mode !== mode) {
        session = await startSession();
      }
      if (!session) {
        setMessage(content);
        setPendingUserMessage(undefined);
        return;
      }
      await respondCopilot(
        session.id,
        content,
        currentAgentId,
        currentAgentContext,
      );
      setPendingUserMessage(undefined);
      await loadSession(session.id);
      await loadSessions();
    } catch (error) {
      setPanelError(errorMessage(error, text.error));
      setMessage(content);
      setPendingUserMessage(undefined);
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
        toast.success(text.proposalApplied.replace("{title}", proposal.title));
        setAppliedProposalSummary({
          title: proposal.title,
          detail: text.appliedAgentDetail,
        });
      } else {
        onResourcesChanged();
        toast.success(
          text.resourceProposalApplied.replace("{title}", proposal.title),
        );
        setAppliedProposalSummary({
          title: proposal.title,
          detail: text.appliedResourceDetail,
        });
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
    const order = [...selectedCases].sort((a, b) => a - b);
    if (order.length === 0) return;
    setValidationBusy("behavior");
    setPanelError("");
    setValidationRunTracker({
      active: true,
      stopping: false,
      cancelled: false,
      finished: false,
      startedAt: Date.now(),
      elapsedMs: 0,
      items: order.map((index) => ({
        key: `run-${index}`,
        index,
        title: validationCases[index]?.title || `#${index + 1}`,
        state: "queued",
      })),
    });

    const collected: AgentValidationCase[] = [];
    const previousIssues = validationReport?.staticIssues ?? [];
    const pushLiveReport = () => {
      setValidationReport({
        runId: "",
        agentId: currentAgentId,
        agentVersion: 0,
        configHash: "",
        status: "RUNNING",
        staticIssues: previousIssues,
        cases: [...collected],
        summary: {
          issueCount: previousIssues.length,
          critical: 0,
          error: 0,
          warning: 0,
          info: 0,
          testsRun: collected.length,
          testsPassed: collected.filter((item) => item.passed).length,
          testsFailed: collected.filter((item) => !item.passed).length,
        },
        createdAt: new Date().toISOString(),
      });
    };

    try {
      await streamValidateAgentBehavior(
        currentAgentId,
        order.map((index) => validationCases[index]),
        {
          onRunStart: (payload) =>
            setValidationRunTracker((current) =>
              current ? { ...current, runId: payload.runId } : current,
            ),
          onCaseStart: (payload) =>
            setValidationRunTracker((current) =>
              current
                ? patchRunItem(current, payload.index, { state: "running" })
                : current,
            ),
          onCaseResult: (payload) => {
            collected[payload.index] = payload.case;
            pushLiveReport();
            setValidationRunTracker((current) =>
              current
                ? patchRunItem(current, payload.index, {
                    state: payload.passed ? "passed" : "failed",
                    detail: payload.case.reason,
                  })
                : current,
            );
          },
          onDone: (report) => setValidationReport(report),
          onStreamError: (payload) =>
            setPanelError(payload.message || text.error),
        },
      );
      await loadValidationHistory(currentAgentId);
    } catch (error) {
      setPanelError(errorMessage(error, text.error));
    } finally {
      setValidationRunTracker((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.state === "queued" || item.state === "running"
                  ? { ...item, state: "skipped" }
                  : item,
              ),
              active: false,
              finished: true,
              stopping: false,
              elapsedMs: Date.now() - current.startedAt,
            }
          : current,
      );
      setValidationBusy(undefined);
    }
  };

  const cancelBehaviorRun = async () => {
    const runId = validationRunTracker?.runId;
    if (!currentAgentId || !runId || validationRunTracker?.stopping) return;
    setValidationRunTracker((current) =>
      current
        ? {
            ...current,
            stopping: true,
            cancelled: true,
            items: current.items.map((item) =>
              item.state === "queued" ? { ...item, state: "skipped" } : item,
            ),
          }
        : current,
    );
    try {
      await cancelValidationStream(currentAgentId, runId);
    } catch (error) {
      setPanelError(errorMessage(error, text.error));
    }
  };

  const dismissRunTracker = () => setValidationRunTracker(undefined);

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

  const selectAllCases = () => {
    setSelectedCases(new Set(validationCases.map((_, index) => index)));
  };

  const clearSelectedCases = () => {
    setSelectedCases(new Set());
  };

  const applySuggestedPatch = (
    patch?: Record<string, unknown>,
    key?: string,
  ) => {
    if (!patch || Object.keys(patch).length === 0) return;
    const before = { ...currentAgentSnapshot };
    onApplyPatch(patch);
    setAppliedPatchSummary({ patch, before });
    if (key) {
      setAppliedPatchKeys((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    }
    toast.success(text.patchApplied);
  };

  const dismissAppliedPatch = () => setAppliedPatchSummary(undefined);

  const resizePanelTo = (width: number) => {
    const workspaceWidth = panelRef.current?.parentElement?.clientWidth;
    setPanelWidth(clampPanelWidth(width, workspaceWidth));
  };

  const beginPanelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeStateRef.current = { active: true, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizingPanel(true);
  };

  const movePanelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !resizeStateRef.current.active ||
      resizeStateRef.current.pointerId !== event.pointerId
    ) {
      return;
    }
    const zoom =
      Number.parseFloat(
        window.getComputedStyle(document.documentElement).zoom || "1",
      ) || 1;
    resizePanelTo(document.documentElement.clientWidth - event.clientX / zoom);
  };

  const endPanelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizeStateRef.current.pointerId !== event.pointerId) return;
    resizeStateRef.current = { active: false, pointerId: -1 };
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setResizingPanel(false);
  };

  const resizePanelWithKeyboard = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const workspaceWidth = panelRef.current?.parentElement?.clientWidth;
    const limit = panelWidthLimit(workspaceWidth);
    let nextWidth: number | undefined;
    if (event.key === "ArrowLeft") nextWidth = panelWidth + 20;
    if (event.key === "ArrowRight") nextWidth = panelWidth - 20;
    if (event.key === "Home") nextWidth = MIN_PANEL_WIDTH;
    if (event.key === "End") nextWidth = limit;
    if (event.key === "Enter" || event.key === " ") {
      nextWidth = DEFAULT_PANEL_WIDTH;
    }
    if (nextWidth === undefined) return;
    event.preventDefault();
    resizePanelTo(nextWidth);
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
        ref={panelRef}
        className={
          resizingPanel
            ? "admin-copilot-panel is-resizing"
            : "admin-copilot-panel"
        }
        style={
          {
            "--copilot-panel-width": `${panelWidth}px`,
          } as CSSProperties
        }
        role="complementary"
        aria-labelledby="admin-copilot-title"
      >
        <div
          className="copilot-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label={text.resizePanel}
          aria-valuemin={MIN_PANEL_WIDTH}
          aria-valuemax={Math.round(
            panelWidthLimit(panelRef.current?.parentElement?.clientWidth),
          )}
          aria-valuenow={Math.round(panelWidth)}
          tabIndex={0}
          title={text.resizePanel}
          onPointerDown={beginPanelResize}
          onPointerMove={movePanelResize}
          onPointerUp={endPanelResize}
          onPointerCancel={endPanelResize}
          onDoubleClick={() => resizePanelTo(DEFAULT_PANEL_WIDTH)}
          onKeyDown={resizePanelWithKeyboard}
        />
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
            runTracker={validationRunTracker}
            onStatic={() => void runStaticValidation()}
            onGenerate={() => void generateCases()}
            onRun={() => void runBehaviorValidation()}
            onCancelRun={() => void cancelBehaviorRun()}
            onDismissRun={dismissRunTracker}
            onToggleCase={toggleCase}
            onSelectAll={selectAllCases}
            onClearSelection={clearSelectedCases}
            onApplyPatch={applySuggestedPatch}
            appliedPatchSummary={appliedPatchSummary}
            appliedPatchKeys={appliedPatchKeys}
            resourceLabels={resourceLabels}
            onDismissAppliedPatch={dismissAppliedPatch}
          />
        ) : (
          <div className="copilot-chat">
            <SessionHistoryPicker
              text={text}
              sessions={visibleSessions}
              activeSessionId={activeSession?.id}
              busy={sessionActionBusy || sending}
              onSelect={(id) => void loadSession(id)}
              onNew={() => void startSession()}
              onRename={renameSession}
              onDelete={deleteSessions}
            />

            {appliedPatchSummary && (
              <AppliedPatchSummary
                text={text}
                language={language}
                patch={appliedPatchSummary.patch}
                before={appliedPatchSummary.before}
                labels={resourceLabels}
                onDismiss={dismissAppliedPatch}
              />
            )}

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
                          onApplyPatch={(patch) =>
                            applySuggestedPatch(patch, "assist-patch")
                          }
                          appliedKeys={appliedPatchKeys}
                          canApplyPatch={Boolean(currentAgentId)}
                        />
                      );
                    })()}
                </article>
              ))}
              {pendingUserMessage && (
                <div ref={pendingMessageRef}>
                  <article className="copilot-message is-user">
                    <span className="copilot-message-role">Admin</span>
                    <p>{pendingUserMessage}</p>
                  </article>
                  <article
                    aria-busy="true"
                    className="copilot-message is-assistant is-pending"
                  >
                    <span className="copilot-message-role">{text.title}</span>
                    <p className="copilot-thinking">
                      <span aria-hidden="true" />
                      <span aria-hidden="true" />
                      <span aria-hidden="true" />
                      {text.thinking}
                    </p>
                  </article>
                </div>
              )}
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

            {appliedProposalSummary && view === "build" && (
              <AppliedProposalBanner
                text={text}
                title={appliedProposalSummary.title}
                detail={appliedProposalSummary.detail}
                onDismiss={() => setAppliedProposalSummary(undefined)}
              />
            )}

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
                    !event.shiftKey &&
                    !event.altKey &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.nativeEvent.isComposing
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
                {text.send}
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

const RECENT_SESSION_LIMIT = 5;

function SessionHistoryPicker({
  text,
  sessions,
  activeSessionId,
  busy,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: {
  text: (typeof copy)[Language];
  sessions: CopilotSessionSummary[];
  activeSessionId?: string;
  busy: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => Promise<boolean>;
  onDelete: (ids: string[]) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string>();
  const [renameValue, setRenameValue] = useState("");
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const pickerRef = useRef<HTMLDivElement>(null);

  const orderedSessions = useMemo(
    () =>
      [...sessions].sort(
        (left, right) =>
          Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
      ),
    [sessions],
  );
  const visibleSessions = expanded
    ? orderedSessions
    : orderedSessions.slice(0, RECENT_SESSION_LIMIT);
  const hiddenSessionCount = Math.max(
    0,
    orderedSessions.length - RECENT_SESSION_LIMIT,
  );
  const activeSession = orderedSessions.find(
    (session) => session.id === activeSessionId,
  );
  const allSessionsSelected =
    orderedSessions.length > 0 &&
    orderedSessions.every((session) => selectedIds.has(session.id));

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !pickerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    const currentIds = new Set(sessions.map((session) => session.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => currentIds.has(id)));
      return next.size === current.size ? current : next;
    });
    if (renamingId && !currentIds.has(renamingId)) {
      setRenamingId(undefined);
      setRenameValue("");
    }
  }, [renamingId, sessions]);

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllSessions = () => {
    setSelectedIds(
      allSessionsSelected
        ? new Set()
        : new Set(orderedSessions.map((session) => session.id)),
    );
  };

  const beginRename = (session: CopilotSessionSummary) => {
    setRenamingId(session.id);
    setRenameValue(session.title);
    setPendingDeleteIds([]);
  };

  const submitRename = async () => {
    const title = renameValue.trim();
    if (!renamingId || !title || busy) return;
    const saved = await onRename(renamingId, title);
    if (saved) {
      setRenamingId(undefined);
      setRenameValue("");
    }
  };

  const confirmDelete = async () => {
    if (pendingDeleteIds.length === 0 || busy) return;
    const deleted = await onDelete(pendingDeleteIds);
    if (deleted) {
      setSelectedIds((current) => {
        const next = new Set(current);
        pendingDeleteIds.forEach((id) => next.delete(id));
        return next;
      });
      setPendingDeleteIds([]);
    }
  };

  return (
    <div className="copilot-session-bar">
      <div className="copilot-history-picker" ref={pickerRef}>
        <button
          type="button"
          className="copilot-history-trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="copilot-history-trigger-label">
            <Icon name="clock" size={15} />
            <span>{activeSession?.title || text.history}</span>
          </span>
          <Icon
            name="chevron-down"
            size={15}
            className={open ? "is-open" : undefined}
          />
        </button>

        {open && (
          <div
            className="copilot-history-popover"
            role="dialog"
            aria-label={text.history}
          >
            {pendingDeleteIds.length > 0 ? (
              <div className="copilot-history-confirm">
                <p>
                  {pendingDeleteIds.length === 1
                    ? text.confirmDeleteOne
                    : text.confirmDeleteMany.replace(
                        "{count}",
                        String(pendingDeleteIds.length),
                      )}
                </p>
                <div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setPendingDeleteIds([])}
                    disabled={busy}
                  >
                    {text.cancel}
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => void confirmDelete()}
                    disabled={busy}
                  >
                    <Icon name="trash" size={14} />
                    {text.delete}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="copilot-history-toolbar">
                  <strong>{text.history}</strong>
                  <div className="copilot-history-toolbar-actions">
                    <button
                      type="button"
                      className="copilot-history-select-all secondary"
                      onClick={toggleAllSessions}
                      aria-pressed={allSessionsSelected}
                      disabled={busy || orderedSessions.length === 0}
                    >
                      {allSessionsSelected
                        ? text.clearSelection
                        : text.selectAll}
                    </button>
                    <button
                      type="button"
                      className="copilot-history-delete-selected danger"
                      onClick={() => setPendingDeleteIds([...selectedIds])}
                      disabled={busy || selectedIds.size === 0}
                    >
                      <Icon name="trash" size={13} />
                      {text.deleteSelected.replace(
                        "{count}",
                        String(selectedIds.size),
                      )}
                    </button>
                  </div>
                </div>

                {visibleSessions.length === 0 ? (
                  <p className="copilot-history-empty">{text.noSessions}</p>
                ) : (
                  <div className="copilot-history-list">
                    {visibleSessions.map((session) => (
                      <div
                        className={
                          session.id === activeSessionId
                            ? "copilot-history-item is-active"
                            : "copilot-history-item"
                        }
                        key={session.id}
                      >
                        {renamingId === session.id ? (
                          <form
                            className="copilot-history-rename"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void submitRename();
                            }}
                          >
                            <input
                              autoFocus
                              value={renameValue}
                              maxLength={200}
                              aria-label={text.renameSession}
                              onChange={(event) =>
                                setRenameValue(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  setRenamingId(undefined);
                                  setRenameValue("");
                                }
                              }}
                            />
                            <button
                              type="submit"
                              aria-label={text.renameSave}
                              title={text.renameSave}
                              disabled={busy || !renameValue.trim()}
                            >
                              <Icon name="check" size={14} />
                            </button>
                            <button
                              type="button"
                              aria-label={text.renameCancel}
                              title={text.renameCancel}
                              onClick={() => {
                                setRenamingId(undefined);
                                setRenameValue("");
                              }}
                              disabled={busy}
                            >
                              <Icon name="close" size={14} />
                            </button>
                          </form>
                        ) : (
                          <>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(session.id)}
                              aria-label={`${text.deleteSession}: ${session.title}`}
                              onChange={() => toggleSelected(session.id)}
                              disabled={busy}
                            />
                            <button
                              type="button"
                              className="copilot-history-open"
                              onClick={() => {
                                onSelect(session.id);
                                setOpen(false);
                              }}
                              disabled={busy}
                            >
                              <span title={session.title}>{session.title}</span>
                              <time>{formatDateTime(session.updatedAt)}</time>
                            </button>
                            <button
                              type="button"
                              className="copilot-history-icon"
                              onClick={() => beginRename(session)}
                              aria-label={text.renameSession}
                              title={text.renameSession}
                              disabled={busy}
                            >
                              <Icon name="edit" size={14} />
                            </button>
                            <button
                              type="button"
                              className="copilot-history-icon danger"
                              onClick={() => setPendingDeleteIds([session.id])}
                              aria-label={text.deleteSession}
                              title={text.deleteSession}
                              disabled={busy}
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {hiddenSessionCount > 0 && (
                  <button
                    type="button"
                    className="copilot-history-expand"
                    onClick={() => setExpanded((current) => !current)}
                  >
                    {expanded
                      ? text.collapseSessions
                      : text.expandSessions.replace(
                          "{count}",
                          String(hiddenSessionCount),
                        )}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        className="secondary copilot-new-session"
        onClick={onNew}
        aria-label={text.newSession}
        title={text.newSession}
        disabled={busy}
      >
        <Icon name="plus" size={15} />
      </button>
    </div>
  );
}

function AssistantDetails({
  text,
  payload,
  onApplyPatch,
  canApplyPatch,
  appliedKeys,
}: {
  text: (typeof copy)[Language];
  payload?: CopilotRespondResult;
  onApplyPatch: (patch?: Record<string, unknown>, key?: string) => void;
  canApplyPatch: boolean;
  appliedKeys: Set<string>;
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
              onClick={() => onApplyPatch(changes, "assist-patch")}
              disabled={!canApplyPatch || appliedKeys.has("assist-patch")}
            >
              <Icon name="edit" size={14} />
              {appliedKeys.has("assist-patch") ? text.applied : text.applyPatch}
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

function RunProgressPanel({
  text,
  tracker,
  onCancel,
  onDismiss,
}: {
  text: (typeof copy)[Language];
  tracker: ValidationRunTracker;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const total = tracker.items.length;
  const settled = tracker.items.filter(
    (item) => item.state !== "queued" && item.state !== "running",
  ).length;
  const passed = tracker.items.filter((item) => item.state === "passed").length;
  const failed = tracker.items.filter((item) => item.state === "failed").length;
  const running = tracker.items.find((item) => item.state === "running");
  const percent = total === 0 ? 0 : Math.round((settled / total) * 100);
  const heading = tracker.finished
    ? tracker.cancelled
      ? text.runCancelled
      : text.runFinished
    : text.runStep
        .replace(
          "{current}",
          String(Math.min(settled + (running ? 1 : 0), total)),
        )
        .replace("{total}", String(total));

  return (
    <section className="copilot-run-panel" aria-live="polite">
      <div className="copilot-run-head">
        <span className="copilot-run-title">
          {tracker.finished ? (
            <Icon name={failed > 0 ? "alert" : "check"} size={14} />
          ) : (
            <Icon name="refresh" size={14} className="copilot-run-spin" />
          )}
          {heading}
        </span>
        <span className="copilot-run-elapsed">
          <Icon name="clock" size={12} />
          {formatElapsed(tracker.elapsedMs)}
        </span>
        {tracker.active ? (
          <button
            type="button"
            className="secondary"
            onClick={onCancel}
            disabled={tracker.stopping}
          >
            {tracker.stopping ? text.runStopping : text.runStop}
          </button>
        ) : (
          <button
            type="button"
            className="copilot-applied-dismiss"
            onClick={onDismiss}
            title={text.close}
          >
            <Icon name="close" size={14} />
          </button>
        )}
      </div>

      <div
        className="copilot-run-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={settled}
      >
        <i style={{ width: `${percent}%` }} />
      </div>

      <ul className="copilot-run-list">
        {tracker.items.map((item) => (
          <li key={item.key} className={`copilot-run-item is-${item.state}`}>
            <span className="copilot-run-icon">
              <Icon
                name={runStateIcon(item.state)}
                size={12}
                className={
                  item.state === "running" ? "copilot-run-spin" : undefined
                }
              />
            </span>
            <span className="copilot-run-body">
              <strong>{item.title}</strong>
              {item.state === "failed" && item.detail ? (
                <small>{item.detail}</small>
              ) : null}
            </span>
            <em>{runStateLabel(item.state, text)}</em>
          </li>
        ))}
      </ul>

      {tracker.finished ? (
        <p className="copilot-run-summary">
          {text.runSummary
            .replace("{passed}", String(passed))
            .replace("{failed}", String(failed))
            .replace("{total}", String(total))}
          {tracker.cancelled ? ` ${text.runCancelHint}` : ""}
        </p>
      ) : (
        <p className="copilot-run-note">{text.runHint}</p>
      )}
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
  runTracker,
  onStatic,
  onGenerate,
  onRun,
  onCancelRun,
  onDismissRun,
  onToggleCase,
  onSelectAll,
  onClearSelection,
  onApplyPatch,
  appliedPatchSummary,
  appliedPatchKeys,
  resourceLabels,
  onDismissAppliedPatch,
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
  runTracker?: ValidationRunTracker;
  onStatic: () => void;
  onGenerate: () => void;
  onRun: () => void;
  onCancelRun: () => void;
  onDismissRun: () => void;
  onToggleCase: (index: number) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onApplyPatch: (patch?: Record<string, unknown>, key?: string) => void;
  appliedPatchSummary?: {
    patch: Record<string, unknown>;
    before: Record<string, unknown>;
  };
  appliedPatchKeys: Set<string>;
  resourceLabels?: Record<string, string>;
  onDismissAppliedPatch: () => void;
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

      {appliedPatchSummary && (
        <AppliedPatchSummary
          text={text}
          language={language}
          patch={appliedPatchSummary.patch}
          before={appliedPatchSummary.before}
          labels={resourceLabels}
          onDismiss={onDismissAppliedPatch}
        />
      )}

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

      {runTracker && (
        <RunProgressPanel
          text={text}
          tracker={runTracker}
          onCancel={onCancelRun}
          onDismiss={onDismissRun}
        />
      )}

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
                {issue.patch &&
                  Object.keys(issue.patch).length > 0 &&
                  (() => {
                    const issueKey = `static-${issue.code}-${index}`;
                    const issueApplied = appliedPatchKeys.has(issueKey);
                    return (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => onApplyPatch(issue.patch, issueKey)}
                        disabled={issueApplied}
                      >
                        {issueApplied ? text.applied : text.applyIssuePatch}
                      </button>
                    );
                  })()}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="copilot-validation-section">
        <div className="copilot-section-heading copilot-case-heading">
          <h3>{text.generateCases}</h3>
          <div className="copilot-case-controls">
            <span>
              {text.selectedCount.replace(
                "{count}",
                String(selectedCases.size),
              )}
            </span>
            <button
              type="button"
              className="secondary"
              onClick={onSelectAll}
              disabled={
                Boolean(busy) ||
                cases.length === 0 ||
                selectedCases.size === cases.length
              }
            >
              {text.selectAll}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={onClearSelection}
              disabled={Boolean(busy) || selectedCases.size === 0}
            >
              {text.clearSelection}
            </button>
          </div>
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
                        Object.keys(result.suggestedPatch).length > 0 &&
                        (() => {
                          const caseKey = `case-${index}`;
                          const caseApplied = appliedPatchKeys.has(caseKey);
                          return (
                            <button
                              type="button"
                              className="secondary"
                              onClick={() =>
                                onApplyPatch(result.suggestedPatch, caseKey)
                              }
                              disabled={caseApplied}
                            >
                              {caseApplied
                                ? text.applied
                                : text.applyIssuePatch}
                            </button>
                          );
                        })()}
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
