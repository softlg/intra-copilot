import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { apiOriginPattern, bootstrapAuth, type AuthedFetch } from "./auth";
import {
  AssistantMarkdown,
  isDefaultSessionTitle,
} from "./components/AssistantMarkdown";
import { consumeSseBuffer, parseSseFrame } from "../../shared/protocol/sse";
import { translations } from "./i18n/translations";
import {
  attachmentObjectUrlCache,
  collectContextsFromTab,
  executeEditorAction,
  resolveAttachment,
} from "./lib/browser";
import { originPattern } from "./lib/url";
import {
  actionProposalSchema,
  capabilitiesSchema,
  pageContextSchema,
  tokenPayloadSchema,
} from "./lib/schemas";
import "./style.css";

const API_BASE = (
  import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8080/api/v1"
)
  .replace(/\/api\/v1\/?$/, "")
  .replace(/\/$/, "");
const API = `${API_BASE}/api/v1`;
// Keep this above the backend agent.sse-timeout-seconds default.
const CHAT_STREAM_TIMEOUT_MS = 610_000;
const BROWSER_PROTOCOL_VERSION = 1;
type Theme = "system" | "light" | "dark";
type Language = "zh" | "en";
type ActivationMode = "all_pages" | "manual";
type ActionPermission = "ask" | "delegate" | "full";
type Feedback = "up" | "down" | null;
type FeedbackReasonCode =
  "INACCURATE" | "IRRELEVANT" | "TOO_LONG" | "FORMAT_UI" | "OTHER";
type FeedbackToast = { index: number; kind: "cleared" | "thanks" };
type AttachmentView = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  isImage: boolean;
  url: string;
};

