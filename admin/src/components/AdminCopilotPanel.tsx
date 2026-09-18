import {
  type ComponentPropsWithoutRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import type { Language } from "../i18n/translations";
import {
  applyCopilotProposal,
  cancelCopilotResponse,
  cancelValidationStream,
  createCopilotSession,
  deleteCopilotSessions,
  generateAgentValidationRemediation,
  generateAgentValidationCases,
  getCopilotSession,
  listAgentValidationHistory,
  listCopilotSessions,
  saveCopilotSessionState,
  streamCopilotResponse,
  streamValidateAgentBehavior,
  updateCopilotSession,
  validateAgentStatic,
  type AgentValidationCase,
  type AgentValidationHistoryItem,
  type AgentValidationIssue,
  type AgentValidationRemediation,
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
type ValidationSection = "issues" | "cases" | "remediation" | "history";
type ValidationCaseFilter = "all" | "failed" | "passed";
type ValidationStep = "static" | "cases" | "behavior";

type CaseRunState = "queued" | "running" | "passed" | "failed" | "skipped";

type ValidationRunItem = {
  key: string;
  caseId?: string;
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

type ValidationSessionState = {
  agentId?: string;
  section?: ValidationSection;
  report?: AgentValidationReport;
  cases?: AgentValidationCase[];
  selectedCaseIds?: string[];
  remediation?: AgentValidationRemediation;
};

type AppliedPatchRecord = {
  patch: Record<string, unknown>;
  before: Record<string, unknown>;
};

type ChatRunState = {
  sessionId: string;
  runId?: string;
  phase?: string;
  canceling: boolean;
};

type FailedChatMessage = {
  sessionId?: string;
  content: string;
};

const DEFAULT_PANEL_WIDTH = 430;
const MIN_PANEL_WIDTH = 360;
const MAX_PANEL_WIDTH = 900;
const MIN_MAIN_CONTENT_WIDTH = 420;
const PANEL_WIDTH_STORAGE_KEY = "admin-copilot-width";
const PANEL_VIEW_STORAGE_KEY = "admin-copilot-view";
const ACTIVE_SESSION_STORAGE_KEY = "admin-copilot-active-session";
const APPLIED_PATCH_STORAGE_KEY = "admin-copilot-applied-patches";

function activeSessionStorageKey(mode: CopilotMode) {
  return `${ACTIVE_SESSION_STORAGE_KEY}:${mode}`;
}

function appliedPatchStorageKey(agentId?: string) {
  return agentId ? `${APPLIED_PATCH_STORAGE_KEY}:${agentId}` : "";
}

function validationCaseKey(item: AgentValidationCase, index: number) {
  return item.caseId?.trim() || `index-${index}`;
}

function sessionSortValue(session: CopilotSessionSummary) {
  return (session.pinned ? 1 : 0) * 10 ** 15 + Date.parse(session.updatedAt);
}

function validationSessionPreview(
  session: CopilotSessionSummary,
  text: (typeof copy)[Language],
) {
  const summary = session.stateSummary;
  if (summary?.testsRun) {
    return text.validationSummary
      .replace("{run}", String(summary.testsRun))
      .replace("{passed}", String(summary.testsPassed ?? 0));
  }
  if (summary?.caseCount) {
    return text.validationCasesReady.replace(
      "{count}",
      String(summary.caseCount),
    );
  }
  return text.noValidationActivity;
}

function validationSummaryFromState(
  state?: Record<string, unknown>,
): CopilotSessionSummary["stateSummary"] {
  const validation = state as ValidationSessionState | undefined;
  const cases = Array.isArray(validation?.cases) ? validation.cases : [];
  const summary = validation?.report?.summary;
  return {
    caseCount: cases.length,
    testsRun: summary?.testsRun ?? 0,
    testsPassed: summary?.testsPassed ?? 0,
  };
}

function isPanelView(value: string | null): value is PanelView {
  return value === "assist" || value === "build" || value === "validate";
}

function panelMode(view: PanelView): CopilotMode {
  if (view === "build") return "BUILD";
  if (view === "validate") return "VALIDATE";
  return "ASSIST";
}

function sameAgentId(left?: string | null, right?: string | null): boolean {
  return (left ?? "") === (right ?? "");
}

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
  currentAgentVersion?: number;
  currentAgentSnapshot: Record<string, unknown>;
  onClose: () => void;
  onApplyPatch: (changes: Record<string, unknown>) => void;
  onAppliedAgent: (agentId: string) => void;
  onResourcesChanged: () => void;
  resourceLabels?: Record<string, string>;
  agentConfigDirty?: boolean;
  onSaveDraft?: () => Promise<boolean> | boolean;
  onPublishDraft?: () => void;
};

const copy = {
  zh: {
    title: "AI 工作台",
    subtitle: "辅助配置、生成 Agent 和验证执行效果",
    workspaceMode: "工作模式",
    assist: "助手",
    build: "生成 Agent",
    validate: "验证 Agent",
    close: "关闭",
    resizePanel: "拖动调整 AI 工作台宽度，双击恢复默认",
    history: "会话历史",
    newSession: "新会话",
    noSessions: "发送第一条消息后会创建会话并保存在这里。",
    emptyTitle: "从这里开始",
    noValidationActivity: "尚未执行验证",
    noValidationSessions: "暂无验证会话，执行验证时会自动创建。",
    validationSummary: "已验证 {run} 个场景，通过 {passed} 个",
    validationCasesReady: "已生成 {count} 个场景，待执行",
    renameSession: "重命名",
    renameCurrentSession: "重命名当前会话",
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
    inputPlaceholder: "描述要修改的内容，或粘贴报错信息…",
    inputPlaceholderBuild: "描述你想创建的 Agent、目标和使用场景…",
    send: "发送",
    sendMessage: "发送消息",
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
    suggestedChange: "修改建议（{count} 项）",
    staticSuggestion: "静态检查修改建议",
    scenarioSuggestion: "本场景修改建议",
    reviewBeforeApply: "请先核对改前与改后内容，再决定是否应用。",
    applyThisPatch: "应用此建议",
    undo: "撤销",
    patchUndone: "已撤销本次修改，表单已恢复为应用前内容。",
    patchUndoUnavailable: "后续修改已覆盖这些字段，不能安全撤销此项。",
    remediationTitle: "完整修订候选",
    remediationGuide:
      "基于全部 {count} 个未通过场景和当前系统提示词，生成一份可直接替换的完整修订。",
    generateRemediation: "生成完整修订",
    generatingRemediation: "生成修订中…",
    remediationSource: "来源：{count} 个未通过场景",
    pass: "通过",
    fail: "未通过",
    actualResponse: "实际回答",
    reason: "评估说明",
    historyTitle: "最近验证",
    status: "状态",
    emptyHistory: "暂无验证记录。",
    historyShow: "查看详情",
    historyHide: "收起详情",
    historyUnavailable: "历史报告内容不可用，可能由旧版本生成。",
    historyReadOnlyHint:
      "历史建议仅用于追溯；如需修改，请重新运行验证后再应用。",
    historyStaticIssues: "静态检查记录",
    historyCases: "场景结果",
    statusStaticComplete: "静态检查完成",
    statusComplete: "已完成",
    statusCanceled: "已中止",
    statusRunning: "执行中",
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
    statusReady: "待确认",
    modeAssistDesc: "修改当前 Agent 的提示词、模型、工具等配置。",
    modeBuildDesc: "从零描述需求，生成未发布的 Agent 草案。",
    modeValidateDesc: "检查配置风险、生成场景并运行行为验证。",
    validateNoAgent: "请先在左侧打开或选择一个 Agent，再使用验证功能。",
    validateGuide: "步骤：① 静态检查　② 生成场景　③ 勾选并执行",
    runDisabledHint: "请先生成场景并勾选至少一个再执行",
    inputHint: "Enter 发送 · Shift + Enter 换行",
    saveForm: "保存表单",
    saveDraft: "保存草稿",
    saveAndPublish: "保存并发布",
    contextAssist: "正在修改",
    contextBuild: "将创建",
    contextValidate: "验证对象",
    contextNoAgent: "未选择 Agent",
    contextUnsaved: "有未保存修改",
    contextSaved: "已保存",
    validationDirtyTitle: "当前表单有未保存修改",
    validationDirtyDesc:
      "验证使用后端已保存的 Agent 版本。继续验证不会包含当前未保存内容。",
    saveAndValidate: "保存并验证",
    validateSavedVersion: "验证已保存版本",
    validationSaveFailed: "保存失败，已取消验证。",
    runFailedCases: "重跑未通过场景",
    validationIssues: "静态问题",
    validationCases: "验证场景",
    validationRemediation: "修订建议",
    validationHistory: "历史记录",
    filterAll: "全部",
    filterFailed: "未通过",
    filterPassed: "通过",
    expandCase: "展开场景",
    collapseCase: "收起场景",
    editCaseInput: "场景输入",
    editCaseExpected: "预期标准",
    streaming: "正在生成",
    cancelGeneration: "停止生成",
    cancelingGeneration: "正在停止…",
    generationCancelled: "已停止生成，本轮不会写入会话。",
    retryMessage: "重试",
    copyMessage: "复制",
    copiedMessage: "已复制。",
    editAndResend: "编辑后重发",
    newMessages: "有新消息",
    searchSessions: "搜索会话",
    pinSession: "置顶",
    unpinSession: "取消置顶",
    noMatchingSessions: "没有匹配的会话。",
    lastMessage: "最后消息",
    exportHistory: "导出报告",
    selectFieldsToApply: "选择要应用的字段",
    noFieldsSelected: "请至少选择一个字段。",
    validationSavedVersion: "已保存版本 v{version}",
    validationDraftVersion: "当前未保存草稿 v{version}",
  },
  en: {
    title: "AI Workspace",
    subtitle: "Configure, generate, and validate agents",
    workspaceMode: "Workspace mode",
    assist: "Assist",
    build: "Build Agent",
    validate: "Validate",
    close: "Close",
    resizePanel: "Drag to resize the AI workspace; double-click to reset",
    history: "Session history",
    newSession: "New session",
    noSessions: "Send the first message to create and save a session here.",
    emptyTitle: "Start here",
    noValidationActivity: "No validation activity yet",
    noValidationSessions:
      "No validation sessions yet. One is created when validation starts.",
    validationSummary: "{passed} of {run} scenarios passed",
    validationCasesReady: "{count} scenarios ready to run",
    renameSession: "Rename",
    renameCurrentSession: "Rename current session",
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
    inputPlaceholder: "Describe the change or paste an error…",
    inputPlaceholderBuild:
      "Describe the Agent you want, its goal, and its use cases…",
    send: "Send",
    sendMessage: "Send message",
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
    suggestedChange: "Suggested change ({count})",
    staticSuggestion: "Static-check suggestion",
    scenarioSuggestion: "Scenario suggestion",
    reviewBeforeApply: "Review the before and after values before applying.",
    applyThisPatch: "Apply this suggestion",
    undo: "Undo",
    patchUndone: "The change was undone and the form was restored.",
    patchUndoUnavailable:
      "Later edits overlap these fields, so this change cannot be undone safely.",
    remediationTitle: "Complete revision",
    remediationGuide:
      "Build one complete replacement from all {count} failed scenarios and the current system prompt.",
    generateRemediation: "Generate complete revision",
    generatingRemediation: "Generating revision…",
    remediationSource: "Source: {count} failed scenarios",
    pass: "Passed",
    fail: "Failed",
    actualResponse: "Actual response",
    reason: "Evaluation",
    historyTitle: "Recent validations",
    status: "Status",
    emptyHistory: "No validation history.",
    historyShow: "View details",
    historyHide: "Hide details",
    historyUnavailable:
      "The stored report is unavailable, possibly from an older version.",
    historyReadOnlyHint:
      "Historical suggestions are read-only. Re-run validation before applying changes.",
    historyStaticIssues: "Static-check record",
    historyCases: "Scenario results",
    statusStaticComplete: "Static check complete",
    statusComplete: "Complete",
    statusCanceled: "Cancelled",
    statusRunning: "Running",
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
    statusReady: "Ready",
    modeAssistDesc:
      "Change the current Agent's prompt, model, tools, and config.",
    modeBuildDesc: "Describe a new Agent and draft it from scratch.",
    modeValidateDesc:
      "Inspect risks, generate scenarios, and run behavioral checks.",
    validateNoAgent:
      "Open or select an Agent on the left before using validation.",
    validateGuide:
      "Steps: ① Static check　② Generate scenarios　③ Select & run",
    runDisabledHint:
      "Generate scenarios and select at least one before running",
    inputHint: "Enter to send · Shift + Enter for newline",
    saveForm: "Save form",
    saveDraft: "Save draft",
    saveAndPublish: "Save & publish",
    contextAssist: "Editing",
    contextBuild: "Creating",
    contextValidate: "Validating",
    contextNoAgent: "No Agent selected",
    contextUnsaved: "Unsaved changes",
    contextSaved: "Saved",
    validationDirtyTitle: "The form has unsaved changes",
    validationDirtyDesc:
      "Validation uses the saved Agent version and will not include unsaved form changes.",
    saveAndValidate: "Save and validate",
    validateSavedVersion: "Validate saved version",
    validationSaveFailed: "Save failed. Validation was cancelled.",
    runFailedCases: "Re-run failed scenarios",
    validationIssues: "Static issues",
    validationCases: "Scenarios",
    validationRemediation: "Remediation",
    validationHistory: "History",
    filterAll: "All",
    filterFailed: "Failed",
    filterPassed: "Passed",
    expandCase: "Expand scenario",
    collapseCase: "Collapse scenario",
    editCaseInput: "Scenario input",
    editCaseExpected: "Expected result",
    streaming: "Generating",
    cancelGeneration: "Stop generating",
    cancelingGeneration: "Stopping…",
    generationCancelled: "Generation stopped. This turn was not saved.",
    retryMessage: "Retry",
    copyMessage: "Copy",
    copiedMessage: "Copied.",
    editAndResend: "Edit and resend",
    newMessages: "New messages",
    searchSessions: "Search sessions",
    pinSession: "Pin",
    unpinSession: "Unpin",
    noMatchingSessions: "No matching sessions.",
    lastMessage: "Last message",
    exportHistory: "Export report",
    selectFieldsToApply: "Select fields to apply",
    noFieldsSelected: "Select at least one field.",
    validationSavedVersion: "Saved version v{version}",
    validationDraftVersion: "Unsaved draft v{version}",
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

function readStorageJson<T>(storage: Storage, key: string): T | undefined {
  return parseJson<T>(storage.getItem(key) ?? undefined);
}

function writeStorageJson(storage: Storage, key: string, value: unknown) {
  storage.setItem(key, JSON.stringify(value));
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return nodeText(
      (node as { props?: { children?: ReactNode } }).props?.children,
    );
  }
  return "";
}

function CopilotMarkdown({
  children,
  text,
}: {
  children: string;
  text: (typeof copy)[Language];
}) {
  return (
    <div className="copilot-message-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          pre({ children }) {
            const value = nodeText(children);
            return (
              <div className="copilot-code-block">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(value).then(() => {
                      toast.success(text.copiedMessage);
                    });
                  }}
                >
                  <Icon name="copy" size={13} />
                  {text.copyMessage}
                </button>
                <pre>{children}</pre>
              </div>
            );
          },
          a({ children, ...props }) {
            return (
              <a {...props} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
          code({
            className,
            children,
            ...props
          }: ComponentPropsWithoutRef<"code">) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
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

function getFocusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getClientRects().length > 0);
}

function patchRunItem(
  tracker: ValidationRunTracker,
  caseId: string,
  patch: Partial<ValidationRunItem>,
) {
  return {
    ...tracker,
    items: tracker.items.map((item) =>
      item.caseId === caseId ? { ...item, ...patch } : item,
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

function historyStatusLabel(status: string, text: (typeof copy)[Language]) {
  if (status === "STATIC_COMPLETE") return text.statusStaticComplete;
  if (status === "COMPLETE") return text.statusComplete;
  if (status === "CANCELED") return text.statusCanceled;
  if (status === "RUNNING") return text.statusRunning;
  return status;
}

function ValidationHistoryDetails({
  text,
  language,
  item,
  onExport,
}: {
  text: (typeof copy)[Language];
  language: Language;
  item: AgentValidationHistoryItem;
  onExport: () => void;
}) {
  const report = parseJson<AgentValidationReport>(item.reportJson);
  if (!report) {
    return (
      <p className="copilot-history-unavailable">{text.historyUnavailable}</p>
    );
  }
  const staticIssues = Array.isArray(report.staticIssues)
    ? report.staticIssues
    : [];
  const validationCases = Array.isArray(report.cases) ? report.cases : [];
  const summary = report.summary ?? {
    issueCount: staticIssues.length,
    critical: 0,
    error: 0,
    warning: 0,
    info: 0,
    testsRun: validationCases.length,
    testsPassed: validationCases.filter((item) => item?.passed).length,
    testsFailed: validationCases.filter((item) => item?.passed === false)
      .length,
  };
  return (
    <div className="copilot-history-detail">
      <div className="copilot-history-summary">
        <span className="copilot-history-summary-main">
          <Icon name={summary.testsFailed > 0 ? "alert" : "check"} size={14} />
          {text.runSummary
            .replace("{passed}", String(summary.testsPassed))
            .replace("{failed}", String(summary.testsFailed))
            .replace("{total}", String(summary.testsRun))}
        </span>
        {summary.issueCount > 0 && (
          <span>
            {text.staticCheck}: {summary.issueCount}
          </span>
        )}
        <button type="button" className="secondary" onClick={onExport}>
          <Icon name="copy" size={13} />
          {text.exportHistory}
        </button>
      </div>
      <p className="copilot-history-readonly">{text.historyReadOnlyHint}</p>

      {staticIssues.length > 0 && (
        <section className="copilot-history-block">
          <strong>{text.historyStaticIssues}</strong>
          <ul>
            {staticIssues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>
                <span>{severityLabel(issue.severity, language)}</span>
                <div>
                  <b>{issue.title}</b>
                  <p>{issue.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {validationCases.length > 0 && (
        <section className="copilot-history-block">
          <strong>{text.historyCases}</strong>
          <div className="copilot-history-cases">
            {validationCases.map((item, index) => (
              <article
                className={
                  item.passed
                    ? "copilot-history-case is-pass"
                    : "copilot-history-case is-fail"
                }
                key={`${item.title}-${index}`}
              >
                <div className="copilot-history-case-head">
                  <Icon name={item.passed ? "check" : "close"} size={14} />
                  <strong>{item.title}</strong>
                  <em>{item.passed ? text.pass : text.fail}</em>
                </div>
                <p>
                  <b>{text.input}:</b> {item.input}
                </p>
                <p>
                  <b>{text.expected}:</b> {item.expected}
                </p>
                {item.reason && (
                  <p>
                    <b>{text.reason}:</b> {item.reason}
                  </p>
                )}
                {item.actualResponse && <pre>{item.actualResponse}</pre>}
                {item.suggestedPatch &&
                  Object.keys(item.suggestedPatch).length > 0 && (
                    <div className="copilot-history-suggestion">
                      <strong>{text.scenarioSuggestion}</strong>
                      {Object.entries(item.suggestedPatch).map(
                        ([field, value]) => (
                          <div key={field}>
                            <span>
                              {FIELD_LABELS[field]?.[language] ?? field}
                            </span>
                            <pre>{formatPatchValue(value, field)}</pre>
                          </div>
                        ),
                      )}
                    </div>
                  )}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
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

function patchValueEqual(field: string, left: unknown, right: unknown) {
  if (ID_LIST_FIELDS.has(field)) {
    return (
      normalizeIdList(left).join("\u0000") ===
      normalizeIdList(right).join("\u0000")
    );
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
  }
  if (
    (left !== null && typeof left === "object") ||
    (right !== null && typeof right === "object")
  ) {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  }
  return String(left ?? "") === String(right ?? "");
}

function patchEntries(patch: Record<string, unknown>) {
  return Object.entries(patch).filter(([field]) => field !== "agentId");
}

function changedPatchEntries(
  patch: Record<string, unknown>,
  before: Record<string, unknown>,
) {
  return patchEntries(patch).filter(
    ([field, value]) => !patchValueEqual(field, value, before[field]),
  );
}

function canUndoPatch(
  record: AppliedPatchRecord,
  current: Record<string, unknown>,
) {
  return patchEntries(record.patch).every(
    ([field, value]) =>
      patchValueEqual(field, current[field], value) ||
      patchValueEqual(field, current[field], record.before[field]),
  );
}

function PatchDiffList({
  text,
  language,
  patch,
  before,
  labels,
  selectedFields,
  onToggleField,
}: {
  text: (typeof copy)[Language];
  language: Language;
  patch: Record<string, unknown>;
  before: Record<string, unknown>;
  labels?: Record<string, string>;
  selectedFields?: Set<string>;
  onToggleField?: (field: string) => void;
}) {
  const entries = changedPatchEntries(patch, before);
  if (entries.length === 0) return null;
  return (
    <ul className="copilot-applied-list">
      {entries.map(([field, value]) => (
        <li key={field}>
          <span className="copilot-applied-field">
            {onToggleField && selectedFields && (
              <input
                type="checkbox"
                checked={selectedFields.has(field)}
                onChange={() => onToggleField(field)}
                aria-label={`${text.applyThisPatch}: ${FIELD_LABELS[field]?.[language] ?? field}`}
              />
            )}
            {FIELD_LABELS[field]?.[language] ?? field}
          </span>
          <div className="copilot-applied-diff">
            <div className="copilot-applied-side">
              <span className="copilot-applied-tag">{text.before}</span>
              <PatchValue field={field} value={before[field]} labels={labels} />
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
  );
}

function SuggestedPatchPreview({
  text,
  language,
  title,
  description,
  patch,
  before,
  labels,
  applied,
  canUndo = true,
  canApply = true,
  onApply,
  onUndo,
}: {
  text: (typeof copy)[Language];
  language: Language;
  title: string;
  description?: string;
  patch: Record<string, unknown>;
  before: Record<string, unknown>;
  labels?: Record<string, string>;
  applied: boolean;
  canUndo?: boolean;
  canApply?: boolean;
  onApply: (patch: Record<string, unknown>) => void;
  onUndo: () => void;
}) {
  const entries = changedPatchEntries(patch, before);
  const patchKey = useMemo(
    () => JSON.stringify([patch, before]),
    [patch, before],
  );
  const [selectedFields, setSelectedFields] = useState<Set<string>>(
    () => new Set(entries.map(([field]) => field)),
  );
  useEffect(() => {
    setSelectedFields(new Set(entries.map(([field]) => field)));
  }, [patchKey]);
  const count = entries.length;
  if (count === 0) return null;
  const selectedPatch = Object.fromEntries(
    entries.filter(([field]) => selectedFields.has(field)),
  );
  const toggleField = (field: string) => {
    setSelectedFields((current) => {
      const next = new Set(current);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };
  return (
    <section className="copilot-suggestion" aria-live="polite">
      <div className="copilot-suggestion-heading">
        <strong>{title}</strong>
        <span>{applied ? text.applied : text.reviewBeforeApply}</span>
      </div>
      {description && (
        <p className="copilot-suggestion-description">{description}</p>
      )}
      <PatchDiffList
        text={text}
        language={language}
        patch={patch}
        before={before}
        labels={labels}
        selectedFields={applied ? undefined : selectedFields}
        onToggleField={applied ? undefined : toggleField}
      />
      {!applied && count > 1 && (
        <p className="copilot-suggestion-selection">
          {text.selectFieldsToApply}
        </p>
      )}
      <div className="copilot-suggestion-actions">
        {applied ? (
          <button
            type="button"
            className="secondary"
            onClick={onUndo}
            disabled={!canUndo}
            title={!canUndo ? text.patchUndoUnavailable : undefined}
          >
            <Icon name="undo" size={14} />
            {text.undo}
          </button>
        ) : (
          <button
            type="button"
            className="secondary"
            onClick={() => onApply(selectedPatch)}
            disabled={!canApply || Object.keys(selectedPatch).length === 0}
            title={
              Object.keys(selectedPatch).length === 0
                ? text.noFieldsSelected
                : undefined
            }
          >
            <Icon name="edit" size={14} />
            {text.applyThisPatch}
          </button>
        )}
      </div>
    </section>
  );
}

function AppliedPatchSummary({
  text,
  language,
  patch,
  before,
  labels,
  onDismiss,
  onUndo,
  canUndo = true,
  onSaveDraft,
}: {
  text: (typeof copy)[Language];
  language: Language;
  patch: Record<string, unknown>;
  before: Record<string, unknown>;
  labels?: Record<string, string>;
  onDismiss: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
  onSaveDraft?: () => void;
}) {
  const entries = changedPatchEntries(patch, before);
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
      <PatchDiffList
        text={text}
        language={language}
        patch={patch}
        before={before}
        labels={labels}
      />
      <p className="copilot-applied-hint">{text.appliedPatchHint}</p>
      {(onSaveDraft || onUndo) && (
        <div className="copilot-applied-actions">
          {onUndo && (
            <button
              type="button"
              className="secondary"
              onClick={onUndo}
              disabled={!canUndo}
              title={!canUndo ? text.patchUndoUnavailable : undefined}
            >
              <Icon name="undo" size={14} />
              {text.undo}
            </button>
          )}
          {onSaveDraft && (
            <button type="button" onClick={onSaveDraft}>
              <Icon name="edit" size={14} />
              {text.saveForm}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function AppliedProposalBanner({
  text,
  title,
  detail,
  onDismiss,
  onSaveDraft,
  onPublishDraft,
}: {
  text: (typeof copy)[Language];
  title: string;
  detail: string;
  onDismiss: () => void;
  onSaveDraft?: () => void;
  onPublishDraft?: () => void;
}) {
  return (
    <section className="copilot-applied-banner" aria-live="polite">
      <Icon name="check" size={15} className="copilot-applied-banner-icon" />
      <div className="copilot-applied-banner-body">
        <strong>{title}</strong>
        <p>{detail}</p>
        {(onSaveDraft || onPublishDraft) && (
          <div className="copilot-applied-banner-actions">
            {onSaveDraft && (
              <button type="button" className="secondary" onClick={onSaveDraft}>
                <Icon name="edit" size={14} />
                {text.saveDraft}
              </button>
            )}
            {onPublishDraft && (
              <button type="button" onClick={onPublishDraft}>
                <Icon name="flag" size={14} />
                {text.saveAndPublish}
              </button>
            )}
          </div>
        )}
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

function WorkspaceModePicker({
  view,
  text,
  onChange,
}: {
  view: PanelView;
  text: (typeof copy)[Language];
  onChange: (view: PanelView) => void;
}) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const modes = [
    {
      key: "assist",
      icon: "chat",
      label: text.assist,
      description: text.modeAssistDesc,
    },
    {
      key: "build",
      icon: "sparkle",
      label: text.build,
      description: text.modeBuildDesc,
    },
    {
      key: "validate",
      icon: "check",
      label: text.validate,
      description: text.modeValidateDesc,
    },
  ] as const;
  const active = modes.find((mode) => mode.key === view) ?? modes[0];

  useEffect(() => {
    if (!open) return undefined;
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

  return (
    <div className="copilot-mode-picker" ref={pickerRef}>
      <button
        type="button"
        className="copilot-mode-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="copilot-mode-icon" aria-hidden="true">
          <Icon name={active.icon} size={16} />
        </span>
        <span className="copilot-mode-label">
          <strong>{active.label}</strong>
        </span>
        <Icon
          name="chevron-down"
          size={15}
          className={open ? "is-open" : undefined}
        />
      </button>
      {open && (
        <div
          className="copilot-mode-menu"
          role="menu"
          aria-label={text.workspaceMode}
        >
          {modes.map((mode) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={mode.key === view}
              className={mode.key === view ? "is-active" : undefined}
              onClick={() => {
                if (mode.key !== view) onChange(mode.key);
                setOpen(false);
              }}
              key={mode.key}
            >
              <span className="copilot-mode-icon" aria-hidden="true">
                <Icon name={mode.icon} size={16} />
              </span>
              <span>
                <strong>{mode.label}</strong>
                <small>{mode.description}</small>
              </span>
              {mode.key === view && (
                <Icon name="check" size={15} title={mode.label} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminCopilotPanel({
  language,
  currentAgentId,
  currentAgentName,
  currentAgentVersion,
  currentAgentSnapshot,
  onClose,
  onApplyPatch,
  onAppliedAgent,
  onResourcesChanged,
  resourceLabels,
  agentConfigDirty = false,
  onSaveDraft,
  onPublishDraft,
}: AdminCopilotPanelProps) {
  const text = copy[language];
  const [view, setView] = useState<PanelView>(() => {
    const stored = localStorage.getItem(PANEL_VIEW_STORAGE_KEY);
    return isPanelView(stored) ? stored : "assist";
  });
  const [sessions, setSessions] = useState<CopilotSessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<CopilotSession>();
  const [sessionActionBusy, setSessionActionBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<string>();
  const [chatRun, setChatRun] = useState<ChatRunState>();
  const [failedChatMessage, setFailedChatMessage] =
    useState<FailedChatMessage>();
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const chatAbortRef = useRef<AbortController | undefined>(undefined);
  const messagesShouldStickRef = useRef(true);
  const [applyingProposalId, setApplyingProposalId] = useState<string>();
  const [panelError, setPanelError] = useState("");
  const [validationReport, setValidationReport] =
    useState<AgentValidationReport>();
  const [validationCases, setValidationCases] = useState<AgentValidationCase[]>(
    [],
  );
  const [selectedCases, setSelectedCases] = useState<Set<string>>(new Set());
  const [validationBusy, setValidationBusy] = useState<
    "static" | "cases" | "behavior"
  >();
  const [validationRunTracker, setValidationRunTracker] =
    useState<ValidationRunTracker>();
  const [validationHistory, setValidationHistory] = useState<
    AgentValidationHistoryItem[]
  >([]);
  const [validationSection, setValidationSection] =
    useState<ValidationSection>("issues");
  const [remediation, setRemediation] = useState<AgentValidationRemediation>();
  const [remediationBusy, setRemediationBusy] = useState(false);
  const [appliedPatchSummary, setAppliedPatchSummary] = useState<{
    key?: string;
    patch: Record<string, unknown>;
    before: Record<string, unknown>;
  }>();
  const [appliedPatchRecords, setAppliedPatchRecords] = useState<
    Record<string, AppliedPatchRecord>
  >({});
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
  const appliedPatchAgentRef = useRef<string | undefined>(undefined);
  const patchHydratingRef = useRef(false);
  const validationStateHydratingRef = useRef(false);
  const resizeStateRef = useRef({ active: false, pointerId: -1 });
  const [isModal, setIsModal] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 1200,
  );
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const mode = panelMode(view);
  const appliedPatchKeys = useMemo(
    () => new Set(Object.keys(appliedPatchRecords)),
    [appliedPatchRecords],
  );
  const visibleSessions = useMemo(
    () =>
      sessions.filter(
        (session) =>
          session.mode === mode &&
          (mode !== "VALIDATE" ||
            !currentAgentId ||
            session.currentAgentId === currentAgentId),
      ),
    [currentAgentId, mode, sessions],
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
  const validationSessionState = useMemo<ValidationSessionState>(
    () => ({
      agentId: currentAgentId,
      section: validationSection,
      report: validationReport,
      cases: validationCases,
      selectedCaseIds: [...selectedCases],
      remediation,
    }),
    [
      currentAgentId,
      remediation,
      selectedCases,
      validationCases,
      validationReport,
      validationSection,
    ],
  );

  useEffect(() => {
    void (async () => {
      const values = await loadSessions();
      const nextMode = panelMode(view);
      if (nextMode === "VALIDATE") return;
      const storedId = localStorage.getItem(activeSessionStorageKey(nextMode));
      const candidate =
        values.find(
          (session) => session.id === storedId && session.mode === nextMode,
        ) ?? values.find((session) => session.mode === nextMode);
      if (candidate) await loadSession(candidate.id);
      else setMessage("");
    })();
  }, []);

  useEffect(() => {
    if (
      view !== "validate" ||
      activeSession?.mode !== "VALIDATE" ||
      !activeSession.currentAgentId ||
      !sameAgentId(activeSession.currentAgentId, currentAgentId) ||
      validationStateHydratingRef.current
    ) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      void saveCopilotSessionState(
        activeSession.id,
        validationSessionState as Record<string, unknown>,
      )
        .then((saved) => {
          setSessions((current) =>
            current.map((session) =>
              session.id === saved.id
                ? {
                    ...session,
                    stateSummary: validationSummaryFromState(saved.state),
                    updatedAt: saved.updatedAt,
                  }
                : session,
            ),
          );
        })
        .catch((error) => {
          setPanelError(errorMessage(error, text.error));
        });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [
    activeSession?.currentAgentId,
    activeSession?.id,
    activeSession?.mode,
    currentAgentId,
    text.error,
    validationSessionState,
    view,
  ]);

  useEffect(() => {
    localStorage.setItem(PANEL_VIEW_STORAGE_KEY, view);
  }, [view]);

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
    const syncModal = () => setIsModal(window.innerWidth < 1200);
    window.addEventListener("resize", syncModal);
    return () => window.removeEventListener("resize", syncModal);
  }, []);

  useEffect(() => {
    const root = panelRef.current;
    if (!root) return undefined;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    root.focus();
    return () => {
      const target = previouslyFocusedRef.current;
      if (target && document.contains(target)) target.focus();
    };
  }, []);

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
    setRemediation(undefined);
    setAppliedPatchSummary(undefined);
    setAppliedProposalSummary(undefined);
    setValidationRunTracker(undefined);
    const storedAgentId = appliedPatchAgentRef.current;
    appliedPatchAgentRef.current = currentAgentId;
    patchHydratingRef.current = true;
    setAppliedPatchRecords(
      currentAgentId
        ? (readStorageJson<Record<string, AppliedPatchRecord>>(
            localStorage,
            appliedPatchStorageKey(currentAgentId),
          ) ?? {})
        : {},
    );
    if (!currentAgentId) {
      setValidationHistory([]);
      return;
    }
    if (storedAgentId !== currentAgentId) setAppliedPatchSummary(undefined);
    void loadValidationHistory(currentAgentId);
  }, [currentAgentId]);

  useEffect(() => {
    if (!currentAgentId || appliedPatchAgentRef.current !== currentAgentId) {
      return;
    }
    if (patchHydratingRef.current) {
      patchHydratingRef.current = false;
      return;
    }
    const key = appliedPatchStorageKey(currentAgentId);
    if (Object.keys(appliedPatchRecords).length > 0) {
      writeStorageJson(localStorage, key, appliedPatchRecords);
    } else {
      localStorage.removeItem(key);
    }
  }, [appliedPatchRecords, currentAgentId]);

  useEffect(() => {
    if (view !== "validate") return;
    if (
      activeSession?.mode === "VALIDATE" &&
      sameAgentId(activeSession.currentAgentId, currentAgentId)
    ) {
      return;
    }
    const candidate = sessions
      .filter(
        (session) =>
          session.mode === "VALIDATE" &&
          sameAgentId(session.currentAgentId, currentAgentId),
      )
      .sort(
        (left, right) => sessionSortValue(right) - sessionSortValue(left),
      )[0];
    if (candidate) {
      void loadSession(candidate.id);
    } else if (activeSession?.mode === "VALIDATE") {
      setActiveSession(undefined);
      resetValidationWorkspace();
    }
  }, [activeSession?.id, activeSession?.mode, currentAgentId, sessions, view]);

  useEffect(
    () => () => {
      chatAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!activeSession?.messages.length && !pendingUserMessage) return;
    if (messagesShouldStickRef.current) {
      window.requestAnimationFrame(() => {
        const container = messagesRef.current;
        if (container) container.scrollTop = container.scrollHeight;
      });
    } else {
      setHasNewMessages(true);
    }
  }, [activeSession?.messages.length, pendingUserMessage]);

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

  const resetValidationWorkspace = () => {
    setValidationReport(undefined);
    setValidationCases([]);
    setSelectedCases(new Set());
    setValidationSection("issues");
    setRemediation(undefined);
    setValidationRunTracker(undefined);
  };

  const loadSession = async (id: string) => {
    try {
      const session = await getCopilotSession(id);
      setActiveSession(session);
      localStorage.setItem(activeSessionStorageKey(session.mode), session.id);
      setMessage("");
      setFailedChatMessage(undefined);
      setChatRun(undefined);
      setHasNewMessages(false);
      setPanelError("");
      if (session.mode === "VALIDATE") {
        const state = session.state as ValidationSessionState | undefined;
        validationStateHydratingRef.current = true;
        setValidationSection(
          state?.section === "cases" ||
            state?.section === "remediation" ||
            state?.section === "history"
            ? state.section
            : "issues",
        );
        setValidationReport(state?.report);
        setValidationCases(Array.isArray(state?.cases) ? state.cases : []);
        setSelectedCases(new Set(state?.selectedCaseIds ?? []));
        setRemediation(state?.remediation);
        setValidationRunTracker(undefined);
        if (session.currentAgentId) {
          void loadValidationHistory(session.currentAgentId);
        }
        window.setTimeout(() => {
          validationStateHydratingRef.current = false;
        }, 0);
      }
      return session;
    } catch (error) {
      setPanelError(errorMessage(error, text.sessionFailed));
      return undefined;
    }
  };

  const startSession = async () => {
    try {
      const session = await createCopilotSession(mode, currentAgentId);
      if (session.mode === "VALIDATE") resetValidationWorkspace();
      setActiveSession(session);
      localStorage.setItem(activeSessionStorageKey(mode), session.id);
      setMessage("");
      setFailedChatMessage(undefined);
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
      const updated = await updateCopilotSession(id, { title });
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

  const toggleSessionPinned = async (session: CopilotSessionSummary) => {
    setSessionActionBusy(true);
    setPanelError("");
    try {
      const updated = await updateCopilotSession(session.id, {
        pinned: !session.pinned,
      });
      setSessions((current) =>
        current.map((item) =>
          item.id === session.id
            ? {
                ...item,
                pinned: updated.pinned,
                updatedAt: updated.updatedAt,
              }
            : item,
        ),
      );
      setActiveSession((current) =>
        current?.id === session.id
          ? { ...current, pinned: updated.pinned, updatedAt: updated.updatedAt }
          : current,
      );
      toast.success(session.pinned ? text.unpinSession : text.pinSession);
    } catch (error) {
      setPanelError(errorMessage(error, text.error));
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
        localStorage.removeItem(activeSessionStorageKey(activeSession.mode));
        const replacement = remaining.find(
          (session) =>
            session.mode === activeSession.mode &&
            (activeSession.mode !== "VALIDATE" ||
              !currentAgentId ||
              sameAgentId(session.currentAgentId, currentAgentId)),
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
    localStorage.setItem(PANEL_VIEW_STORAGE_KEY, next);
    const nextMode = panelMode(next);
    const storedId = localStorage.getItem(activeSessionStorageKey(nextMode));
    const candidate =
      sessions.find(
        (session) =>
          session.id === storedId &&
          session.mode === nextMode &&
          (nextMode !== "VALIDATE" ||
            !currentAgentId ||
            sameAgentId(session.currentAgentId, currentAgentId)),
      ) ??
      sessions.find(
        (session) =>
          session.mode === nextMode &&
          (nextMode !== "VALIDATE" ||
            !currentAgentId ||
            sameAgentId(session.currentAgentId, currentAgentId)),
      );
    if (candidate) void loadSession(candidate.id);
    else {
      setActiveSession(undefined);
      if (nextMode === "VALIDATE") resetValidationWorkspace();
      else setMessage("");
    }
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

  const scrollMessagesToBottom = () => {
    messagesShouldStickRef.current = true;
    window.requestAnimationFrame(() => {
      const container = messagesRef.current;
      if (!container) return;
      container.scrollTop = container.scrollHeight;
      setHasNewMessages(false);
    });
  };

  const handleMessagesScroll = () => {
    const container = messagesRef.current;
    if (!container) return;
    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      72;
    messagesShouldStickRef.current = nearBottom;
    if (nearBottom) setHasNewMessages(false);
  };

  const writeComposerDraft = (value: string) => setMessage(value);

  const send = async (contentOverride?: string) => {
    const content = (contentOverride ?? message).trim();
    if (!content || sending) return;
    const container = messagesRef.current;
    const shouldFollow =
      !container ||
      container.scrollHeight - container.scrollTop - container.clientHeight <
        96;
    writeComposerDraft("");
    setFailedChatMessage(undefined);
    setPendingUserMessage(content);
    setSending(true);
    setPanelError("");
    if (shouldFollow) setHasNewMessages(false);

    const abort = new AbortController();
    chatAbortRef.current = abort;
    let session = activeSession;
    let streamError = "";
    let streamCancelled = false;
    try {
      if (!session || session.mode !== mode) {
        session = await startSession();
      }
      if (!session) {
        writeComposerDraft(content);
        setPendingUserMessage(undefined);
        return;
      }
      const sessionId = session.id;
      setChatRun({ sessionId, canceling: false });
      await streamCopilotResponse(
        sessionId,
        content,
        currentAgentId,
        currentAgentContext,
        {
          onRunStart: (payload) =>
            setChatRun((current) =>
              current?.sessionId === sessionId
                ? { ...current, runId: payload.runId }
                : current,
            ),
          onPhase: (payload) =>
            setChatRun((current) =>
              current?.sessionId === sessionId
                ? { ...current, phase: payload.message || payload.phase }
                : current,
            ),
          onCancelled: () => {
            streamCancelled = true;
          },
          onStreamError: (payload) => {
            streamError = payload.message || text.error;
          },
        },
        abort.signal,
      );
      if (streamCancelled || abort.signal.aborted) {
        writeComposerDraft(content);
        toast.info(text.generationCancelled);
        return;
      }
      if (streamError) throw new Error(streamError);
      await loadSession(sessionId);
      await loadSessions();
      scrollMessagesToBottom();
      if (!shouldFollow) setHasNewMessages(true);
    } catch (error) {
      if (abort.signal.aborted) {
        writeComposerDraft(content);
        toast.info(text.generationCancelled);
      } else {
        setPanelError(errorMessage(error, text.error));
        writeComposerDraft(content);
        setFailedChatMessage({
          sessionId: session?.id,
          content,
        });
      }
    } finally {
      setPendingUserMessage(undefined);
      setChatRun(undefined);
      setSending(false);
      if (chatAbortRef.current === abort) chatAbortRef.current = undefined;
    }
  };

  const cancelChatRun = async () => {
    const run = chatRun;
    if (!run || run.canceling) return;
    setChatRun({ ...run, canceling: true });
    try {
      if (run.runId) await cancelCopilotResponse(run.sessionId, run.runId);
    } catch (error) {
      setPanelError(errorMessage(error, text.error));
    } finally {
      chatAbortRef.current?.abort();
    }
  };

  const copyChatMessage = (content: string) => {
    void navigator.clipboard.writeText(content).then(() => {
      toast.success(text.copiedMessage);
    });
  };

  const editAndResend = (content: string) => {
    writeComposerDraft(content);
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(content.length, content.length);
    });
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

  const ensureValidationSession = async () => {
    if (!currentAgentId) return undefined;
    if (
      activeSession?.mode === "VALIDATE" &&
      sameAgentId(activeSession.currentAgentId, currentAgentId)
    ) {
      return activeSession;
    }
    return startSession();
  };

  const runStaticValidation = async () => {
    if (!currentAgentId || validationBusy) return;
    setValidationBusy("static");
    setPanelError("");
    try {
      if (!(await ensureValidationSession())) return;
      setValidationReport(await validateAgentStatic(currentAgentId));
      setValidationCases([]);
      setSelectedCases(new Set());
      setRemediation(undefined);
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
      if (!(await ensureValidationSession())) return;
      const result = await generateAgentValidationCases(currentAgentId);
      setValidationCases(result.cases);
      setSelectedCases(
        new Set(
          result.cases.map((item, index) => validationCaseKey(item, index)),
        ),
      );
      setRemediation(undefined);
    } catch (error) {
      setPanelError(errorMessage(error, text.error));
    } finally {
      setValidationBusy(undefined);
    }
  };

  const runValidationStep = async (
    step: ValidationStep,
    allowDirty = false,
  ) => {
    if (validationBusy) return;
    if (agentConfigDirty && !allowDirty) {
      if (!onSaveDraft) {
        setPanelError(text.validationSaveFailed);
        return;
      }
      const saved = await onSaveDraft();
      if (!saved) {
        setPanelError(text.validationSaveFailed);
        return;
      }
    }
    if (step === "static") await runStaticValidation();
    else if (step === "cases") await generateCases();
    else await runBehaviorValidation();
  };

  const runBehaviorValidation = async (targetCaseKeys?: string[]) => {
    if (!currentAgentId || validationBusy) return;
    const targetKeys = new Set(targetCaseKeys ?? [...selectedCases]);
    const selectedEntries = validationCases
      .map((item, index) => ({
        item: { ...item, caseId: validationCaseKey(item, index) },
        index,
        key: validationCaseKey(item, index),
      }))
      .filter((entry) => targetKeys.has(entry.key));
    if (selectedEntries.length === 0) return;
    setValidationBusy("behavior");
    setRemediation(undefined);
    setPanelError("");
    if (!(await ensureValidationSession())) {
      setValidationBusy(undefined);
      return;
    }
    setValidationRunTracker({
      active: true,
      stopping: false,
      cancelled: false,
      finished: false,
      startedAt: Date.now(),
      elapsedMs: 0,
      items: selectedEntries.map(({ item, index, key }) => ({
        key,
        caseId: item.caseId,
        index,
        title: item.title || `#${index + 1}`,
        state: "queued",
      })),
    });

    const collected = new Map<string, AgentValidationCase>();
    const orderedCaseIds = selectedEntries.map((entry) => entry.key);
    const previousIssues = validationReport?.staticIssues ?? [];
    const pushLiveReport = () => {
      const cases = orderedCaseIds
        .map((caseId) => collected.get(caseId))
        .filter((item): item is AgentValidationCase => Boolean(item));
      setValidationReport({
        runId: "",
        agentId: currentAgentId,
        agentVersion: 0,
        configHash: "",
        status: "RUNNING",
        staticIssues: previousIssues,
        cases,
        summary: {
          issueCount: previousIssues.length,
          critical: 0,
          error: 0,
          warning: 0,
          info: 0,
          testsRun: cases.length,
          testsPassed: cases.filter((item) => item.passed).length,
          testsFailed: cases.filter((item) => !item.passed).length,
        },
        createdAt: new Date().toISOString(),
      });
    };

    try {
      await streamValidateAgentBehavior(
        currentAgentId,
        selectedEntries.map((entry) => entry.item),
        {
          onRunStart: (payload) =>
            setValidationRunTracker((current) =>
              current ? { ...current, runId: payload.runId } : current,
            ),
          onCaseStart: (payload) =>
            setValidationRunTracker((current) =>
              current
                ? patchRunItem(current, payload.caseId, { state: "running" })
                : current,
            ),
          onCaseResult: (payload) => {
            const caseId =
              payload.case.caseId || orderedCaseIds[payload.index] || "";
            if (!caseId) return;
            collected.set(caseId, {
              ...payload.case,
              caseId,
            });
            pushLiveReport();
            setValidationRunTracker((current) =>
              current
                ? patchRunItem(current, caseId, {
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

  const toggleCase = (caseId: string) => {
    setSelectedCases((current) => {
      const next = new Set(current);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });
  };

  const selectAllCases = () => {
    setSelectedCases(
      new Set(
        validationCases.map((item, index) => validationCaseKey(item, index)),
      ),
    );
  };

  const clearSelectedCases = () => {
    setSelectedCases(new Set());
  };

  const updateValidationCase = (
    caseId: string,
    changes: Pick<AgentValidationCase, "input" | "expected">,
  ) => {
    setValidationCases((current) =>
      current.map((item, index) =>
        validationCaseKey(item, index) === caseId
          ? { ...item, ...changes }
          : item,
      ),
    );
  };

  const rerunFailedCases = () => {
    const failedIds =
      validationReport?.cases
        .filter((item) => item.passed === false)
        .map((item, index) => item.caseId || `index-${index}`) ?? [];
    if (failedIds.length === 0) return;
    setSelectedCases(new Set(failedIds));
    void runBehaviorValidation(failedIds);
  };

  const applySuggestedPatch = (
    patch?: Record<string, unknown>,
    key?: string,
  ) => {
    const entries = patchEntries(patch ?? {});
    if (!patch || entries.length === 0) return;
    const effectivePatch = Object.fromEntries(entries);
    const before = Object.fromEntries(
      entries.map(([field]) => [field, currentAgentSnapshot[field]]),
    );
    const patchKey = key || `patch-${Date.now()}`;
    onApplyPatch(effectivePatch);
    setAppliedPatchRecords((current) => ({
      ...current,
      [patchKey]: { patch: effectivePatch, before },
    }));
    setAppliedPatchSummary({
      key: patchKey,
      patch: effectivePatch,
      before,
    });
    toast.success(text.patchApplied);
  };

  const undoSuggestedPatch = (key: string) => {
    const record = appliedPatchRecords[key];
    if (!record) return;
    if (!canUndoPatch(record, currentAgentSnapshot)) {
      toast.warning(text.patchUndoUnavailable);
      return;
    }
    const restore: Record<string, unknown> = {};
    patchEntries(record.patch).forEach(([field, value]) => {
      if (patchValueEqual(field, currentAgentSnapshot[field], value)) {
        restore[field] = record.before[field];
      }
    });
    if (Object.keys(restore).length > 0) onApplyPatch(restore);
    setAppliedPatchRecords((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setAppliedPatchSummary((current) =>
      current?.key === key ? undefined : current,
    );
    toast.success(text.patchUndone);
  };

  const generateRemediation = async () => {
    if (!currentAgentId || remediationBusy) return;
    const failedCases =
      validationReport?.cases.filter((item) => item.passed === false) ?? [];
    if (failedCases.length === 0) {
      toast.info(text.remediationSource.replace("{count}", "0"));
      return;
    }
    setRemediationBusy(true);
    setPanelError("");
    try {
      if (!(await ensureValidationSession())) return;
      setRemediation(
        await generateAgentValidationRemediation(
          currentAgentId,
          failedCases,
          currentAgentSnapshot,
        ),
      );
    } catch (error) {
      setPanelError(errorMessage(error, text.error));
    } finally {
      setRemediationBusy(false);
    }
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

  const handlePanelKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".copilot-history-popover, .copilot-mode-menu")) {
        return;
      }
      const popover = panelRef.current?.querySelector(
        ".copilot-history-popover, .copilot-mode-menu",
      );
      if (popover && popover.getClientRects().length > 0) return;
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Tab" && isModal) {
      const focusables = getFocusableElements(panelRef.current);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
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
        role={isModal ? "dialog" : "complementary"}
        aria-modal={isModal || undefined}
        aria-labelledby="admin-copilot-title"
        tabIndex={-1}
        onKeyDown={handlePanelKeyDown}
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

        {panelError && (
          <p className="copilot-error" role="alert">
            <Icon name="alert" size={15} />
            {panelError}
          </p>
        )}

        {view === "validate" ? (
          <div className="copilot-validation-shell">
            <div className="copilot-toolbar">
              <WorkspaceModePicker
                view={view}
                text={text}
                onChange={switchView}
              />
              <SessionHistoryPicker
                text={text}
                sessions={visibleSessions}
                activeSessionId={activeSession?.id}
                busy={sessionActionBusy || Boolean(validationBusy)}
                modeLabel={text.validate}
                emptyPreview={text.noValidationActivity}
                emptyMessage={text.noValidationSessions}
                sessionPreview={(session) =>
                  validationSessionPreview(session, text)
                }
                onSelect={(id) => void loadSession(id)}
                onNew={() => void startSession()}
                onRename={renameSession}
                onPin={(session) => void toggleSessionPinned(session)}
                onDelete={deleteSessions}
              />
            </div>
            <ValidationView
              text={text}
              language={language}
              agentId={currentAgentId}
              agentName={currentAgentName}
              agentVersion={currentAgentVersion}
              dirty={agentConfigDirty}
              report={validationReport}
              cases={validationCases}
              selectedCases={selectedCases}
              busy={validationBusy}
              history={validationHistory}
              section={validationSection}
              runTracker={validationRunTracker}
              onStatic={() => void runStaticValidation()}
              onGenerate={() => void generateCases()}
              onRun={() => void runBehaviorValidation()}
              onCancelRun={() => void cancelBehaviorRun()}
              onDismissRun={dismissRunTracker}
              onSectionChange={setValidationSection}
              onToggleCase={toggleCase}
              onUpdateCase={updateValidationCase}
              onSelectAll={selectAllCases}
              onClearSelection={clearSelectedCases}
              onRerunFailed={rerunFailedCases}
              onApplyPatch={applySuggestedPatch}
              onUndoPatch={undoSuggestedPatch}
              appliedPatchSummary={appliedPatchSummary}
              appliedPatchKeys={appliedPatchKeys}
              appliedPatchRecords={appliedPatchRecords}
              currentAgentSnapshot={currentAgentSnapshot}
              remediation={remediation}
              remediationBusy={remediationBusy}
              onGenerateRemediation={() => void generateRemediation()}
              resourceLabels={resourceLabels}
              onDismissAppliedPatch={dismissAppliedPatch}
              onSaveDraft={onSaveDraft}
              onSaveAndValidate={(step) => void runValidationStep(step)}
              onValidateSaved={(step) => {
                if (step === "static") void runStaticValidation();
                else if (step === "cases") void generateCases();
                else void runBehaviorValidation();
              }}
            />
          </div>
        ) : (
          <div className="copilot-chat">
            <div className="copilot-toolbar">
              <WorkspaceModePicker
                view={view}
                text={text}
                onChange={switchView}
              />
              <SessionHistoryPicker
                text={text}
                sessions={visibleSessions}
                activeSessionId={activeSession?.id}
                busy={sessionActionBusy || sending}
                modeLabel={view === "build" ? text.build : text.assist}
                onSelect={(id) => void loadSession(id)}
                onNew={() => void startSession()}
                onRename={renameSession}
                onPin={(session) => void toggleSessionPinned(session)}
                onDelete={deleteSessions}
              />
            </div>

            {appliedPatchSummary && (
              <AppliedPatchSummary
                text={text}
                language={language}
                patch={appliedPatchSummary.patch}
                before={appliedPatchSummary.before}
                labels={resourceLabels}
                onDismiss={dismissAppliedPatch}
                onUndo={
                  appliedPatchSummary.key
                    ? () => undoSuggestedPatch(appliedPatchSummary.key!)
                    : undefined
                }
                canUndo={
                  appliedPatchSummary.key
                    ? Boolean(
                        appliedPatchRecords[appliedPatchSummary.key] &&
                        canUndoPatch(
                          appliedPatchRecords[appliedPatchSummary.key],
                          currentAgentSnapshot,
                        ),
                      )
                    : false
                }
                onSaveDraft={onSaveDraft}
              />
            )}

            <div
              className="copilot-messages"
              ref={messagesRef}
              aria-live="polite"
              aria-busy={sending}
              onScroll={handleMessagesScroll}
            >
              {!pendingUserMessage &&
                (activeSession?.messages.length ?? 0) === 0 && (
                  <div className="copilot-welcome">
                    <span aria-hidden="true">
                      <Icon name="sparkle" size={18} />
                    </span>
                    <strong>{text.emptyTitle}</strong>
                    <p>
                      {view === "build" ? text.noProposal : text.noSessions}
                    </p>
                  </div>
                )}
              {activeSession?.messages.map((item) => {
                const retryable =
                  failedChatMessage?.content === item.content &&
                  item.role === "user";
                return (
                  <article
                    className={`copilot-message is-${item.role}${retryable ? " is-failed" : ""}`}
                    key={item.id}
                  >
                    <span className="copilot-message-role">
                      {item.role === "assistant" ? text.title : "Admin"}
                    </span>
                    {item.role === "assistant" ? (
                      <CopilotMarkdown text={text}>
                        {item.content}
                      </CopilotMarkdown>
                    ) : (
                      <p>{item.content}</p>
                    )}
                    <div className="copilot-message-actions">
                      <button
                        type="button"
                        onClick={() => copyChatMessage(item.content)}
                        aria-label={text.copyMessage}
                        title={text.copyMessage}
                      >
                        <Icon name="copy" size={13} />
                        {text.copyMessage}
                      </button>
                      {item.role === "user" && (
                        <>
                          {retryable && (
                            <button
                              type="button"
                              onClick={() => void send(item.content)}
                              disabled={sending}
                            >
                              <Icon name="refresh" size={13} />
                              {text.retryMessage}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => editAndResend(item.content)}
                            disabled={sending}
                          >
                            <Icon name="edit" size={13} />
                            {text.editAndResend}
                          </button>
                        </>
                      )}
                      <time>{formatDateTime(item.createdAt)}</time>
                    </div>
                    {item.role === "assistant" &&
                      (() => {
                        const payload = parseJson<CopilotRespondResult>(
                          item.payloadJson,
                        );
                        const patchKey = `assist-${item.id}`;
                        return (
                          <AssistantDetails
                            text={text}
                            language={language}
                            payload={payload}
                            before={currentAgentSnapshot}
                            resourceLabels={resourceLabels}
                            patchKey={patchKey}
                            appliedKeys={appliedPatchKeys}
                            appliedRecord={appliedPatchRecords[patchKey]}
                            canApplyPatch={Boolean(currentAgentId)}
                            onApplyPatch={applySuggestedPatch}
                            onUndoPatch={undoSuggestedPatch}
                          />
                        );
                      })()}
                  </article>
                );
              })}
              {failedChatMessage &&
                !activeSession?.messages.some(
                  (item) =>
                    item.role === "user" &&
                    item.content === failedChatMessage.content,
                ) && (
                  <article className="copilot-message is-user is-failed">
                    <span className="copilot-message-role">Admin</span>
                    <p>{failedChatMessage.content}</p>
                    <div className="copilot-message-actions">
                      <button
                        type="button"
                        onClick={() => void send(failedChatMessage.content)}
                        disabled={sending}
                      >
                        <Icon name="refresh" size={13} />
                        {text.retryMessage}
                      </button>
                      <button
                        type="button"
                        onClick={() => editAndResend(failedChatMessage.content)}
                        disabled={sending}
                      >
                        <Icon name="edit" size={13} />
                        {text.editAndResend}
                      </button>
                    </div>
                  </article>
                )}
              {pendingUserMessage && (
                <div className="copilot-pending-turn">
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
                      {chatRun?.phase || text.thinking}
                    </p>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void cancelChatRun()}
                      disabled={chatRun?.canceling}
                    >
                      <Icon name="pause" size={13} />
                      {chatRun?.canceling
                        ? text.cancelingGeneration
                        : text.cancelGeneration}
                    </button>
                  </article>
                </div>
              )}
            </div>

            {hasNewMessages && (
              <button
                type="button"
                className="copilot-new-messages"
                onClick={scrollMessagesToBottom}
              >
                <Icon name="chevron-down" size={14} />
                {text.newMessages}
              </button>
            )}

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
                onSaveDraft={onSaveDraft}
                onPublishDraft={onPublishDraft}
              />
            )}

            <div className="copilot-composer">
              <textarea
                id="admin-copilot-message"
                ref={composerRef}
                aria-label={
                  view === "build"
                    ? text.inputPlaceholderBuild
                    : text.inputPlaceholder
                }
                value={message}
                onChange={(event) => writeComposerDraft(event.target.value)}
                placeholder={
                  view === "build"
                    ? text.inputPlaceholderBuild
                    : text.inputPlaceholder
                }
                rows={2}
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
              <div className="copilot-composer-footer">
                {sending ? (
                  <button
                    type="button"
                    className="copilot-composer-action is-stop"
                    onClick={() => void cancelChatRun()}
                    aria-label={text.cancelGeneration}
                    title={text.cancelGeneration}
                    disabled={chatRun?.canceling}
                  >
                    <Icon name="pause" size={15} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="copilot-composer-action"
                    onClick={() => void send()}
                    aria-label={text.sendMessage}
                    title={text.sendMessage}
                    disabled={!message.trim()}
                  >
                    <Icon name="send" size={16} />
                  </button>
                )}
              </div>
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
  modeLabel,
  emptyPreview,
  emptyMessage,
  sessionPreview,
  onSelect,
  onNew,
  onRename,
  onPin,
  onDelete,
}: {
  text: (typeof copy)[Language];
  sessions: CopilotSessionSummary[];
  activeSessionId?: string;
  busy: boolean;
  modeLabel: string;
  emptyPreview?: string;
  emptyMessage?: string;
  sessionPreview?: (session: CopilotSessionSummary) => string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => Promise<boolean>;
  onPin: (session: CopilotSessionSummary) => void;
  onDelete: (ids: string[]) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string>();
  const [renameValue, setRenameValue] = useState("");
  const [query, setQuery] = useState("");
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [namingActive, setNamingActive] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const orderedSessions = useMemo(
    () =>
      [...sessions].sort(
        (left, right) => sessionSortValue(right) - sessionSortValue(left),
      ),
    [sessions],
  );
  const filteredSessions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return orderedSessions;
    return orderedSessions.filter((session) =>
      [session.title, session.lastMessagePreview ?? ""].some((value) =>
        value.toLocaleLowerCase().includes(normalized),
      ),
    );
  }, [orderedSessions, query]);
  const visibleSessions = expanded
    ? filteredSessions
    : filteredSessions.slice(0, RECENT_SESSION_LIMIT);
  const hiddenSessionCount = Math.max(
    0,
    filteredSessions.length - RECENT_SESSION_LIMIT,
  );
  const activeSession =
    filteredSessions.find((session) => session.id === activeSessionId) ??
    orderedSessions.find((session) => session.id === activeSessionId);
  const allSessionsSelected =
    filteredSessions.length > 0 &&
    filteredSessions.every((session) => selectedIds.has(session.id));

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

  useEffect(() => {
    setNamingActive(false);
  }, [activeSessionId]);

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
        : new Set(filteredSessions.map((session) => session.id)),
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

  const beginActiveRename = () => {
    if (!activeSession || busy) return;
    setNamingActive(true);
    setRenameValue(activeSession.title);
    setOpen(false);
  };

  const submitActiveRename = async () => {
    const title = renameValue.trim();
    if (!activeSession || !title || busy) return;
    const saved = await onRename(activeSession.id, title);
    if (saved) {
      setNamingActive(false);
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
      {namingActive && activeSession ? (
        <form
          className="copilot-session-name-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submitActiveRename();
          }}
        >
          <input
            autoFocus
            value={renameValue}
            maxLength={200}
            aria-label={text.renameCurrentSession}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setNamingActive(false);
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
            <Icon name="check" size={15} />
          </button>
          <button
            type="button"
            aria-label={text.renameCancel}
            title={text.renameCancel}
            onClick={() => {
              setNamingActive(false);
              setRenameValue("");
            }}
            disabled={busy}
          >
            <Icon name="close" size={15} />
          </button>
        </form>
      ) : (
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
              <em className="copilot-history-mode">{modeLabel}</em>
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
                    <strong>
                      {text.history}
                      <em className="copilot-history-mode">{modeLabel}</em>
                    </strong>
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

                  <label className="copilot-history-search">
                    <Icon name="search" size={14} />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={text.searchSessions}
                      aria-label={text.searchSessions}
                    />
                  </label>

                  {visibleSessions.length === 0 ? (
                    <p className="copilot-history-empty">
                      {query.trim()
                        ? text.noMatchingSessions
                        : emptyMessage || text.noSessions}
                    </p>
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
                                <span title={session.title}>
                                  {session.title}
                                </span>
                                <small>
                                  {sessionPreview
                                    ? sessionPreview(session)
                                    : `${text.lastMessage}: ${
                                        session.lastMessagePreview ||
                                        emptyPreview ||
                                        text.noSessions
                                      }`}
                                </small>
                                <time>{formatDateTime(session.updatedAt)}</time>
                              </button>
                              <button
                                type="button"
                                className={
                                  session.pinned
                                    ? "copilot-history-icon is-pinned"
                                    : "copilot-history-icon"
                                }
                                onClick={() => onPin(session)}
                                aria-label={
                                  session.pinned
                                    ? text.unpinSession
                                    : text.pinSession
                                }
                                title={
                                  session.pinned
                                    ? text.unpinSession
                                    : text.pinSession
                                }
                                aria-pressed={Boolean(session.pinned)}
                                disabled={busy}
                              >
                                <Icon name="star" size={14} />
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
                                onClick={() =>
                                  setPendingDeleteIds([session.id])
                                }
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
      )}

      {!namingActive && (
        <button
          type="button"
          className="secondary copilot-session-rename"
          onClick={beginActiveRename}
          aria-label={text.renameCurrentSession}
          title={text.renameCurrentSession}
          disabled={!activeSession || busy}
        >
          <Icon name="edit" size={15} />
        </button>
      )}

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
  language,
  payload,
  before,
  resourceLabels,
  patchKey,
  onApplyPatch,
  onUndoPatch,
  canApplyPatch,
  appliedKeys,
  appliedRecord,
}: {
  text: (typeof copy)[Language];
  language: Language;
  payload?: CopilotRespondResult;
  before?: Record<string, unknown>;
  resourceLabels?: Record<string, string>;
  patchKey: string;
  onApplyPatch: (patch?: Record<string, unknown>, key?: string) => void;
  onUndoPatch: (key: string) => void;
  canApplyPatch: boolean;
  appliedKeys: Set<string>;
  appliedRecord?: AppliedPatchRecord;
}) {
  if (!payload) return null;
  const questions = payload.questions ?? [];
  const changes = payload.patch?.changes;
  const hasChanges = changes && Object.keys(changes).length > 0;
  const effectiveChanges = hasChanges
    ? Object.fromEntries(
        Object.entries(changes as Record<string, unknown>).filter(
          ([field]) => field !== "agentId",
        ),
      )
    : undefined;
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
      {effectiveChanges && Object.keys(effectiveChanges).length > 0 && (
        <SuggestedPatchPreview
          text={text}
          language={language}
          title={text.applyPatch}
          patch={effectiveChanges}
          before={before ?? {}}
          labels={resourceLabels}
          applied={appliedKeys.has(patchKey)}
          canApply={canApplyPatch}
          canUndo={
            appliedRecord ? canUndoPatch(appliedRecord, before ?? {}) : true
          }
          onApply={(patch) => onApplyPatch(patch, patchKey)}
          onUndo={() => onUndoPatch(patchKey)}
        />
      )}
      {!canApplyPatch && hasChanges && <p>{text.noCurrentAgent}</p>}
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
        <span className="copilot-status">{text.statusReady}</span>
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
          String(
            Math.min(settled + (running || tracker.active ? 1 : 0), total),
          ),
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
  agentVersion,
  dirty,
  report,
  cases,
  selectedCases,
  busy,
  history,
  section,
  runTracker,
  onStatic,
  onGenerate,
  onRun,
  onCancelRun,
  onDismissRun,
  onSectionChange,
  onToggleCase,
  onUpdateCase,
  onSelectAll,
  onClearSelection,
  onRerunFailed,
  onApplyPatch,
  onUndoPatch,
  appliedPatchSummary,
  appliedPatchKeys,
  appliedPatchRecords,
  currentAgentSnapshot,
  remediation,
  remediationBusy,
  onGenerateRemediation,
  resourceLabels,
  onDismissAppliedPatch,
  onSaveDraft,
  onSaveAndValidate,
  onValidateSaved,
}: {
  text: (typeof copy)[Language];
  language: Language;
  agentId?: string;
  agentName?: string;
  agentVersion?: number;
  dirty: boolean;
  report?: AgentValidationReport;
  cases: AgentValidationCase[];
  selectedCases: Set<string>;
  busy?: "static" | "cases" | "behavior";
  history: AgentValidationHistoryItem[];
  section: ValidationSection;
  runTracker?: ValidationRunTracker;
  onStatic: () => void;
  onGenerate: () => void;
  onRun: () => void;
  onCancelRun: () => void;
  onDismissRun: () => void;
  onSectionChange: (section: ValidationSection) => void;
  onToggleCase: (caseId: string) => void;
  onUpdateCase: (
    caseId: string,
    changes: Pick<AgentValidationCase, "input" | "expected">,
  ) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onRerunFailed: () => void;
  onApplyPatch: (patch?: Record<string, unknown>, key?: string) => void;
  onUndoPatch: (key: string) => void;
  appliedPatchSummary?: {
    key?: string;
    patch: Record<string, unknown>;
    before: Record<string, unknown>;
  };
  appliedPatchKeys: Set<string>;
  appliedPatchRecords: Record<string, AppliedPatchRecord>;
  currentAgentSnapshot: Record<string, unknown>;
  remediation?: AgentValidationRemediation;
  remediationBusy: boolean;
  onGenerateRemediation: () => void;
  resourceLabels?: Record<string, string>;
  onDismissAppliedPatch: () => void;
  onSaveDraft?: () => void;
  onSaveAndValidate: (step: ValidationStep) => void;
  onValidateSaved: (step: ValidationStep) => void;
}) {
  const [caseFilter, setCaseFilter] = useState<ValidationCaseFilter>("all");
  const [expandedCaseIds, setExpandedCaseIds] = useState<Set<string>>(
    new Set(),
  );
  const [pendingStep, setPendingStep] = useState<ValidationStep>();
  const [expandedHistoryId, setExpandedHistoryId] = useState<string>();
  useEffect(() => {
    const failedIds =
      report?.cases
        ?.filter((item) => item.passed === false)
        .map((item, index) => item.caseId || `index-${index}`) ?? [];
    setExpandedCaseIds(new Set(failedIds));
    setCaseFilter(failedIds.length > 0 ? "failed" : "all");
  }, [report?.runId]);
  const resultByCaseId = useMemo(
    () =>
      new Map(
        (report?.cases ?? []).map((item, index) => [
          item.caseId || `index-${index}`,
          item,
        ]),
      ),
    [report?.cases],
  );
  const caseEntries = useMemo(
    () =>
      cases.map((item, index) => {
        const caseId = validationCaseKey(item, index);
        return {
          item,
          index,
          caseId,
          result: resultByCaseId.get(caseId),
        };
      }),
    [cases, resultByCaseId],
  );
  const filteredCaseEntries = caseEntries.filter(({ result }) => {
    if (caseFilter === "failed") return result?.passed === false;
    if (caseFilter === "passed") return result?.passed === true;
    return true;
  });
  const allCasesSelected =
    cases.length > 0 && selectedCases.size === cases.length;
  const requestStep = (step: ValidationStep) => {
    if (dirty) {
      setPendingStep(step);
      return;
    }
    if (step === "static") onStatic();
    else if (step === "cases") onGenerate();
    else onRun();
  };
  if (!agentId) {
    return <p className="copilot-empty">{text.validateNoAgent}</p>;
  }
  return (
    <div className="copilot-validation">
      <div className="copilot-validation-agent">
        <div>
          <span>{text.validationAgent}</span>
          <strong>{agentName || agentId}</strong>
        </div>
        <em className={dirty ? "is-dirty" : undefined}>
          {dirty
            ? agentVersion
              ? text.validationDraftVersion.replace(
                  "{version}",
                  String(agentVersion),
                )
              : text.contextUnsaved
            : agentVersion
              ? text.validationSavedVersion.replace(
                  "{version}",
                  String(agentVersion),
                )
              : text.contextSaved}
        </em>
        <code>{agentId}</code>
      </div>

      <nav className="copilot-validation-tabs" aria-label={text.validate}>
        {(
          [
            ["issues", text.validationIssues],
            ["cases", text.validationCases],
            ["remediation", text.validationRemediation],
            ["history", text.validationHistory],
          ] as const
        ).map(([key, label]) => (
          <button
            type="button"
            className={section === key ? "active" : undefined}
            aria-current={section === key ? "step" : undefined}
            onClick={() => onSectionChange(key)}
            key={key}
          >
            {label}
          </button>
        ))}
      </nav>

      {pendingStep && (
        <section className="copilot-validation-dirty" role="alert">
          <div>
            <strong>{text.validationDirtyTitle}</strong>
            <p>
              {text.validationDirtyDesc}{" "}
              {pendingStep === "static"
                ? text.staticCheck
                : pendingStep === "behavior"
                  ? text.runSelected
                  : text.generateCases}
            </p>
          </div>
          <div>
            <button
              type="button"
              className="secondary"
              onClick={() => setPendingStep(undefined)}
            >
              {text.cancel}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const step = pendingStep;
                setPendingStep(undefined);
                onValidateSaved(step);
              }}
            >
              {text.validateSavedVersion}
            </button>
            <button
              type="button"
              onClick={() => {
                const step = pendingStep;
                setPendingStep(undefined);
                onSaveAndValidate(step);
              }}
            >
              {text.saveAndValidate}
            </button>
          </div>
        </section>
      )}

      <p className="copilot-validation-guide">{text.validateGuide}</p>

      {appliedPatchSummary && (
        <AppliedPatchSummary
          text={text}
          language={language}
          patch={appliedPatchSummary.patch}
          before={appliedPatchSummary.before}
          labels={resourceLabels}
          onDismiss={onDismissAppliedPatch}
          onUndo={
            appliedPatchSummary.key
              ? () => onUndoPatch(appliedPatchSummary.key!)
              : undefined
          }
          canUndo={
            appliedPatchSummary.key
              ? Boolean(
                  appliedPatchRecords[appliedPatchSummary.key] &&
                  canUndoPatch(
                    appliedPatchRecords[appliedPatchSummary.key],
                    currentAgentSnapshot,
                  ),
                )
              : false
          }
          onSaveDraft={onSaveDraft}
        />
      )}

      <div className="copilot-validation-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => requestStep("static")}
          disabled={Boolean(busy)}
        >
          <Icon name="check" size={14} />
          {busy === "static" ? text.checking : text.staticCheck}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => requestStep("cases")}
          disabled={Boolean(busy)}
        >
          <Icon name="sparkle" size={14} />
          {busy === "cases" ? text.generating : text.generateCases}
        </button>
        <button
          type="button"
          onClick={() => requestStep("behavior")}
          disabled={Boolean(busy) || selectedCases.size === 0}
          title={
            selectedCases.size === 0 && !busy ? text.runDisabledHint : undefined
          }
        >
          <Icon name="play" size={14} />
          {busy === "behavior" ? text.running : text.runSelected}
        </button>
        {report && report.summary.testsFailed > 0 && (
          <button
            type="button"
            className="secondary"
            onClick={onRerunFailed}
            disabled={Boolean(busy)}
          >
            <Icon name="refresh" size={14} />
            {text.runFailedCases}
          </button>
        )}
      </div>

      {runTracker && (
        <RunProgressPanel
          text={text}
          tracker={runTracker}
          onCancel={onCancelRun}
          onDismiss={onDismissRun}
        />
      )}

      {section === "issues" && report && (
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
                    const issueRecord = appliedPatchRecords[issueKey];
                    return (
                      <SuggestedPatchPreview
                        text={text}
                        language={language}
                        title={text.staticSuggestion}
                        patch={issue.patch}
                        before={currentAgentSnapshot}
                        labels={resourceLabels}
                        applied={appliedPatchKeys.has(issueKey)}
                        canUndo={
                          issueRecord
                            ? canUndoPatch(issueRecord, currentAgentSnapshot)
                            : true
                        }
                        canApply={Boolean(agentId)}
                        onApply={(patch) => onApplyPatch(patch, issueKey)}
                        onUndo={() => onUndoPatch(issueKey)}
                      />
                    );
                  })()}
              </article>
            ))}
          </div>
        </section>
      )}

      {section === "cases" && (
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
              <div
                className="copilot-case-filter"
                role="group"
                aria-label={text.validationCases}
              >
                {(
                  [
                    ["all", text.filterAll],
                    ["failed", text.filterFailed],
                    ["passed", text.filterPassed],
                  ] as const
                ).map(([filter, label]) => (
                  <button
                    type="button"
                    className={caseFilter === filter ? "active" : undefined}
                    aria-pressed={caseFilter === filter}
                    onClick={() => setCaseFilter(filter)}
                    key={filter}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="secondary"
                onClick={onSelectAll}
                disabled={
                  Boolean(busy) || cases.length === 0 || allCasesSelected
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
          ) : filteredCaseEntries.length === 0 ? (
            <p className="copilot-empty">{text.noCases}</p>
          ) : (
            <div className="copilot-case-list">
              {filteredCaseEntries.map(({ item, caseId, result }) => {
                const expanded = expandedCaseIds.has(caseId);
                const casePatchKey = `case-${caseId}`;
                const caseRecord = appliedPatchRecords[casePatchKey];
                return (
                  <article
                    className={
                      result
                        ? `copilot-case ${result.passed ? "is-pass" : "is-fail"}`
                        : "copilot-case"
                    }
                    key={caseId}
                  >
                    <div className="copilot-case-head">
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedCases.has(caseId)}
                          onChange={() => onToggleCase(caseId)}
                        />
                        <span>
                          <strong>{item.title}</strong>
                          <small>
                            {text.input}: {item.input}
                          </small>
                        </span>
                      </label>
                      <div>
                        {result && (
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
                        )}
                        <button
                          type="button"
                          className="copilot-case-toggle"
                          aria-expanded={expanded}
                          onClick={() =>
                            setExpandedCaseIds((current) => {
                              const next = new Set(current);
                              if (next.has(caseId)) next.delete(caseId);
                              else next.add(caseId);
                              return next;
                            })
                          }
                        >
                          <Icon name="chevron-down" size={14} />
                          {expanded ? text.collapseCase : text.expandCase}
                        </button>
                      </div>
                    </div>
                    {expanded && (
                      <div className="copilot-case-details">
                        <div className="copilot-case-editor">
                          <label>
                            <span>{text.editCaseInput}</span>
                            <textarea
                              value={item.input}
                              rows={3}
                              onChange={(event) =>
                                onUpdateCase(caseId, {
                                  input: event.target.value,
                                  expected: item.expected,
                                })
                              }
                            />
                          </label>
                          <label>
                            <span>{text.editCaseExpected}</span>
                            <textarea
                              value={item.expected}
                              rows={3}
                              onChange={(event) =>
                                onUpdateCase(caseId, {
                                  input: item.input,
                                  expected: event.target.value,
                                })
                              }
                            />
                          </label>
                        </div>
                        {result && (
                          <>
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
                                <SuggestedPatchPreview
                                  text={text}
                                  language={language}
                                  title={text.scenarioSuggestion}
                                  description={result.reason}
                                  patch={result.suggestedPatch}
                                  before={currentAgentSnapshot}
                                  labels={resourceLabels}
                                  applied={appliedPatchKeys.has(casePatchKey)}
                                  canUndo={
                                    caseRecord
                                      ? canUndoPatch(
                                          caseRecord,
                                          currentAgentSnapshot,
                                        )
                                      : true
                                  }
                                  canApply={Boolean(agentId)}
                                  onApply={(patch) =>
                                    onApplyPatch(patch, casePatchKey)
                                  }
                                  onUndo={() => onUndoPatch(casePatchKey)}
                                />
                              )}
                          </>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {section === "remediation" &&
        report &&
        report.summary.testsFailed > 0 && (
          <section className="copilot-validation-section">
            <div className="copilot-section-heading">
              <h3>{text.remediationTitle}</h3>
              <span>
                {text.remediationSource.replace(
                  "{count}",
                  String(report.summary.testsFailed),
                )}
              </span>
            </div>
            <p className="copilot-remediation-guide">
              {text.remediationGuide.replace(
                "{count}",
                String(report.summary.testsFailed),
              )}
            </p>
            <button
              type="button"
              className="secondary"
              onClick={onGenerateRemediation}
              disabled={remediationBusy}
            >
              <Icon name="sparkle" size={14} />
              {remediationBusy
                ? text.generatingRemediation
                : text.generateRemediation}
            </button>
            {remediation && (
              <SuggestedPatchPreview
                text={text}
                language={language}
                title={text.remediationTitle}
                description={remediation.summary}
                patch={remediation.patch}
                before={currentAgentSnapshot}
                labels={resourceLabels}
                applied={appliedPatchKeys.has("remediation")}
                canUndo={
                  appliedPatchRecords.remediation
                    ? canUndoPatch(
                        appliedPatchRecords.remediation,
                        currentAgentSnapshot,
                      )
                    : true
                }
                canApply={Boolean(agentId)}
                onApply={(patch) => onApplyPatch(patch, "remediation")}
                onUndo={() => onUndoPatch("remediation")}
              />
            )}
          </section>
        )}

      {section === "history" && (
        <section className="copilot-validation-section">
          <div className="copilot-section-heading">
            <h3>{text.historyTitle}</h3>
          </div>
          {history.length === 0 ? (
            <p className="copilot-empty">{text.emptyHistory}</p>
          ) : (
            <ul className="copilot-history">
              {history.map((item) => {
                const expanded = expandedHistoryId === item.id;
                const report = parseJson<AgentValidationReport>(
                  item.reportJson,
                );
                const reportCases = Array.isArray(report?.cases)
                  ? report.cases
                  : [];
                const passedCount =
                  report?.summary?.testsPassed ??
                  reportCases.filter((entry) => entry.passed).length;
                const totalCount =
                  report?.summary?.testsRun ?? reportCases.length;
                return (
                  <li
                    className={expanded ? "is-open" : undefined}
                    key={item.id}
                  >
                    <button
                      type="button"
                      className="copilot-history-row"
                      aria-expanded={expanded}
                      onClick={() =>
                        setExpandedHistoryId(expanded ? undefined : item.id)
                      }
                      title={expanded ? text.historyHide : text.historyShow}
                    >
                      <span>{text.status}</span>
                      <strong>{historyStatusLabel(item.status, text)}</strong>
                      <span className="copilot-history-row-meta">
                        {report && `${passedCount}/${totalCount}`}
                        <time>{formatDateTime(item.createdAt)}</time>
                      </span>
                      <Icon name="chevron-down" size={15} />
                    </button>
                    {expanded && (
                      <ValidationHistoryDetails
                        text={text}
                        language={language}
                        item={item}
                        onExport={() =>
                          downloadJson(
                            `agent-validation-${agentId}-${item.id}.json`,
                            report ?? item,
                          )
                        }
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