// 附件原始 url 指向需要鉴权的后端接口；浏览器在加载 <img src> 或 <a download> 时
// 不会附带 JWT，直接用它必然 401 而显示/下载失败。因此统一用 apiFetch 取回字节，
// 转成同源 object URL 后再交给 img/下载使用，并按 id 缓存避免重复请求。
function MessageAttachmentView({
  att,
  fetchFn,
  previewLabel,
  onPreview,
}: {
  att: AttachmentView;
  fetchFn: (path: string, init?: RequestInit) => Promise<Response>;
  previewLabel: string;
  onPreview: (id: string) => void;
}) {
  const [src, setSrc] = useState<string | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    resolveAttachment(fetchFn, att.id)
      .then((u) => {
        if (!cancelled) setSrc(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [att.id, fetchFn]);
  if (att.isImage) {
    return (
      <button
        type="button"
        className="message-image-button"
        onClick={() => onPreview(att.id)}
        title={previewLabel}
        aria-label={previewLabel}
      >
        {src ? <img src={src} alt={att.filename} /> : null}
      </button>
    );
  }
  return (
    <a
      className="message-file-chip"
      href={src}
      download={att.filename}
      title={att.filename}
    >
      <span className="file-icon">📎</span>
      <span className="file-name">{att.filename}</span>
    </a>
  );
}

function FeedbackIcon({ direction }: { direction: "up" | "down" }) {
  const path =
    direction === "up"
      ? "M7 10v10H4V10h3Zm3 10V9l4-7 1.2.5c.9.4 1.4 1.4 1.2 2.3L15.5 9H20c1.1 0 2 .9 2 2 0 .3 0 .5-.1.8l-2.2 7A2.4 2.4 0 0 1 17.4 20H10Z"
      : "M7 14V4H4v10h3Zm3-10v11l4 7 1.2-.5c.9-.4 1.4-1.4 1.2-2.3L15.5 15H20c1.1 0 2-.9 2-2 0-.3 0-.5-.1-.8l-2.2-7A2.4 2.4 0 0 0 17.4 4H10Z";
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

/** 工具调用过程的折叠面板：把 Agent 实际执行了哪些工具、参数与返回值结构化展示，不污染正文。 */
function ToolTraceView({
  trace,
  title,
  argsLabel,
  resultLabel,
  okLabel,
  failLabel,
  browserActionName,
  browserActionReason,
  browserActionLabels,
  systemAgentTaskName,
  systemAgentGoalLabel,
}: {
  trace: ToolTraceStep[];
  title: string;
  argsLabel: string;
  resultLabel: string;
  okLabel: string;
  failLabel: string;
  browserActionName: string;
  browserActionReason: string;
  browserActionLabels: Record<string, string>;
  systemAgentTaskName: string;
  systemAgentGoalLabel: string;
}) {
  const [open, setOpen] = useState(false);
  if (!trace.length) return null;
  const done = trace.filter((step) => step.result != null).length;
  return (
    <div className={"tool-trace " + (open ? "open" : "collapsed")}>
      <button
        type="button"
        className="tool-trace-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="tool-trace-caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        {title}
        <span className="tool-trace-count">
          {done}/{trace.length}
        </span>
      </button>
      {open && (
        <ol className="tool-trace-list">
          {trace.map((step, index) => {
            const displayName =
              step.tool === "browser_action"
                ? browserActionName
                : step.tool === "system_agent_task"
                  ? systemAgentTaskName
                  : step.tool;
            let displayArguments = step.arguments;
            let displayResult = step.result;
            if (step.tool === "browser_action" && step.arguments) {
              try {
                const parsed = JSON.parse(step.arguments);
                const actionLabel =
                  browserActionLabels[parsed.type] || parsed.type;
                displayArguments = `${actionLabel}${parsed.reason ? `\n${browserActionReason}：${parsed.reason}` : ""}`;
              } catch {
                /* Keep the original value when the trace is not valid JSON. */
              }
            }
            if (step.tool === "system_agent_task" && step.arguments) {
              try {
                const parsed = JSON.parse(step.arguments);
                displayArguments = [
                  parsed.capability,
                  parsed.goal ? `${systemAgentGoalLabel}：${parsed.goal}` : "",
                ]
                  .filter(Boolean)
                  .join("\n");
              } catch {
                /* Keep the original value when the trace is not valid JSON. */
              }
            }
            if (
              step.tool === "system_agent_task" &&
              displayResult?.startsWith("SYSTEM_AGENT_TASK_ERROR:")
            ) {
              displayResult = displayResult.slice(
                "SYSTEM_AGENT_TASK_ERROR:".length,
              );
            }
            return (
              <li key={index} className="tool-trace-step">
                <div className="tool-trace-head">
                  <code className="tool-trace-name">{displayName}</code>
                  {step.result != null && (
                    <span
                      className={
                        "tool-trace-badge " +
                        (step.success === false ? "failed" : "ok")
                      }
                    >
                      {step.success === false ? failLabel : okLabel}
                    </span>
                  )}
                </div>
                {displayArguments ? (
                  <pre className="tool-trace-args">
                    {argsLabel}
                    {displayArguments}
                  </pre>
                ) : null}
                {step.result != null ? (
                  <pre className="tool-trace-result">
                    {resultLabel}
                    {displayResult}
                  </pre>
                ) : (
                  <div className="tool-trace-pending">{resultLabel}…</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

type PendingAttachment = {
  id?: string;
  name: string;
  size: number;
  type: string;
  url: string;
  file?: File;
};

type ToolTraceStep = {
  tool: string;
  /** tool_invoked 携带的入参（JSON 字符串）。 */
  arguments?: string;
  /** tool_result 携带的返回值（可能因超长被截断）。 */
  result?: string;
  success?: boolean;
};

type Msg = {
  role: string;
  content: string;
  id?: string;
  agentId?: string;
  attachments?: AttachmentView[];
  stopped?: boolean;
  stage?: string;
  /** 由 SSE agent_selected 事件填充：实际处理该消息的 Agent 展示名。 */
  agentName?: string;
  /** 工具调用过程（由 tool_invoked/tool_result 事件填充），独立渲染、不污染正文。 */
  toolTrace?: ToolTraceStep[];
  /** 生成终态：ok=正常完成；stopped=用户停止；failed=出错。用于渲染独立状态徽标。 */
  status?: "ok" | "stopped" | "failed";
  /** failed 时的可读错误（仅作徽标文案，不再拼进正文）。 */
  errorMessage?: string;
};
type PageInfoKey = "url" | "title" | "selection" | "visibleText" | "domSummary";
const PAGE_INFO_KEYS: PageInfoKey[] = [
  "url",
  "title",
  "selection",
  "visibleText",
  "domSummary",
];
const MAX_VISIBLE_SESSION_TABS = 5;

function App() {
  const [authedFetch, setAuthedFetch] = useState<AuthedFetch | null>(null);
  const streamTimeoutMsRef = useRef(CHAT_STREAM_TIMEOUT_MS);
  // 是否贴近消息列表底部：用户向上翻阅历史时暂停自动跟随，仅在其回到底部后才恢复。
  const [atBottom, setAtBottom] = useState(true);
  const [authError, setAuthError] = useState<string>("");
  const [needsApiPermission, setNeedsApiPermission] = useState(false);
  const [browserProtocolMismatch, setBrowserProtocolMismatch] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [session, setSession] = useState<any>();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const sessionRef = useRef<any>(undefined);
  const messagesBySessionRef = useRef(new Map<string, Msg[]>());
  const streamingSessionIdRef = useRef<string | undefined>(undefined);
  const [messageFeedback, setMessageFeedback] = useState<
    Record<number, Feedback>
  >({});
  const [inlineFeedbackIndex, setInlineFeedbackIndex] = useState<number>();
  const [inlineFeedbackReason, setInlineFeedbackReason] =
    useState<FeedbackReasonCode>();
  const [inlineFeedbackComment, setInlineFeedbackComment] = useState("");
  const [feedbackSubmittingIndex, setFeedbackSubmittingIndex] =
    useState<number>();
  const [feedbackToast, setFeedbackToast] = useState<FeedbackToast>();
  const [copiedMessage, setCopiedMessage] = useState<number>();
  const [copiedCode, setCopiedCode] = useState<string>();
  const [input, setInput] = useState("");
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [busySessionIds, setBusySessionIds] = useState<Set<string>>(new Set());
  // 每个会话独立维护发送锁和 AbortController，避免一个会话阻塞其他会话。
  const busySessionsRef = useRef(new Set<string>());
  const streamControllersRef = useRef(new Map<string, AbortController>());
  const sessionBusy = Boolean(session?.id && busySessionIds.has(session.id));
  const actionTabIdRef = useRef<number | undefined>(undefined);
  const actionTargetTabRef = useRef(new Map<string, number>());
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<Theme>("system");
  const [language, setLanguage] = useState<Language>("zh");
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [readPageEnabled, setReadPageEnabled] = useState(true);
  const [actionPermission, setActionPermission] =
    useState<ActionPermission>("ask");
  const [pageInfoSelection, setPageInfoSelection] = useState<
    Record<PageInfoKey, boolean>
  >({
    url: true,
    title: true,
    selection: true,
    visibleText: true,
    domSummary: true,
  });
  const [pageInfoOpen, setPageInfoOpen] = useState(false);
  const [activationMode, setActivationMode] =
    useState<ActivationMode>("manual");
  const [sidePanelAllTabs, setSidePanelAllTabs] = useState(false);
  const [currentTabId, setCurrentTabId] = useState<number>();
  const [currentWindowId, setCurrentWindowId] = useState<number>();
  const [currentTabEnabled, setCurrentTabEnabled] = useState(false);
  const [availableTabs, setAvailableTabs] = useState<chrome.tabs.Tab[]>([]);
  const [selectedTabIds, setSelectedTabIds] = useState<number[]>([]);
  const tabSelectionInitializedRef = useRef(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [screenshot, setScreenshot] = useState<string>();
  const [screenshotSelection, setScreenshotSelection] = useState<string>();
  const [selectionRect, setSelectionRect] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const selectionStart = useRef<{ x: number; y: number } | undefined>(
    undefined,
  );
  const [previewImage, setPreviewImage] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [moreSessionsOpen, setMoreSessionsOpen] = useState(false);
  const sessionMoreRef = useRef<HTMLDivElement>(null);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [editingSessionId, setEditingSessionId] = useState<string>();
  const [editingTitle, setEditingTitle] = useState("");
  // 拖拽排序：draggingId 为正在拖动的会话 id；dropTarget 为插入目标
  // { id, before } 表示「插到 id 之前」（before=true）或「之后」（before=false）。
  const draggingSessionRef = useRef<string | undefined>(undefined);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    before: boolean;
  }>();
  const [agents, setAgents] = useState<
    { id: string; displayName: string; role: string; description?: string }[]
  >([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const reorderRef = useRef<any[] | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerToolsRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const authedFetchRef = useRef<AuthedFetch | null>(null);
  const agentsRequestRef = useRef<AbortController | null>(null);

  type ConfirmState = {
    title?: string;
    message: React.ReactNode;
    danger?: boolean;
  };
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const confirmResolveRef = useRef<((value: boolean) => void) | null>(null);

  function askConfirm(options: ConfirmState): Promise<boolean> {
    setConfirmState(options);
    return new Promise((resolve) => {
      confirmResolveRef.current = (value) => {
        confirmResolveRef.current = null;
        setConfirmState(null);
        resolve(value);
      };
    });
  }

  useEffect(() => {
    return () => {
      streamControllersRef.current.forEach((controller) => controller.abort());
      streamControllersRef.current.clear();
      attachmentObjectUrlCache.forEach((url) => URL.revokeObjectURL(url));
      attachmentObjectUrlCache.clear();
      messagesBySessionRef.current.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { authedFetch } = await bootstrapAuth(API_BASE);
        if (cancelled) return;
        authedFetchRef.current = authedFetch;
        setAuthedFetch(() => authedFetch);
        const capabilitiesResponse = await authedFetch("/capabilities");
        if (capabilitiesResponse.ok) {
          const parsedCapabilities = capabilitiesSchema.safeParse(
            await capabilitiesResponse.json(),
          );
          if (!parsedCapabilities.success) {
            throw new Error("Backend capabilities response is invalid");
          }
          const capabilities = parsedCapabilities.data;
          const streamTimeoutMs = Number(capabilities?.streamTimeoutMs);
          if (Number.isFinite(streamTimeoutMs) && streamTimeoutMs > 0) {
            streamTimeoutMsRef.current = streamTimeoutMs;
          }
          const mismatch =
            Number(capabilities?.browserProtocolVersion) !==
            BROWSER_PROTOCOL_VERSION;
          setBrowserProtocolMismatch(mismatch);
          if (mismatch)
            setError("插件与后端版本不兼容，请刷新或升级浏览器插件。");
        } else {
          setBrowserProtocolMismatch(true);
          setError("插件与后端版本不兼容，请刷新或升级浏览器插件。");
        }
        load();
      } catch (error) {
        if (cancelled) return;
        const message =
          (error as Error).message || "Failed to register device with backend";
        setAuthError(message);
        setNeedsApiPermission(message.includes("缺少后端访问权限"));
        setError(`Device registration failed: ${message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 拉取可选 Agent 列表，供用户显式选择（解决插件从不指定 agentId 的问题）。
  useEffect(() => {
    if (!authedFetch) return;
    void loadAgents();
    return () => {
      agentsRequestRef.current?.abort();
      agentsRequestRef.current = null;
    };
  }, [authedFetch]);

  useEffect(() => {
    setSelectedAgentId((current) =>
      current && !agents.some((agent) => agent.id === current) ? "" : current,
    );
  }, [agents]);

  useEffect(() => {
    const list = mainRef.current;
    if (!list) return;
    // 监听滚动位置，更新 atBottom：只有贴近底部时才自动跟随流式输出滚动。
    const onScroll = () => {
      const distance = list.scrollHeight - list.scrollTop - list.clientHeight;
      setAtBottom(distance < 48);
    };
    list.addEventListener("scroll", onScroll, { passive: true });
    return () => list.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    // 仅在贴近底部时跟随滚动：用户翻阅历史时不被新 token 强制拽回底部。
    if (!atBottom) return;
    const list = mainRef.current;
    if (!list) return;
    list.scrollTo({
      top: list.scrollHeight,
      behavior: "smooth",
    });
  }, [msgs, atBottom]);

  useEffect(() => {
    if (!toolsOpen && !permissionOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (composerRef.current?.contains(target)) {
        const element = target as Element;
        if (
          composerToolsRef.current?.contains(target) &&
          !element.closest(".tool-button, .tool-popover, .permission-popover")
        ) {
          setToolsOpen(false);
          setPermissionOpen(false);
        }
        return;
      }
      setToolsOpen(false);
      setPermissionOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [toolsOpen, permissionOpen]);

  useEffect(() => {
    if (!moreSessionsOpen) return;
    const closeMoreSessions = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !sessionMoreRef.current?.contains(target)) {
        setMoreSessionsOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeMoreSessions);
    return () => document.removeEventListener("pointerdown", closeMoreSessions);
  }, [moreSessionsOpen]);

  useEffect(() => {
    chrome.storage.local.remove("tmsAuthorized");
    chrome.storage.local.get(
      [
        "theme",
        "language",
        "readPageEnabled",
        "actionPermission",
        "activationMode",
        "sidePanelAllTabs",
        "pageInfoSelection",
      ],
      (value: {
        theme?: Theme;
        language?: Language;
        readPageEnabled?: boolean;
        actionPermission?: ActionPermission;
        activationMode?: ActivationMode;
        sidePanelAllTabs?: boolean;
        pageInfoSelection?: Partial<Record<PageInfoKey, boolean>>;
      }) => {
        if (value.theme === "light" || value.theme === "dark") {
          setTheme(value.theme);
        }
        if (value.language === "zh" || value.language === "en") {
          setLanguage(value.language);
        }
        if (typeof value.readPageEnabled === "boolean") {
          setReadPageEnabled(value.readPageEnabled);
        }
        if (
          value.actionPermission === "ask" ||
          value.actionPermission === "delegate" ||
          value.actionPermission === "full"
        ) {
          setActionPermission(value.actionPermission);
        }
        if (
          value.activationMode === "all_pages" ||
          value.activationMode === "manual"
        ) {
          setActivationMode(value.activationMode);
        }
        if (typeof value.sidePanelAllTabs === "boolean") {
          setSidePanelAllTabs(value.sidePanelAllTabs);
        }
        if (value.pageInfoSelection) {
          setPageInfoSelection((current) => ({
            ...current,
            ...value.pageInfoSelection,
          }));
        }
        setPreferencesLoaded(true);
      },
    );
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    document.documentElement.dataset.theme = theme;
    chrome.storage.local.set({ theme });
  }, [theme, preferencesLoaded]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    chrome.storage.local.set({ language });
  }, [language, preferencesLoaded]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    chrome.storage.local.set({ activationMode, sidePanelAllTabs });
    refreshCurrentTabState();
  }, [activationMode, sidePanelAllTabs, preferencesLoaded]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    chrome.storage.local.set({ pageInfoSelection });
  }, [pageInfoSelection, preferencesLoaded]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    const refresh = () => void refreshCurrentTabState();
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onUpdated.addListener(refresh);
    return () => {
      chrome.tabs.onActivated.removeListener(refresh);
      chrome.tabs.onUpdated.removeListener(refresh);
    };
  }, [preferencesLoaded]);

  useEffect(() => {
    const handleMessage = (message: any) => {
      if (
        message?.type === "BALL_VISIBILITY_CHANGED" &&
        message.tabId === currentTabId
      ) {
        setCurrentTabEnabled(Boolean(message.enabled));
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [currentTabId]);

  async function refreshCurrentTabState() {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const id = tabs[0]?.id;
      setCurrentTabId(id);
      setCurrentWindowId(tabs[0]?.windowId);
      if (id == null) return;
      const result = await chrome.runtime.sendMessage({
        type: "GET_TAB_ENABLED",
        tabId: id,
      });
      setCurrentTabEnabled(Boolean(result?.enabled));
      const pattern = originPattern(tabs[0]?.url);
      const canRead =
        pattern != null &&
        (await chrome.permissions.contains({ origins: [pattern] }));
      if (!canRead) setReadPageEnabled(false);
    } catch {
      setCurrentTabId(undefined);
      setCurrentWindowId(undefined);
    }
  }

  async function updateReadPagePermission(enabled: boolean) {
    if (!enabled) {
      setReadPageEnabled(false);
      chrome.storage.local.set({ readPageEnabled: false });
      return;
    }
    const tab =
      currentTabId == null
        ? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
        : await chrome.tabs.get(currentTabId).catch(() => undefined);
    const pattern = originPattern(tab?.url);
    if (!pattern) {
      setReadPageEnabled(false);
      setError(t.pageContextReadFailed);
      return;
    }
    try {
      const granted =
        (await chrome.permissions.contains({ origins: [pattern] })) ||
        (await chrome.permissions.request({ origins: [pattern] }));
      setReadPageEnabled(granted);
      chrome.storage.local.set({ readPageEnabled: granted });
      if (!granted) setError(t.pageContextPermissionRequired);
    } catch {
      setReadPageEnabled(false);
      setError(t.pageContextPermissionRequired);
    }
  }

  async function toggleCurrentTab() {
    if (currentTabId == null) return;
    if (!currentTabEnabled) {
      const tab = await chrome.tabs.get(currentTabId).catch(() => undefined);
      let pattern: string | undefined;
      try {
        pattern = tab?.url ? `${new URL(tab.url).origin}/*` : undefined;
      } catch {
        pattern = undefined;
      }
      if (!pattern) {
        setError(t.pageContextReadFailed);
        return;
      }
      const granted = await chrome.permissions.request({
        origins: [pattern],
      });
      if (!granted) return;
    }
    const type = currentTabEnabled
      ? "DISABLE_CURRENT_TAB"
      : "ENABLE_CURRENT_TAB";
    const result = await chrome.runtime.sendMessage({
      type,
      tabId: currentTabId,
    });
    if (result?.ok) setCurrentTabEnabled(Boolean(result.enabled));
  }

  function updateSidePanelAllTabs(enabled: boolean) {
    if (enabled) {
      void chrome.permissions
        .request({ origins: ["http://*/*", "https://*/*"] })
        .then((granted) => {
          if (granted) {
            setSidePanelAllTabs(true);
            void chrome.storage.local.set({ sidePanelAllTabs: true });
            void chrome.runtime.sendMessage({
              type: "SET_SIDE_PANEL_ALL_TABS",
              enabled: true,
            });
            void chrome.sidePanel.setOptions({
              path: "sidepanel.html",
              enabled: true,
            });
            if (currentWindowId != null) {
              void chrome.sidePanel
                .open({ windowId: currentWindowId })
                .catch(() => {});
            }
          }
        });
      return;
    }
    setSidePanelAllTabs(false);
    void chrome.storage.local.set({ sidePanelAllTabs: false });
    void chrome.sidePanel.setOptions({
      path: "sidepanel.html",
      enabled: false,
    });
    if (currentTabId != null) {
      void chrome.sidePanel.setOptions({
        tabId: currentTabId,
        path: "sidepanel.html",
        enabled: true,
      });
      void chrome.sidePanel.open({ tabId: currentTabId }).catch(() => {});
    }
  }

  const t = translations[language];

  function sessionTitle(conversation: any, index: number) {
    return isDefaultSessionTitle(conversation.title)
      ? t.defaultSession(sessions.length - index)
      : conversation.title;
  }

  function loadFeedback(sessionId: string) {
    chrome.storage.local.get(["messageFeedback"], (value) => {
      const all = (value.messageFeedback || {}) as Record<
        string,
        Record<number, Feedback>
      >;
      const stored = all[sessionId] || {};
      setMessageFeedback(stored);
    });
  }

  async function saveFeedback(
    index: number,
    feedback: Exclude<Feedback, null>,
    reasonCode?: FeedbackReasonCode,
    reasonText = "",
  ): Promise<void> {
    const target = msgs[index];
    if (!session?.id || !target?.id) {
      throw new Error(t.feedbackSubmitFailed);
    }
    const response = await apiFetch("/feedback", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        messageId: target.id,
        rating: feedback,
        reasonCode,
        reasonText: reasonText.trim() || undefined,
      }),
    });
    if (!response.ok) {
      throw new Error(t.feedbackSubmitFailed);
    }
  }

  async function deleteFeedback(index: number): Promise<void> {
    const target = msgs[index];
    if (!session?.id || !target?.id) {
      throw new Error(t.feedbackSubmitFailed);
    }
    const response = await apiFetch(
      `/feedback/${encodeURIComponent(target.id)}?sessionId=${encodeURIComponent(
        session.id,
      )}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      throw new Error(t.feedbackSubmitFailed);
    }
  }

  function persistFeedback(index: number, feedback: Feedback) {
    if (!session?.id) return;
    chrome.storage.local.get(["messageFeedback"], (value) => {
      const all = (value.messageFeedback || {}) as Record<
        string,
        Record<number, Feedback>
      >;
      const sessionFeedback = { ...(all[session.id] || {}) };
      if (feedback === null) delete sessionFeedback[index];
      else sessionFeedback[index] = feedback;
      chrome.storage.local.set({
        messageFeedback: { ...all, [session.id]: sessionFeedback },
      });
    });
  }

  function showFeedbackToast(kind: FeedbackToast["kind"], index: number) {
    setFeedbackToast({ index, kind });
    window.setTimeout(
      () =>
        setFeedbackToast((current) =>
          current && current.index === index && current.kind === kind
            ? undefined
            : current,
        ),
      1800,
    );
  }

  function scrollMessageIntoView(index: number) {
    const list = mainRef.current;
    if (!list) return;
    const target = list.querySelectorAll(".msg")[index] as
      HTMLElement | undefined;
    if (!target) return;
    // 只滚动 main 这个内部滚动容器，避免 scrollIntoView 级联滚动
    // html/body 导致整页位移（side panel 里 .app 是 fixed，body 是 hidden）。
    const listTop = list.getBoundingClientRect().top;
    const targetTop = target.getBoundingClientRect().top;
    const offset = targetTop - listTop + list.scrollTop - 12;
    list.scrollTo({ top: offset, behavior: "smooth" });
  }

  async function toggleFeedback(
    index: number,
    target: Exclude<Feedback, null>,
  ) {
    if (feedbackSubmittingIndex != null) return;
    const prev: Feedback = messageFeedback[index] ?? null;
    const next: Feedback = prev === target ? null : target;

    setMessageFeedback((current) => {
      const updated = { ...current };
      if (next === null) delete updated[index];
      else updated[index] = next;
      return updated;
    });

    setFeedbackSubmittingIndex(index);
    setInlineFeedbackIndex(next === "down" ? index : undefined);
    setInlineFeedbackReason(undefined);
    setInlineFeedbackComment("");

    try {
      if (next === null) {
        await deleteFeedback(index);
      } else {
        await saveFeedback(index, next);
      }
      persistFeedback(index, next);
      if (prev !== null && next === null) {
        showFeedbackToast("cleared", index);
      }
    } catch {
      setMessageFeedback((current) => {
        const updated = { ...current };
        if (prev === null) delete updated[index];
        else updated[index] = prev;
        return updated;
      });
      setInlineFeedbackIndex(undefined);
      setError(t.feedbackSubmitFailed);
    } finally {
      setFeedbackSubmittingIndex(undefined);
    }

    // 让该条消息（连同刚展开的内联反馈条）滚到可视区域中心
    requestAnimationFrame(() => scrollMessageIntoView(index));
  }

  async function submitInlineFeedback() {
    if (inlineFeedbackIndex == null) return;
    if (feedbackSubmittingIndex != null) return;
    const index = inlineFeedbackIndex;
    const comment = inlineFeedbackComment.trim();
    if (!inlineFeedbackReason && !comment) return;
    setFeedbackSubmittingIndex(index);
    try {
      await saveFeedback(index, "down", inlineFeedbackReason, comment);
      persistFeedback(index, "down");
      showFeedbackToast("thanks", index);
      setInlineFeedbackIndex(undefined);
      setInlineFeedbackReason(undefined);
      setInlineFeedbackComment("");
    } catch {
      setError(t.feedbackSubmitFailed);
    } finally {
      setFeedbackSubmittingIndex(undefined);
    }
  }

  async function copyMessage(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessage(index);
      window.setTimeout(
        () =>
          setCopiedMessage((current) =>
            current === index ? undefined : current,
          ),
        1600,
      );
    } catch {
      setError(t.copyFailed);
    }
  }

  async function copyCode(content: string, codeId: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedCode(codeId);
      window.setTimeout(
        () =>
          setCopiedCode((current) =>
            current === codeId ? undefined : current,
          ),
        1600,
      );
    } catch {
      setError(t.copyFailed);
    }
  }

  function apiFetch(path: string, init?: RequestInit): Promise<Response> {
    const fetcher = authedFetchRef.current;
    if (!fetcher) {
      return Promise.reject(new Error("Backend auth not ready"));
    }
    return fetcher(path, init);
  }

  function updateSessionMessages(
    sessionId: string,
    update: Msg[] | ((items: Msg[]) => Msg[]),
  ): Msg[] {
    const current = messagesBySessionRef.current.get(sessionId) || [];
    const next =
      typeof update === "function"
        ? (update as (items: Msg[]) => Msg[])(current)
        : update;
    messagesBySessionRef.current.set(sessionId, next);
    trimMessageCache(sessionId);
    if (sessionRef.current?.id === sessionId) setMsgs(next);
    return next;
  }

  function trimMessageCache(activeSessionId: string) {
    const maxSessions = 50;
    while (messagesBySessionRef.current.size > maxSessions) {
      const oldest = messagesBySessionRef.current.keys().next().value as
        string | undefined;
      if (!oldest || oldest === activeSessionId) break;
      messagesBySessionRef.current.delete(oldest);
    }
  }

  function activateSession(conversation: any, initialMessages: Msg[] = []) {
    sessionRef.current = conversation;
    setSession(conversation);
    const cached = messagesBySessionRef.current.get(conversation.id);
    if (!cached && initialMessages.length) {
      messagesBySessionRef.current.set(conversation.id, initialMessages);
    }
    setMsgs(cached || initialMessages);
  }

  async function loadAgents() {
    const fetcher = authedFetchRef.current;
    if (!fetcher) return;
    agentsRequestRef.current?.abort();
    const controller = new AbortController();
    agentsRequestRef.current = controller;
    setAgentsLoading(true);
    try {
      const response = await fetcher("/agents", { signal: controller.signal });
      if (!response.ok) throw new Error(`agents: ${response.status}`);
      const data = (await response.json()) as {
        id: string;
        displayName: string;
        role: string;
        description?: string;
      }[];
      if (Array.isArray(data)) setAgents(data);
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") return;
      // 非致命：刷新失败时保留上一次成功结果，仍可继续使用自动路由。
    } finally {
      if (agentsRequestRef.current === controller) {
        agentsRequestRef.current = null;
        setAgentsLoading(false);
      }
    }
  }

  async function load() {
    if (authError) return; // 鉴权失败时不发请求
    try {
      const response = await apiFetch("/sessions");
      if (!response.ok) throw new Error(`sessions: ${response.status}`);
      const payload = await response.json();
      const sessions = Array.isArray(payload) ? payload : [];
      setSessions(sessions);
      if (sessions[0]) await select(sessions[0]);
      else await create();
    } catch {
      setSessions([]);
      setError(t.backendError);
    }
  }

  async function create() {
    try {
      const response = await apiFetch("/sessions", { method: "POST" });
      if (!response.ok) throw Error(t.createFailed);
      const conversation = await response.json();
      setSessions((items) => [conversation, ...items]);
      messagesBySessionRef.current.set(conversation.id, []);
      activateSession(conversation, []);
      setMessageFeedback({});
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function select(conversation: any) {
    const cached = messagesBySessionRef.current.get(conversation.id) || [];
    activateSession(conversation, cached);
    try {
      const response = await apiFetch(`/sessions/${conversation.id}/messages`);
      if (!response.ok) throw new Error(`messages: ${response.status}`);
      const payload = await response.json();
      const history: Msg[] = Array.isArray(payload) ? payload : [];
      const normalizedHistory = history.map((message) =>
        message.role === "assistant" && !message.content.trim()
          ? {
              ...message,
              content: t.responseUnavailable,
              stopped: true,
            }
          : message,
      );
      const latestCache =
        messagesBySessionRef.current.get(conversation.id) || [];
      const merged =
        latestCache.length >= normalizedHistory.length
          ? latestCache
          : normalizedHistory;
      updateSessionMessages(conversation.id, merged);
    } catch {
      if (!cached.length) updateSessionMessages(conversation.id, []);
      setError(t.backendError);
    }
    loadFeedback(conversation.id);
  }

  function beginRename(conversation: any) {
    setEditingSessionId(conversation.id);
    setEditingTitle(
      isDefaultSessionTitle(conversation.title)
        ? t.defaultSession(1)
        : conversation.title,
    );
  }

  // ===== 拖拽排序 =====
  function beginDrag(conversation: any, event: React.DragEvent) {
    event.dataTransfer.effectAllowed = "move";
    // Firefox 需要 setData 才会启动拖拽。
    event.dataTransfer.setData("text/plain", conversation.id);
    draggingSessionRef.current = conversation.id;
  }

  function endDrag() {
    draggingSessionRef.current = undefined;
    setDropTarget(undefined);
  }

  // 计算插入位置：横向标签按左右半区判断，纵向列表按上下半区判断。
  function updateDropTarget(
    targetId: string,
    event: React.DragEvent<HTMLElement>,
    axis: "x" | "y" = "y",
  ) {
    const draggedId = draggingSessionRef.current;
    if (!draggedId || draggedId === targetId) {
      setDropTarget(undefined);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const before =
      axis === "x"
        ? event.clientX < rect.left + rect.width / 2
        : event.clientY < rect.top + rect.height / 2;
    setDropTarget({ id: targetId, before });
  }

  async function dropOnSession(targetId: string, before: boolean) {
    const dragged = draggingSessionRef.current;
    if (!dragged || dragged === targetId) {
      endDrag();
      return;
    }
    const previousSessions = [...sessions];

    // 先记下旧顺序用于失败回滚。
    reorderRef.current = previousSessions;

    // 计算新顺序：把 dragged 移到 target 的前/后。
    const without = sessions.filter((s) => s.id !== dragged);
    const targetIndex = without.findIndex((s) => s.id === targetId);
    if (targetIndex < 0) {
      endDrag();
      return;
    }
    const insertAt = before ? targetIndex : targetIndex + 1;
    const reordered = [...without];
    const draggedSession = sessions.find((s) => s.id === dragged);
    if (draggedSession) reordered.splice(insertAt, 0, draggedSession);

    // 乐观更新本地顺序。
    setSessions(reordered);

    try {
      const response = await apiFetch("/sessions/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: reordered.map((s) => s.id) }),
      });
      if (!response.ok) throw Error(t.reorderFailed);
      reorderRef.current = null;
    } catch (e) {
      // 失败回滚到拖拽前顺序。
      if (reorderRef.current) setSessions(reorderRef.current);
      reorderRef.current = null;
      setError(t.reorderFailed);
    } finally {
      endDrag();
    }
  }

  function cancelRename() {
    setEditingSessionId(undefined);
    setEditingTitle("");
  }

  async function saveRename(conversation: any) {
    const title = editingTitle.trim();
    if (!title) {
      setError(t.nameRequired);
      return;
    }
    try {
      const response = await apiFetch(`/sessions/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw Error(body.error || t.renameFailed);
      }
      const updated = await response.json();
      setSessions((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSession((current: any) => {
        if (current?.id !== updated.id) return current;
        sessionRef.current = updated;
        return updated;
      });
      cancelRename();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeSessions(ids: string[]) {
    if (!ids.length) return;
    const names = ids.length === 1 ? t.thisSession : t.sessions(ids.length);
    const confirmed = await askConfirm({
      title: t.deleteTitle,
      message: t.deleteConfirm(names),
      danger: true,
    });
    if (!confirmed) return;
    try {
      const responses = await Promise.all(
        ids.map((id) => apiFetch(`/sessions/${id}`, { method: "DELETE" })),
      );
      const failed = responses.find((response) => !response.ok);
      if (failed) throw Error(t.deleteFailed);
      const remaining = sessions.filter((item) => !ids.includes(item.id));
      setSessions(remaining);
      setSelectedSessions([]);
      setEditingSessionId(undefined);
      if (session && ids.includes(session.id)) {
        if (remaining[0]) await select(remaining[0]);
        else await create();
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function toggleSession(id: string) {
    setSelectedSessions((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  }

  function toggleAllSessions() {
    setSelectedSessions((items) =>
      items.length === sessions.length ? [] : sessions.map((item) => item.id),
    );
  }

  async function openTools() {
    setPermissionOpen(false);
    if (toolsOpen) setPageInfoOpen(false);
    setToolsOpen((open) => !open);
    if (!toolsOpen) {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const selectableTabs = tabs.filter((tab) => tab.id != null);
      setAvailableTabs(selectableTabs);
      if (!tabSelectionInitializedRef.current) {
        const activeTab = selectableTabs.find((tab) => tab.active);
        if (activeTab?.id != null) {
          setSelectedTabIds([activeTab.id]);
          tabSelectionInitializedRef.current = true;
        }
      }
    }
  }

  function toggleTab(id: number) {
    setSelectedTabIds((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  }

  function togglePageInfo(key: PageInfoKey) {
    setPageInfoSelection((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  function removeTab(id: number) {
    setSelectedTabIds((items) => items.filter((item) => item !== id));
  }

  function onFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    addAttachments(files);
    event.target.value = "";
  }

  function addAttachments(files: File[]) {
    setAttachments((items) => [
      ...items,
      ...files.map((file, index) => ({
        name: file.name || `pasted-image-${Date.now()}-${index + 1}.png`,
        size: file.size,
        type: file.type || "application/octet-stream",
        url: URL.createObjectURL(file),
        file,
      })),
    ]);
  }

  async function readClipboardImages() {
    if (!navigator.clipboard?.read) return;
    try {
      const clipboardItems = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of clipboardItems) {
        for (const type of item.types.filter((value) =>
          value.startsWith("image/"),
        )) {
          const blob = await item.getType(type);
          const extension = type.split("/")[1] || "png";
          files.push(
            new File(
              [blob],
              `pasted-image-${Date.now()}-${files.length + 1}.${extension}`,
              { type },
            ),
          );
        }
      }
      if (files.length) addAttachments(files);
    } catch {
      // Clipboard read permission may be unavailable; text paste remains unchanged.
    }
  }

  function onInputPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(event.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    const imageFiles = imageItems
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file != null);
    if (!imageFiles.length && !imageItems.length) return;
    event.preventDefault();
    if (imageFiles.length) addAttachments(imageFiles);
    else void readClipboardImages();
  }

  function removeAttachment(url: string) {
    setAttachments((items) => {
      const removed = items.find((item) => item.url === url);
      if (removed) URL.revokeObjectURL(removed.url);
      return items.filter((item) => item.url !== url);
    });
  }

  async function captureScreen() {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const tabId = tabs[0]?.id;
      const windowId = tabs[0]?.windowId;
      if (tabId == null || windowId == null)
        throw Error("No active browser tab");
      const result = await chrome.runtime.sendMessage({
        type: "CAPTURE_SCREENSHOT",
        tabId,
        windowId,
      });
      if (!result?.ok || !result.dataUrl) {
        if (result?.error === "RESTRICTED_PAGE") {
          throw Error(t.screenshotRestricted);
        }
        if (result?.error === "RATE_LIMITED") {
          throw Error(t.screenshotRateLimited);
        }
        if (result?.detail) {
          throw Error(`${t.screenshotFailed} (${result.detail})`);
        }
        throw Error(t.screenshotFailed);
      }
      setScreenshotSelection(result.dataUrl);
      setSelectionRect({ x: 0, y: 0, width: 0, height: 0 });
      setToolsOpen(false);
    } catch (error) {
      setError((error as Error).message || t.screenshotFailed);
    }
  }

  function updateSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (!selectionStart.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    const y = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    const start = selectionStart.current;
    setSelectionRect({
      x: Math.min(start.x, x),
      y: Math.min(start.y, y),
      width: Math.abs(x - start.x),
      height: Math.abs(y - start.y),
    });
  }

  function finishSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (!selectionStart.current || !screenshotSelection) return;
    updateSelection(event);
    const bounds = event.currentTarget.getBoundingClientRect();
    const start = selectionStart.current;
    const endX = Math.max(
      0,
      Math.min(bounds.width, event.clientX - bounds.left),
    );
    const endY = Math.max(
      0,
      Math.min(bounds.height, event.clientY - bounds.top),
    );
    const rect = {
      x: Math.min(start.x, endX),
      y: Math.min(start.y, endY),
      width: Math.abs(endX - start.x),
      height: Math.abs(endY - start.y),
    };
    selectionStart.current = undefined;
    if (rect.width < 5 || rect.height < 5) return;
    const image = new Image();
    image.onload = () => {
      const scaleX = image.naturalWidth / bounds.width;
      const scaleY = image.naturalHeight / bounds.height;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(rect.width * scaleX));
      canvas.height = Math.max(1, Math.round(rect.height * scaleY));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(
        image,
        rect.x * scaleX,
        rect.y * scaleY,
        rect.width * scaleX,
        rect.height * scaleY,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      setScreenshot(canvas.toDataURL("image/png"));
      setScreenshotSelection(undefined);
    };
    image.src = screenshotSelection;
  }

  function markGenerationStopped(
    messageIndex?: number,
    targetSessionId = sessionRef.current?.id,
  ) {
    if (!targetSessionId) return;
    updateSessionMessages(targetSessionId, (items) => {
      if (!items.length) return items;
      const next = [...items];
      const index = messageIndex ?? next.length - 1;
      const last = next[index];
      if (!last || last.role !== "assistant") return next;
      // 与失败一致：用 status 徽标表达“已停止”，不把提示文本塞进正文。
      next[index] = {
        ...last,
        status: "stopped",
        stopped: true,
        stage: undefined,
      };
      return next;
    });
  }

  function markGenerationFailed(
    message: string,
    messageIndex?: number,
    targetSessionId = sessionRef.current?.id,
  ) {
    if (!targetSessionId) return;
    const visibleMessage = message || t.requestFailed;
    if (sessionRef.current?.id === targetSessionId) setError(visibleMessage);
    updateSessionMessages(targetSessionId, (items) => {
      if (!items.length) return items;
      const next = [...items];
      const index = messageIndex ?? next.length - 1;
      const last = next[index];
      if (!last || last.role !== "assistant") return next;
      // 用独立的 status 徽标承载错误信息，不再拼进正文——避免“复制回答”把错误提示
      // 一起拷走，也避免破坏 Markdown 结构（尤其是代码围栏）。
      next[index] = {
        ...last,
        status: "failed",
        errorMessage: visibleMessage,
        stage: undefined,
      };
      return next;
    });
  }

  function stageLabel(key: string, tool?: string) {
    switch (key) {
      case "analyzing":
        return t.stageAnalyzing;
      case "routing":
        return t.stageRouting;
      case "delegating":
        return t.stageDelegating;
      case "knowledge":
        return t.stageKnowledge;
      case "generating":
        return t.stageGenerating;
      case "processing":
        return t.stageProcessing;
      case "summarizing":
        return t.stageSummarizing;
      case "tool":
        return t.stageTool(tool || "");
      default:
        return t.thinking;
    }
  }

  async function dataUrlFromObjectUrl(url: string): Promise<string> {
    if (url.startsWith("data:")) return url;
    const blob = await fetch(url).then((response) => {
      if (!response.ok) throw Error("图片读取失败");
      return response.blob();
    });
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error || Error("图片读取失败"));
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToFile(dataUrl: string, name: string): File {
    const [meta, base64] = dataUrl.split(",");
    const mime = (meta.match(/:(.*?);/) || [])[1] || "image/png";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], name, { type: mime });
  }

  async function restoreAttachments(atts: AttachmentView[]) {
    const restored: PendingAttachment[] = [];
    for (const att of atts) {
      try {
        const blob = await apiFetch(`/attachments/${att.id}`).then((response) =>
          response.blob(),
        );
        const file = new File([blob], att.filename, {
          type: att.contentType || "application/octet-stream",
        });
        restored.push({
          name: att.filename,
          size: file.size,
          type: file.type || "application/octet-stream",
          url: URL.createObjectURL(file),
          file,
        });
      } catch {
        // 单条附件恢复失败不影响其余
      }
    }
    setAttachments((items) => [...items, ...restored]);
  }

  async function editAndResend(message: Msg, messageIndex: number) {
    if (sessionBusy) return;
    const targetSessionId = sessionRef.current?.id;
    if (!targetSessionId) return;
    setInput(message.content.replace(new RegExp(`\\n\\n${t.stopped}$`), ""));
    setScreenshot(undefined);
    setAttachments([]);
    updateSessionMessages(targetSessionId, (items) =>
      items.slice(0, messageIndex),
    );
    if (message.attachments?.length) {
      try {
        await restoreAttachments(message.attachments);
      } catch {
        setError(t.copyFailed);
      }
    }
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  async function send(retryRequest?: {
    assistantIndex: number;
    userMessage: Msg;
  }) {
    // 每个会话使用独立的同步发送锁，防止同一会话被重复提交，同时允许其他会话并行发送。
    const targetSession = sessionRef.current;
    const targetSessionId = targetSession?.id;
    if (!targetSessionId || busySessionsRef.current.has(targetSessionId))
      return;
    const text = retryRequest
      ? retryRequest.userMessage.content.trim()
      : input.trim();
    const pendingAttachments: PendingAttachment[] = retryRequest
      ? (retryRequest.userMessage.attachments || []).map((attachment) => ({
          id: attachment.id,
          name: attachment.filename,
          size: attachment.size,
          type: attachment.contentType,
          url: attachment.url,
        }))
      : attachments;
    const pendingScreenshot = retryRequest ? undefined : screenshot;
    if (!text && !pendingAttachments.length && !pendingScreenshot) return;
    const controller = new AbortController();
    streamControllersRef.current.set(targetSessionId, controller);

    // 先把附件（含截图）上传到后端（MinIO/本地），拿到带 id 与取回地址的视图。
    // 这样无论图片还是文件，重进会话后都能从历史接口恢复。
    let uploaded: AttachmentView[] = [];
    if (!retryRequest) {
      const filesToUpload: File[] = [];
      for (const attachment of pendingAttachments) {
        if (attachment.file) filesToUpload.push(attachment.file);
      }
      if (pendingScreenshot) {
        filesToUpload.push(
          dataUrlToFile(pendingScreenshot, `screenshot-${Date.now()}.png`),
        );
      }
      if (filesToUpload.length) {
        try {
          const form = new FormData();
          for (const file of filesToUpload)
            form.append("files", file, file.name);
          const response = await apiFetch("/attachments", {
            method: "POST",
            body: form,
          });
          if (!response.ok) throw Error(t.uploadFailed);
          uploaded = await response.json();
        } catch (e) {
          setError((e as Error).message || t.uploadFailed);
          streamControllersRef.current.delete(targetSessionId);
          return;
        }
      }
    }

    const retryAttachmentIds = retryRequest
      ? pendingAttachments.flatMap((attachment) =>
          attachment.id ? [attachment.id] : [],
        )
      : [];
    const assistantIndex = retryRequest
      ? retryRequest.assistantIndex
      : (messagesBySessionRef.current.get(targetSessionId) || []).length + 1;

    if (!retryRequest) {
      setInput("");
      setAttachments([]);
      setScreenshot(undefined);
    }
    busySessionsRef.current.add(targetSessionId);
    setBusySessionIds((current) => new Set(current).add(targetSessionId));
    streamingSessionIdRef.current = targetSessionId;
    setError("");

    if (retryRequest) {
      updateSessionMessages(targetSessionId, (items) =>
        items.map((item, index) =>
          index === assistantIndex
            ? {
                ...item,
                content: "",
                stopped: false,
                stage: undefined,
                agentName: undefined,
                status: undefined,
                errorMessage: undefined,
                toolTrace: [],
              }
            : item,
        ),
      );
    } else {
      // 组装乐观消息：用后端返回的 url 直接渲染，重进后也能恢复。
      const messageAttachments: AttachmentView[] = [];
      let uploadIndex = 0;
      for (const attachment of pendingAttachments) {
        if (attachment.file) messageAttachments.push(uploaded[uploadIndex++]);
      }
      if (pendingScreenshot) messageAttachments.push(uploaded[uploadIndex++]);
      updateSessionMessages(targetSessionId, (items) => [
        ...items,
        { role: "user", content: text, attachments: messageAttachments },
        { role: "assistant", content: "" },
      ]);
    }

    let pageContext = "";
    let contextError = "";
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const ids = selectedTabIds.length
        ? selectedTabIds
        : tabs[0]?.id != null
          ? [tabs[0].id]
          : [];
      if (readPageEnabled && ids.length) {
        actionTabIdRef.current = ids[0];
        const contexts = (
          await Promise.all(
            ids.map(async (id) =>
              (await collectContextsFromTab(id)).map(
                (context): Record<string, any> => ({
                  ...context,
                  tabId: id,
                }),
              ),
            ),
          )
        ).flat();
        const meaningful = contexts.filter(
          (ctx): ctx is Record<string, any> =>
            ctx != null && !!(ctx.url || ctx.title || ctx.visibleText),
        );
        if (meaningful.length === 0) {
          const tab = await chrome.tabs.get(ids[0]).catch(() => undefined);
          const pattern = originPattern(tab?.url);
          const hasPermission =
            pattern != null &&
            (await chrome.permissions.contains({ origins: [pattern] }));
          contextError = hasPermission
            ? t.pageContextReadFailed
            : t.pageContextPermissionRequired;
          if (!hasPermission) setReadPageEnabled(false);
        }
        meaningful.forEach((context) => {
          if (context.snapshotId && Number.isInteger(context.tabId)) {
            actionTargetTabRef.current.set(context.snapshotId, context.tabId);
          }
        });
        pageContext = JSON.stringify(
          meaningful.map((context) => {
            const selected: Record<string, any> = {
              source: "current_page",
              timestamp: context.timestamp,
              tabId: context.tabId,
              frameId: context.frameId,
              snapshotId: context.snapshotId,
            };
            PAGE_INFO_KEYS.forEach((key) => {
              if (pageInfoSelection[key]) selected[key] = context[key];
            });
            return selected;
          }),
        );
      }
    } catch {
      // The active tab may not allow content scripts (for example chrome:// pages).
    }
    if (contextError) setError(contextError);

    let streamError = "";
    let sawContent = false;
    let timedOut = false;
    let timeoutId: number | undefined;
    try {
      if (controller.signal.aborted) {
        markGenerationStopped(assistantIndex, targetSessionId);
        return;
      }
      const armStreamTimeout = () => {
        if (timeoutId) window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, streamTimeoutMsRef.current);
      };
      armStreamTimeout();
      const response = await apiFetch("/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          sessionId: targetSessionId,
          message: text,
          attachmentIds: retryRequest
            ? retryAttachmentIds
            : uploaded.map((u) => u.id),
          retry: Boolean(retryRequest),
          agentId: selectedAgentId || null,
          pageContext,
          permissions: {
            readPage: readPageEnabled,
            autoApprove: actionPermission === "delegate",
            fullControl: actionPermission === "full",
          },
        }),
      });
      if (!response.ok || !response.body) throw Error(t.requestFailed);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // 修改当前助手消息的元信息（内容、Agent 归属、委派关系等）。
      const patchAssistantMsg = (patch: (last: Msg) => Partial<Msg>) => {
        updateSessionMessages(targetSessionId, (items) => {
          const target = items[assistantIndex];
          if (!target || target.role !== "assistant") return items;
          const next = [...items];
          next[assistantIndex] = {
            ...target,
            ...patch(target),
          };
          return next;
        });
      };
      // 流式 token 累加 + 批量 flush：避免每个 delta 都触发整条消息全量重渲染
      // （react-markdown + rehype-highlight 对长回复开销明显），以 ~60ms 节流合并刷新。
      let pendingToken = "";
      let tokenFlushScheduled = false;
      const flushTokens = () => {
        tokenFlushScheduled = false;
        if (!pendingToken) return;
        const chunk = pendingToken;
        pendingToken = "";
        sawContent = true;
        patchAssistantMsg((last) => ({
          content: last.content + chunk,
          stage: undefined,
        }));
      };
      const scheduleTokenFlush = () => {
        if (tokenFlushScheduled) return;
        tokenFlushScheduled = true;
        window.setTimeout(flushTokens, 60);
      };
      // 标准化 SSE 事件解析：逐行解析，多个 data: 行按换行 join（对齐 EventSource 规范），
      // 只剥离 colon 后单个空格的帧封装字符，绝不吞掉正文里的真实空格；事件名同样按规范解析。
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        armStreamTimeout();
        buffer += decoder.decode(value, { stream: true });
        let pendingFrames: ReturnType<typeof parseSseFrame>[] = [];
        buffer = consumeSseBuffer(buffer, (frame) => pendingFrames.push(frame));
        for (const parsed of pendingFrames) {
          if (!parsed) continue;
          const { name, data } = parsed;
          if (name === "token" && data) {
            // 新后端用 JSON 信封 {"text": "..."} 下发正文，任意字符安全；
            // 解析失败则按裸文本处理（兼容未升级的旧后端）。
            let tokenText = data;
            try {
              const parsed = tokenPayloadSchema.safeParse(JSON.parse(data));
              if (parsed.success) tokenText = parsed.data.text;
            } catch {
              /* 保持原始 data（旧后端裸文本格式） */
            }
            if (tokenText) {
              pendingToken += tokenText;
              scheduleTokenFlush();
            }
          }
          if (name === "stage" && data) {
            try {
              const parsed = JSON.parse(data);
              patchAssistantMsg(() => ({
                stage: stageLabel(parsed.key, parsed.tool),
              }));
            } catch {
              /* 忽略无法解析的阶段事件 */
            }
          }
          if (name === "agent_selected" && data) {
            // 让用户看到这条消息实际由哪个 Agent 处理（自动路由时尤其重要）。
            try {
              const selected = JSON.parse(data);
              patchAssistantMsg(() => ({
                agentId: selected.agentId,
                agentName: selected.displayName || selected.agentId,
              }));
            } catch {
              /* 忽略无法解析的事件 */
            }
          }
          if (name === "message_completed" && data) {
            // 用服务端权威完整内容覆盖本地累积内容：即使流式阶段因任意原因被损坏，
            // 此处也能一次性纠偏（message_completed 仅在正常完成时下发）。
            try {
              const completed = JSON.parse(data);
              if (typeof completed.content === "string") {
                flushTokens();
                if (completed.content) sawContent = true;
                // 若用户中途点了停止，保留 stopped 状态，不被完成的权威内容覆盖
                // （后端正常完成才会下发 message_completed，此处仅兜底极端竞态）。
                patchAssistantMsg((last) => ({
                  content: completed.content,
                  stage: undefined,
                  stopped: last.stopped,
                  status: last.stopped ? "stopped" : "ok",
                }));
              }
            } catch {
              /* 忽略无法解析的事件 */
            }
          }
          if (name === "action_proposed" && data) {
            try {
              const parsedAction = actionProposalSchema.safeParse(
                JSON.parse(data),
              );
              if (!parsedAction.success) {
                throw new Error(t.invalidAction);
              }
              const action = parsedAction.data;
              if (browserProtocolMismatch) {
                await apiFetch(`/actions/${action.actionId}/result`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    status: "FAILED",
                    result: JSON.stringify({
                      ok: false,
                      error: t.capabilityMismatch,
                    }),
                  }),
                });
                continue;
              }
              const autoApproved =
                action.readOnly === true || actionPermission === "full";
              let approved =
                autoApproved ||
                (await askConfirm({
                  title: t.actionConfirmTitle,
                  danger: action.risk === "high",
                  message: t
                    .actionConfirm(
                      action.type,
                      action.reason || "",
                      action.risk || "",
                    )
                    .split("\n")
                    .map((line, index) => (
                      <React.Fragment key={index}>
                        {line}
                        {index > 0 ? <br /> : null}
                      </React.Fragment>
                    )),
                }));
              let result = {
                status: approved ? "EXECUTED" : "REJECTED",
                result: approved ? "" : t.rejected,
              };
              if (approved) {
                if (action.type === "NAVIGATE") {
                  try {
                    const destination = new URL(
                      String(action.arguments?.url || ""),
                    );
                    const granted = await chrome.permissions.contains({
                      origins: [`${destination.origin}/*`],
                    });
                    if (!granted) {
                      throw new Error(t.pageContextReadFailed);
                    }
                  } catch {
                    approved = false;
                    result = {
                      status: "FAILED",
                      result: JSON.stringify({
                        ok: false,
                        error: t.pageContextReadFailed,
                      }),
                    };
                  }
                }
              }
              if (approved && result.status === "EXECUTED") {
                const tabs = await chrome.tabs.query({
                  active: true,
                  currentWindow: true,
                });
                const tabId =
                  (typeof action.target === "object" &&
                  action.target?.snapshotId
                    ? actionTargetTabRef.current.get(action.target.snapshotId)
                    : undefined) ??
                  actionTabIdRef.current ??
                  tabs[0]?.id;
                if (tabId == null) {
                  result = {
                    status: "FAILED",
                    result: JSON.stringify({
                      ok: false,
                      error: t.pageContextReadFailed,
                    }),
                  };
                } else {
                  try {
                    const execution =
                      action.type === "SET_EDITOR"
                        ? await executeEditorAction(tabId, action)
                        : await chrome.tabs.sendMessage(
                            tabId,
                            {
                              type: "EXECUTE_ACTION",
                              action,
                            },
                            {
                              frameId:
                                action.target &&
                                typeof action.target === "object" &&
                                Number.isInteger(action.target?.frameId)
                                  ? action.target.frameId
                                  : 0,
                            },
                          );
                    const observations = await collectContextsFromTab(tabId);
                    const observation =
                      observations.length === 1
                        ? observations[0]
                        : observations;
                    result = {
                      status:
                        (execution as { ok?: boolean } | undefined)?.ok ===
                        false
                          ? "FAILED"
                          : "EXECUTED",
                      result: JSON.stringify({ execution, observation }),
                    };
                  } catch (actionError) {
                    result = {
                      status: "FAILED",
                      result: JSON.stringify({
                        ok: false,
                        error:
                          (actionError as Error).message || String(actionError),
                      }),
                    };
                  }
                }
              }
              await apiFetch(`/actions/${action.actionId}/result`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(result),
              });
            } catch {
              setError(t.invalidAction);
            }
          }
          if (name === "tool_invoked" && data) {
            // 工具调用过程可视化：追加到独立的 toolTrace，再由 UI 折叠区渲染，不污染正文。
            try {
              const payload = JSON.parse(data);
              patchAssistantMsg((last) => ({
                toolTrace: [
                  ...(last.toolTrace || []),
                  { tool: payload.tool, arguments: payload.arguments },
                ],
              }));
            } catch {
              /* 忽略无法解析的工具事件 */
            }
          }
          if (name === "tool_result" && data) {
            try {
              const payload = JSON.parse(data);
              patchAssistantMsg((last) => {
                const next = [...(last.toolTrace || [])];
                const idx = next.findIndex(
                  (step) => step.tool === payload.tool && step.result == null,
                );
                if (idx >= 0) {
                  next[idx] = {
                    ...next[idx],
                    result: payload.result,
                    success: payload.success,
                  };
                } else {
                  next.push({
                    tool: payload.tool,
                    result: payload.result,
                    success: payload.success,
                  });
                }
                return { toolTrace: next };
              });
            } catch {
              /* 忽略无法解析的工具事件 */
            }
          }
          if (name === "error" && data) {
            // 后端以 JSON 形式下发 { code, message }，直接展示原始 data 会把 JSON 暴露给用户。
            let message = data;
            try {
              const parsed = JSON.parse(data);
              if (parsed?.code === "MODEL_TIMEOUT") message = t.modelTimeout;
              else if (parsed?.code === "MODEL_ERROR")
                message = t.modelUnavailable;
              else if (parsed && typeof parsed.message === "string")
                message = parsed.message;
            } catch {
              /* 非 JSON 时按纯文本处理 */
            }
            streamError = message;
            markGenerationFailed(message, assistantIndex, targetSessionId);
          }
        }
      }
      flushTokens();
      if (!sawContent && !streamError)
        markGenerationFailed(t.requestFailed, assistantIndex, targetSessionId);
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") {
        if (timedOut)
          markGenerationFailed(
            t.requestTimeout,
            assistantIndex,
            targetSessionId,
          );
        else markGenerationStopped(assistantIndex, targetSessionId);
      } else if (!streamError) {
        const rawMessage = (e as Error).message?.trim();
        markGenerationFailed(
          !rawMessage || rawMessage === "Failed to fetch"
            ? t.backendError
            : rawMessage,
          assistantIndex,
          targetSessionId,
        );
      }
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (streamControllersRef.current.get(targetSessionId) === controller) {
        streamControllersRef.current.delete(targetSessionId);
      }
      busySessionsRef.current.delete(targetSessionId);
      setBusySessionIds((current) => {
        const next = new Set(current);
        next.delete(targetSessionId);
        return next;
      });
      if (streamingSessionIdRef.current === targetSessionId) {
        streamingSessionIdRef.current = undefined;
      }
    }
  }

  function retryMessage(messageIndex: number) {
    if (sessionBusy || messageIndex !== msgs.length - 1) return;
    const assistantMessage = msgs[messageIndex];
    const userMessage = msgs[messageIndex - 1];
    if (
      !assistantMessage ||
      assistantMessage.role !== "assistant" ||
      !userMessage ||
      userMessage.role !== "user"
    ) {
      return;
    }
    void send({ assistantIndex: messageIndex, userMessage });
  }

  function stopGeneration() {
    const sessionId = sessionRef.current?.id;
    if (!sessionId) return;
    streamControllersRef.current.get(sessionId)?.abort();
  }

  async function grantApiPermission() {
    try {
      const granted = await chrome.permissions.request({
        origins: [apiOriginPattern(API_BASE)],
      });
      if (granted) window.location.reload();
    } catch {
      setError(t.backendError);
    }
  }

  const generalAgents = agents.filter((agent) => agent.role === "GENERAL");
  const domainAgents = agents.filter((agent) => agent.role === "DOMAIN");
  const activeSessionIndex = sessions.findIndex(
    (conversation) => conversation.id === session?.id,
  );
  const visibleSessions =
    activeSessionIndex >= MAX_VISIBLE_SESSION_TABS
      ? [
          ...sessions.slice(0, MAX_VISIBLE_SESSION_TABS - 1),
          sessions[activeSessionIndex],
        ]
      : sessions.slice(0, MAX_VISIBLE_SESSION_TABS);

  return (
    <div className="app">
      <header>
        <div>
          <h1>Intra Copilot</h1>
          <small>{t.appSubtitle}</small>
        </div>
        <div className="header-actions">
          <button className="icon-button" onClick={create} title={t.newSession}>
            ＋
          </button>
          <button
            className="icon-button history-button"
            onClick={() => setHistoryOpen(true)}
            title={t.history}
            aria-label={t.history}
          >
            {t.history}
          </button>
          <button
            className="icon-button settings-button"
            onClick={() => setSettingsOpen((open) => !open)}
            title={t.settings}
            aria-label={t.settings}
          >
            ⚙
          </button>
          {settingsOpen && (
            <div className="settings-popover">
              <div className="settings-title">{t.appearance}</div>
              <label>
                <input
                  type="radio"
                  name="theme"
                  checked={theme === "system"}
                  onChange={() => setTheme("system")}
                />
                {t.followSystem}
              </label>
              <label>
                <input
                  type="radio"
                  name="theme"
                  checked={theme === "light"}
                  onChange={() => setTheme("light")}
                />
                {t.light}
              </label>
              <label>
                <input
                  type="radio"
                  name="theme"
                  checked={theme === "dark"}
                  onChange={() => setTheme("dark")}
                />
                {t.dark}
              </label>
              <div className="settings-title language-title">{t.language}</div>
              <label>
                <input
                  type="radio"
                  name="language"
                  checked={language === "zh"}
                  onChange={() => setLanguage("zh")}
                />
                {t.chinese}
              </label>
              <label>
                <input
                  type="radio"
                  name="language"
                  checked={language === "en"}
                  onChange={() => setLanguage("en")}
                />
                {t.english}
              </label>
              <div className="settings-title language-title">
                {t.sidePanelScope}
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={sidePanelAllTabs}
                  disabled={currentTabId == null || currentWindowId == null}
                  onChange={(event) =>
                    void updateSidePanelAllTabs(event.target.checked)
                  }
                />
                {t.sidePanelAllTabs}
              </label>
              <div className="settings-title language-title">
                {t.activationScope}
              </div>
              <label>
                <input
                  type="radio"
                  name="activationMode"
                  checked={activationMode === "all_pages"}
                  onChange={() => setActivationMode("all_pages")}
                />
                {t.allPages}
              </label>
              <label>
                <input
                  type="radio"
                  name="activationMode"
                  checked={activationMode === "manual"}
                  onChange={() => setActivationMode("manual")}
                />
                {t.manualPages}
              </label>
              {(activationMode === "manual" || !currentTabEnabled) && (
                <button
                  className="current-page-toggle"
                  onClick={toggleCurrentTab}
                  disabled={currentTabId == null}
                >
                  {currentTabEnabled
                    ? t.disableCurrentPage
                    : t.enableCurrentPage}
                </button>
              )}
            </div>
          )}
        </div>
      </header>
      <div className="session-tab-bar">
        <nav className="session-tabs" aria-label={t.chatWindows}>
          {visibleSessions.map((conversation) =>
            (() => {
              const index = sessions.findIndex(
                (item) => item.id === conversation.id,
              );
              const editing = editingSessionId === conversation.id;
              const isDropBefore =
                dropTarget != null &&
                dropTarget.id === conversation.id &&
                dropTarget.before;
              const isDropAfter =
                dropTarget != null &&
                dropTarget.id === conversation.id &&
                !dropTarget.before;
              return (
                <button
                  key={conversation.id}
                  className={
                    "session-tab " +
                    (conversation.id === session?.id ? "active " : "") +
                    (isDropBefore ? "drop-before " : "") +
                    (isDropAfter ? "drop-after" : "")
                  }
                  onClick={() => {
                    if (!editing) select(conversation);
                  }}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    beginRename(conversation);
                  }}
                  draggable={!editing}
                  onDragStart={(event) => beginDrag(conversation, event)}
                  onDragEnd={endDrag}
                  onDragOver={(event) => {
                    if (!editing) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      updateDropTarget(conversation.id, event, "x");
                    }
                  }}
                  onDragLeave={(event) => {
                    const next = event.relatedTarget as Node | null;
                    if (
                      dropTarget?.id === conversation.id &&
                      (!next || !event.currentTarget.contains(next))
                    ) {
                      setDropTarget(undefined);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const rect = event.currentTarget.getBoundingClientRect();
                    const before = event.clientX < rect.left + rect.width / 2;
                    dropOnSession(conversation.id, before);
                  }}
                  title={sessionTitle(conversation, index)}
                >
                  {editing ? (
                    <input
                      className="session-tab-input"
                      value={editingTitle}
                      autoFocus
                      maxLength={80}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") saveRename(conversation);
                        if (event.key === "Escape") cancelRename();
                      }}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={t.editTitle}
                    />
                  ) : (
                    sessionTitle(conversation, index)
                  )}
                </button>
              );
            })(),
          )}
        </nav>
        {sessions.length > MAX_VISIBLE_SESSION_TABS - 1 && (
          <div className="session-more" ref={sessionMoreRef}>
            <button
              type="button"
              className={
                "session-more-button" + (moreSessionsOpen ? " active" : "")
              }
              onClick={() => setMoreSessionsOpen((open) => !open)}
              title={t.moreSessions}
              aria-label={t.moreSessions}
              aria-expanded={moreSessionsOpen}
            >
              …
            </button>
            {moreSessionsOpen && (
              <div className="session-more-menu">
                <div className="session-more-title">{t.moreSessions}</div>
                {sessions.map((conversation, index) => (
                  <button
                    type="button"
                    key={conversation.id}
                    className={
                      "session-more-item" +
                      (conversation.id === session?.id ? " active" : "")
                    }
                    onClick={() => {
                      setMoreSessionsOpen(false);
                      void select(conversation);
                    }}
                  >
                    <span>{sessionTitle(conversation, index)}</span>
                    {busySessionIds.has(conversation.id) && (
                      <small>{t.processingSession}</small>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div
        className={
          "content-area" +
          (attachments.length > 0 || screenshot || composerExpanded
            ? " composer-tall"
            : "")
        }
      >
        <main ref={mainRef}>
          {msgs.length === 0 && <div className="empty">{t.empty}</div>}
          {msgs.map((message, index) => {
            const assistant = message.role === "assistant";
            return (
              <div key={index} className={"msg " + message.role}>
                <div
                  className={"role " + (assistant ? "assistant-avatar" : "")}
                  aria-label={assistant ? t.assistant : t.you}
                  title={assistant ? t.assistant : t.you}
                >
                  {assistant ? (
                    <>
                      <span aria-hidden="true">◆</span>
                      <span className="sr-only">{t.assistant}</span>
                    </>
                  ) : (
                    t.you
                  )}
                </div>
                <div className="message-stack">
                  <div className="bubble">
                    {assistant && message.agentName ? (
                      <div className="agent-badges">
                        <span
                          className="agent-badge"
                          title={`${t.handledBy}: ${message.agentName}`}
                        >
                          {message.agentName}
                        </span>
                      </div>
                    ) : null}
                    {!assistant && message.attachments?.length ? (
                      <div className="message-attachments">
                        {message.attachments.map((att, attIndex) => (
                          <MessageAttachmentView
                            key={`${index}-att-${attIndex}`}
                            att={att}
                            fetchFn={apiFetch}
                            previewLabel={t.imagePreview}
                            onPreview={(id) =>
                              resolveAttachment(apiFetch, id)
                                .then(setPreviewImage)
                                .catch(() => {})
                            }
                          />
                        ))}
                      </div>
                    ) : null}
                    {assistant ? (
                      message.content ? (
                        <div className="assistant-content">
                          <AssistantMarkdown
                            content={message.content}
                            messageIndex={index}
                            copiedCode={copiedCode}
                            onCopyCode={copyCode}
                            copyCodeLabel={t.copyCode}
                            copiedLabel={t.copied}
                          />
                        </div>
                      ) : (
                        <span className="thinking-indicator">
                          {message.stage ||
                            (message.status === "failed"
                              ? message.errorMessage || t.generationFailed
                              : message.status === "stopped"
                                ? t.stopped
                                : t.thinking)}
                        </span>
                      )
                    ) : (
                      message.content ||
                      (message.attachments?.length ? t.imageOnly : t.thinking)
                    )}
                  </div>
                  {assistant && message.toolTrace?.length ? (
                    <ToolTraceView
                      trace={message.toolTrace}
                      title={t.toolTrace}
                      argsLabel={t.toolArgs}
                      resultLabel={t.toolResult}
                      okLabel={t.toolOk}
                      failLabel={t.toolFail}
                      browserActionName={t.browserActionName}
                      browserActionReason={t.browserActionReason}
                      browserActionLabels={{
                        SET_EDITOR: t.browserActionSetEditor,
                        CLICK: t.browserActionClick,
                        FILL: t.browserActionFill,
                        NAVIGATE: t.browserActionNavigate,
                      }}
                      systemAgentTaskName={t.systemAgentTaskName}
                      systemAgentGoalLabel={t.systemAgentGoalLabel}
                    />
                  ) : null}
                  {assistant &&
                  message.status &&
                  message.status !== "ok" &&
                  message.content ? (
                    <div className={"msg-status status-" + message.status}>
                      {message.status === "stopped"
                        ? t.stopped
                        : message.errorMessage || t.generationFailed}
                    </div>
                  ) : null}
                  {!assistant &&
                    index < msgs.length - 1 &&
                    msgs[index + 1]?.role === "assistant" &&
                    msgs[index + 1]?.stopped && (
                      <div className="message-actions user-message-actions">
                        <button
                          type="button"
                          className="message-action edit-resend-action"
                          onClick={() => editAndResend(message, index)}
                          title={t.editResend}
                          aria-label={t.editResend}
                        >
                          ↻ {t.editResend}
                        </button>
                      </div>
                    )}
                  {assistant && message.content && (
                    <div
                      className="message-actions"
                      aria-label="Message actions"
                    >
                      <button
                        type="button"
                        className={
                          "message-action feedback-action feedback-up " +
                          (messageFeedback[index] === "up" ? "selected" : "")
                        }
                        onClick={() => void toggleFeedback(index, "up")}
                        disabled={feedbackSubmittingIndex != null}
                        title={
                          messageFeedback[index] === "up"
                            ? t.feedbackCancelHint
                            : t.like
                        }
                        aria-label={t.like}
                        aria-pressed={messageFeedback[index] === "up"}
                      >
                        <FeedbackIcon direction="up" />
                      </button>
                      <button
                        type="button"
                        className={
                          "message-action feedback-action feedback-down " +
                          (messageFeedback[index] === "down" ? "selected" : "")
                        }
                        onClick={() => void toggleFeedback(index, "down")}
                        disabled={feedbackSubmittingIndex != null}
                        title={
                          messageFeedback[index] === "down"
                            ? t.feedbackCancelHint
                            : t.dislike
                        }
                        aria-label={t.dislike}
                        aria-pressed={messageFeedback[index] === "down"}
                      >
                        <FeedbackIcon direction="down" />
                      </button>
                      <button
                        type="button"
                        className="message-action"
                        onClick={() => copyMessage(message.content, index)}
                        title={
                          copiedMessage === index ? t.copied : t.copyMessage
                        }
                        aria-label={
                          copiedMessage === index ? t.copied : t.copyMessage
                        }
                      >
                        {copiedMessage === index ? "✓" : "⧉"}
                      </button>
                      {index === msgs.length - 1 &&
                        msgs[index - 1]?.role === "user" && (
                          <button
                            type="button"
                            className="message-action retry-action"
                            onClick={() => retryMessage(index)}
                            disabled={sessionBusy}
                            title={t.retry}
                            aria-label={t.retry}
                          >
                            ↻
                          </button>
                        )}
                    </div>
                  )}
                  {assistant &&
                    message.content &&
                    inlineFeedbackIndex === index && (
                      <div
                        className="feedback-inline"
                        role="region"
                        aria-label={t.feedbackInlineTitle}
                      >
                        <div className="feedback-inline-title">
                          {t.feedbackInlineTitle}
                        </div>
                        <div className="feedback-inline-hint">
                          {t.feedbackInlineHint}
                        </div>
                        <div className="feedback-inline-chips">
                          {(
                            [
                              ["INACCURATE", t.feedbackChipInaccurate],
                              ["IRRELEVANT", t.feedbackChipIrrelevant],
                              ["TOO_LONG", t.feedbackChipTooLong],
                              ["FORMAT_UI", t.feedbackChipFormat],
                              ["OTHER", t.feedbackChipOther],
                            ] as const
                          ).map(([code, label]) => (
                            <button
                              key={code}
                              type="button"
                              className={
                                "feedback-chip" +
                                (inlineFeedbackReason === code
                                  ? " selected"
                                  : "")
                              }
                              aria-pressed={inlineFeedbackReason === code}
                              disabled={feedbackSubmittingIndex != null}
                              onClick={() => {
                                setInlineFeedbackReason((current) =>
                                  current === code ? undefined : code,
                                );
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <textarea
                          className="feedback-inline-input"
                          rows={2}
                          value={inlineFeedbackComment}
                          onChange={(event) =>
                            setInlineFeedbackComment(event.target.value)
                          }
                          placeholder={t.feedbackInlinePlaceholder}
                          aria-label={t.feedbackInlinePlaceholder}
                          disabled={feedbackSubmittingIndex != null}
                        />
                        <div className="feedback-inline-actions">
                          <button
                            type="button"
                            className="feedback-inline-skip"
                            onClick={() => {
                              setInlineFeedbackIndex(undefined);
                              setInlineFeedbackReason(undefined);
                              setInlineFeedbackComment("");
                            }}
                            disabled={feedbackSubmittingIndex != null}
                          >
                            {t.feedbackInlineSkip}
                          </button>
                          <button
                            type="button"
                            className="feedback-inline-submit"
                            onClick={() => void submitInlineFeedback()}
                            disabled={
                              feedbackSubmittingIndex != null ||
                              (!inlineFeedbackReason &&
                                !inlineFeedbackComment.trim())
                            }
                          >
                            {feedbackSubmittingIndex != null
                              ? t.feedbackSubmitting
                              : t.feedbackInlineSubmit}
                          </button>
                        </div>
                      </div>
                    )}
                </div>
              </div>
            );
          })}
          <div ref={end} />
        </main>
        {error && (
          <div className="error" role="alert">
            <span className="error-message">{error}</span>
            {needsApiPermission && (
              <button type="button" onClick={() => void grantApiPermission()}>
                授权后端访问
              </button>
            )}
            <button
              type="button"
              className="error-dismiss"
              onClick={() => setError("")}
              title={t.dismissError}
              aria-label={t.dismissError}
            >
              ×
            </button>
          </div>
        )}
      </div>
      {historyOpen && (
        <div className="history-overlay" onClick={() => setHistoryOpen(false)}>
          <aside
            className="history-drawer"
            onClick={(event) => event.stopPropagation()}
            aria-label={t.history}
          >
            <div className="history-header">
              <div>
                <h2>{t.history}</h2>
                <small>{t.historyLabel(sessions.length)}</small>
              </div>
              <button
                className="close-button"
                onClick={() => setHistoryOpen(false)}
                aria-label={t.closeHistory}
              >
                ×
              </button>
            </div>
            <label className="history-select-all">
              <input
                type="checkbox"
                checked={
                  sessions.length > 0 &&
                  selectedSessions.length === sessions.length
                }
                onChange={toggleAllSessions}
              />
              {t.selectAll}
            </label>
            <div className="history-list">
              {sessions.length === 0 && (
                <div className="history-empty">{t.noHistory}</div>
              )}
              {sessions.map((conversation, index) => {
                const editing = editingSessionId === conversation.id;
                const isDropBefore =
                  dropTarget != null &&
                  dropTarget.id === conversation.id &&
                  dropTarget.before;
                const isDropAfter =
                  dropTarget != null &&
                  dropTarget.id === conversation.id &&
                  !dropTarget.before;
                return (
                  <div
                    key={conversation.id}
                    className={
                      "history-item " +
                      (conversation.id === session?.id ? "active" : "") +
                      (isDropBefore ? " drop-before" : "") +
                      (isDropAfter ? " drop-after" : "")
                    }
                    onClick={() => {
                      if (!editing) {
                        select(conversation);
                        setHistoryOpen(false);
                      }
                    }}
                    draggable={!editing}
                    onDragStart={(event) => beginDrag(conversation, event)}
                    onDragEnd={endDrag}
                    onDragOver={(event) => {
                      if (!editing) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        updateDropTarget(conversation.id, event);
                      }
                    }}
                    onDragLeave={(event) => {
                      const next = event.relatedTarget as Node | null;
                      if (
                        dropTarget?.id === conversation.id &&
                        (!next || !event.currentTarget.contains(next))
                      ) {
                        setDropTarget(undefined);
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      const before = event.clientY < rect.top + rect.height / 2;
                      dropOnSession(conversation.id, before);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSessions.includes(conversation.id)}
                      onChange={() => toggleSession(conversation.id)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={t.selectSession(
                        sessionTitle(conversation, index),
                      )}
                    />
                    {editing ? (
                      <input
                        className="rename-input"
                        value={editingTitle}
                        autoFocus
                        maxLength={80}
                        onChange={(event) =>
                          setEditingTitle(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") saveRename(conversation);
                          if (event.key === "Escape") cancelRename();
                        }}
                        onClick={(event) => event.stopPropagation()}
                      />
                    ) : (
                      <span className="history-item-title">
                        {sessionTitle(conversation, index)}
                      </span>
                    )}
                    <div className="history-item-actions">
                      {editing ? (
                        <>
                          <button
                            className="mini-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              saveRename(conversation);
                            }}
                            title={t.saveNameTitle}
                          >
                            {t.save}
                          </button>
                          <button
                            className="mini-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              cancelRename();
                            }}
                            title={t.cancelEditTitle}
                          >
                            {t.cancel}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="mini-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              beginRename(conversation);
                            }}
                            title={t.editTitle}
                          >
                            {t.edit}
                          </button>
                          <button
                            className="mini-button danger-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeSessions([conversation.id]);
                            }}
                            title={t.deleteTitle}
                          >
                            {t.delete}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="history-footer">
              <button
                className="danger-button bulk-delete-button"
                disabled={!selectedSessions.length}
                onClick={() => removeSessions(selectedSessions)}
              >
                {t.bulkDelete}
                {selectedSessions.length
                  ? `（${selectedSessions.length}）`
                  : ""}
              </button>
            </div>
          </aside>
        </div>
      )}
      <footer>
        <div
          className={"composer" + (composerExpanded ? " expanded" : "")}
          ref={composerRef}
        >
          <div className="composer-agent-row">
            <label className="agent-picker" title={t.agentSelector}>
              <span className="sr-only">{t.agentSelector}</span>
              <select
                value={selectedAgentId}
                onChange={(event) => setSelectedAgentId(event.target.value)}
                disabled={sessionBusy}
                aria-label={t.agentSelector}
              >
                <option value="">{t.agentAuto}</option>
                {generalAgents.length > 0 && (
                  <optgroup label={t.agentGeneralGroup}>
                    {generalAgents.map((agent) => (
                      <option
                        key={agent.id}
                        value={agent.id}
                        title={agent.description}
                      >
                        {agent.displayName}
                      </option>
                    ))}
                  </optgroup>
                )}
                {domainAgents.length > 0 && (
                  <optgroup label={t.agentDomainGroup}>
                    {domainAgents.map((agent) => (
                      <option
                        key={agent.id}
                        value={agent.id}
                        title={agent.description}
                      >
                        {agent.displayName}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <svg
                className="agent-picker-chevron"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path d="m6 8 4 4 4-4" />
              </svg>
            </label>
            <button
              type="button"
              className={
                "agent-refresh-button" + (agentsLoading ? " loading" : "")
              }
              onClick={() => void loadAgents()}
              disabled={!authedFetch || agentsLoading}
              title={t.agentRefresh}
              aria-label={t.agentRefresh}
              aria-busy={agentsLoading}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 11a8 8 0 0 0-13.7-5.7L4 7.5" />
                <path d="M4 3v4.5h4.5" />
                <path d="M4 13a8 8 0 0 0 13.7 5.7L20 16.5" />
                <path d="M20 21v-4.5h-4.5" />
              </svg>
            </button>
          </div>
          <div className="composer-row">
            {(attachments.length > 0 || screenshot) && (
              <div className="composer-previews">
                {attachments.map((attachment) => (
                  <div className="attachment-chip" key={attachment.url}>
                    {attachment.type.startsWith("image/") ? (
                      <button
                        type="button"
                        className="attachment-image-button"
                        onClick={() => setPreviewImage(attachment.url)}
                        title={t.imagePreview}
                        aria-label={`${t.imagePreview}: ${attachment.name}`}
                      >
                        <img src={attachment.url} alt={attachment.name} />
                      </button>
                    ) : (
                      <span className="file-icon">📎</span>
                    )}
                    <span title={attachment.name}>{attachment.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(attachment.url)}
                      title={t.removeAttachment}
                      aria-label={t.removeAttachment}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {screenshot && (
                  <div className="screenshot-preview">
                    <button
                      type="button"
                      className="screenshot-image-button"
                      onClick={() => setPreviewImage(screenshot)}
                      title={t.imagePreview}
                      aria-label={t.imagePreview}
                    >
                      <img src={screenshot} alt={t.screenshot} />
                    </button>
                    <button
                      type="button"
                      className="screenshot-remove-button"
                      title={t.removeAttachment}
                      aria-label={t.removeAttachment}
                      onClick={(event) => {
                        event.stopPropagation();
                        setScreenshot(undefined);
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="composer-input-shell">
              <button
                type="button"
                className="composer-expand-button"
                onClick={() => setComposerExpanded((expanded) => !expanded)}
                title={composerExpanded ? t.collapseComposer : t.expandComposer}
                aria-label={
                  composerExpanded ? t.collapseComposer : t.expandComposer
                }
              >
                {composerExpanded ? "↙" : "↗"}
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onPaste={onInputPaste}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.altKey
                  ) {
                    event.preventDefault();
                    send();
                  }
                }}
                placeholder={t.inputPlaceholder}
                aria-label={t.chatInput}
              />
            </div>
            <button
              className={"send-button" + (sessionBusy ? " stop-button" : "")}
              onClick={sessionBusy ? stopGeneration : () => void send()}
              title={sessionBusy ? t.stop : t.send}
              aria-label={sessionBusy ? t.stop : t.send}
            >
              {sessionBusy ? "■" : t.send}
            </button>
          </div>
          <div className="composer-tools" ref={composerToolsRef}>
            <button
              className="tool-button"
              onClick={openTools}
              title={t.addTools}
              aria-label={t.addTools}
            >
              ＋
            </button>
            <button
              className="tool-button permission-button"
              onClick={() => {
                setToolsOpen(false);
                setPermissionOpen((open) => !open);
              }}
              title={t.permission}
              aria-label={t.permission}
            >
              ◉ {t.permission}
            </button>
            {toolsOpen && (
              <div className="tool-popover tools-menu">
                <div className="tools-menu-title">{t.attachmentMenu}</div>
                <div className="tabs-hint">{t.tabsHint}</div>
                <div className="tab-picker-list">
                  {availableTabs.length === 0 && (
                    <div className="tabs-empty">{t.noTabs}</div>
                  )}
                  {availableTabs.map((tab) => (
                    <label className="tab-picker-item" key={tab.id}>
                      <input
                        type="checkbox"
                        checked={selectedTabIds.includes(tab.id!)}
                        onChange={() => toggleTab(tab.id!)}
                      />
                      <span className="tab-favicon">
                        {tab.favIconUrl ? "🌐" : "◉"}
                      </span>
                      <span title={tab.title || tab.url || ""}>
                        {tab.title || tab.url || `Tab ${tab.id}`}
                      </span>
                    </label>
                  ))}
                </div>
                {selectedTabIds.length > 0 && (
                  <div className="selected-tabs">
                    {selectedTabIds.map((id) => {
                      const tab = availableTabs.find((item) => item.id === id);
                      return (
                        <button
                          type="button"
                          className="selected-tab-chip"
                          key={id}
                          onClick={() => removeTab(id)}
                          title={t.removeTab}
                        >
                          {(tab?.title || tab?.url || `Tab ${id}`).slice(0, 18)}{" "}
                          ×
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="tools-menu-divider" />
                <button
                  type="button"
                  className="tools-menu-action"
                  onClick={captureScreen}
                >
                  <span>⌗</span> {t.screenshot}
                </button>
                <button
                  type="button"
                  className="tools-menu-action"
                  onClick={() => fileInput.current?.click()}
                >
                  <span>📎</span> {t.attachFile}
                </button>
                <button
                  type="button"
                  className={
                    "tools-menu-action " + (pageInfoOpen ? "active" : "")
                  }
                  onClick={() => setPageInfoOpen((open) => !open)}
                >
                  <span>☷</span> {t.pageInfo}
                </button>
                {pageInfoOpen && (
                  <div className="page-info-picker">
                    <div className="page-info-hint">{t.pageInfoHint}</div>
                    {PAGE_INFO_KEYS.map((key) => {
                      const labels: Record<PageInfoKey, string> = {
                        url: t.pageInfoUrl,
                        title: t.pageInfoTitle,
                        selection: t.pageInfoSelection,
                        visibleText: t.pageInfoVisibleText,
                        domSummary: t.pageInfoDomSummary,
                      };
                      return (
                        <label className="page-info-item" key={key}>
                          <input
                            type="checkbox"
                            checked={pageInfoSelection[key]}
                            onChange={() => togglePageInfo(key)}
                          />
                          {labels[key]}
                        </label>
                      );
                    })}
                  </div>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  multiple
                  onChange={onFilesSelected}
                />
              </div>
            )}
            {permissionOpen && (
              <div className="permission-popover">
                <strong>{t.pagePermission}</strong>
                <label>
                  <input
                    type="checkbox"
                    checked={readPageEnabled}
                    onChange={(event) =>
                      void updateReadPagePermission(event.target.checked)
                    }
                  />
                  {t.readPage}
                </label>
                <div className="permission-section-title">
                  {t.actionPermissionTitle}
                </div>
                {(
                  [
                    ["ask", t.actionPermissionAsk, t.actionPermissionAskHint],
                    [
                      "delegate",
                      t.actionPermissionDelegate,
                      t.actionPermissionDelegateHint,
                    ],
                    [
                      "full",
                      t.actionPermissionFull,
                      t.actionPermissionFullHint,
                    ],
                  ] as const
                ).map(([value, label, hint]) => (
                  <label className="permission-choice" key={value}>
                    <input
                      type="radio"
                      name="actionPermission"
                      checked={actionPermission === value}
                      onChange={() => {
                        setActionPermission(value);
                        chrome.storage.local.set({
                          actionPermission: value,
                        });
                      }}
                    />
                    <span>
                      <strong>{label}</strong>
                      <small>{hint}</small>
                    </span>
                  </label>
                ))}
                <span>{t.permissionNote}</span>
              </div>
            )}
          </div>
        </div>
      </footer>
      {feedbackToast && (
        <div
          className={
            "feedback-toast " +
            (feedbackToast.kind === "thanks" ? "feedback-toast-thanks" : "")
          }
          role="status"
          aria-live="polite"
        >
          {feedbackToast.kind === "thanks"
            ? t.feedbackThanks
            : t.feedbackCleared}
        </div>
      )}
      {confirmState && (
        <div
          className="confirm-overlay"
          onClick={() => confirmResolveRef.current?.(false)}
        >
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            {confirmState.title && (
              <strong id="confirm-title">{confirmState.title}</strong>
            )}
            <div className="confirm-message">{confirmState.message}</div>
            <div className="confirm-actions">
              <button
                type="button"
                className="confirm-button confirm-button-secondary"
                onClick={() => confirmResolveRef.current?.(false)}
              >
                {t.confirmCancel}
              </button>
              <button
                type="button"
                className={
                  "confirm-button" +
                  (confirmState.danger ? " confirm-button-danger" : "")
                }
                onClick={() => confirmResolveRef.current?.(true)}
              >
                {t.confirmOk}
              </button>
            </div>
          </div>
        </div>
      )}
      {previewImage && (
        <div
          className="image-preview-overlay"
          onClick={() => setPreviewImage(undefined)}
        >
          <div
            className="image-preview-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="image-preview-close"
              onClick={() => setPreviewImage(undefined)}
              title={t.closeImagePreview}
              aria-label={t.closeImagePreview}
            >
              ×
            </button>
            <img src={previewImage} alt={t.imagePreview} />
          </div>
        </div>
      )}
      {screenshotSelection && (
        <div className="screenshot-selection-overlay">
          <div className="screenshot-selection-dialog">
            <div className="screenshot-selection-toolbar">
              <strong>{t.screenshot}</strong>
              <span>{t.screenshotSelectHint}</span>
              <button
                type="button"
                className="image-preview-close"
                onClick={() => setScreenshotSelection(undefined)}
                aria-label={t.cancel}
              >
                ×
              </button>
            </div>
            <div
              className="screenshot-selection-canvas"
              onPointerDown={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                selectionStart.current = {
                  x: event.clientX - bounds.left,
                  y: event.clientY - bounds.top,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                updateSelection(event);
              }}
              onPointerMove={updateSelection}
              onPointerUp={finishSelection}
            >
              <img
                src={screenshotSelection}
                alt={t.screenshot}
                draggable={false}
              />
              {selectionRect.width > 0 && selectionRect.height > 0 && (
                <div
                  className="screenshot-selection-box"
                  style={{
                    left: selectionRect.x,
                    top: selectionRect.y,
                    width: selectionRect.width,
                    height: selectionRect.height,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[RootErrorBoundary]", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <pre
          style={{
            padding: 16,
            margin: 16,
            color: "#b91c1c",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            fontSize: 12,
            whiteSpace: "pre-wrap",
          }}
        >
          {String(this.state.error?.stack || this.state.error)}
        </pre>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>,
);
