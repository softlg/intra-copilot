import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import rehypeHighlight from "rehype-highlight";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { bootstrapAuth, type AuthedFetch } from "./auth";
import "./style.css";

const API_BASE = (
  import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8080/api/v1"
)
  .replace(/\/api\/v1\/?$/, "")
  .replace(/\/$/, "");
const API = `${API_BASE}/api/v1`;
// Keep this above the backend agent.sse-timeout-seconds default.
const CHAT_STREAM_TIMEOUT_MS = 610_000;
type Theme = "system" | "light" | "dark";
type Language = "zh" | "en";
type ActivationMode = "all_pages" | "current_page";
type Feedback = "up" | "down" | null;
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
const attachmentObjectUrlCache = new Map<string, string>();

async function resolveAttachment(
  fetchFn: (path: string, init?: RequestInit) => Promise<Response>,
  id: string,
): Promise<string> {
  const cached = attachmentObjectUrlCache.get(id);
  if (cached) return cached;
  const response = await fetchFn(`/attachments/${id}`);
  if (!response.ok) throw new Error(`attachment ${response.status}`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  attachmentObjectUrlCache.set(id, objectUrl);
  return objectUrl;
}

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

type PendingAttachment = {
  id?: string;
  name: string;
  size: number;
  type: string;
  url: string;
  file?: File;
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
  /** 由 SSE delegation_decided 事件填充：领域 Agent 委派给了哪个子 Agent。 */
  delegatedTo?: string;
};
type PageInfoKey = "url" | "title" | "selection" | "visibleText" | "domSummary";
const PAGE_INFO_KEYS: PageInfoKey[] = [
  "url",
  "title",
  "selection",
  "visibleText",
  "domSummary",
];

const translations = {
  zh: {
    appSubtitle: "浏览器智能助手",
    newSession: "新建会话",
    history: "历史",
    settings: "设置",
    appearance: "外观",
    followSystem: "跟随系统",
    light: "浅色",
    dark: "深色",
    activationScope: "插件启用范围",
    defaultCurrentPage: "默认在当前页面打开",
    allPages: "所有页面开启",
    currentPage: "当前页面",
    enableCurrentPage: "在当前页面开启",
    disableCurrentPage: "关闭当前页面插件",
    language: "语言",
    chinese: "中文",
    english: "English",
    chatWindows: "聊天窗口",
    empty: "你好！我可以帮你诊断当前页面，或协助处理你的问题。",
    you: "你",
    assistant: "助手",
    thinking: "思考中…",
    stopped: "已停止生成",
    responseUnavailable: "本次回复未保存，请重新发送。",
    closeHistory: "关闭历史",
    selectAll: "全选",
    noHistory: "暂无历史会话",
    save: "保存",
    cancel: "取消",
    edit: "编辑",
    delete: "删除",
    bulkDelete: "删除已选",
    saveNameTitle: "保存名称",
    cancelEditTitle: "取消修改",
    editTitle: "修改名称",
    deleteTitle: "删除会话",
    switchChat: "切换聊天窗口",
    historyLabel: (count: number) => `${count} 个会话`,
    defaultSession: (index: number) => `新会话 ${index}`,
    selectSession: (title: string) => `选择 ${title}`,
    deleteConfirm: (names: string) =>
      `确定删除${names}吗？聊天记录将一并移除。`,
    thisSession: "此会话",
    sessions: (count: number) => `${count} 个会话`,
    nameRequired: "会话名称不能为空",
    renameFailed: "修改会话名称失败",
    deleteFailed: "删除会话失败",
    createFailed: "创建会话失败",
    reorderFailed: "调整会话顺序失败",
    backendError: "无法连接后端，请确认 Spring Boot 已启用。",
    requestFailed: "请求失败",
    requestTimeout: "请求超时，请稍后重试。",
    modelTimeout: "模型响应超时，请稍后重试。",
    modelUnavailable: "模型服务暂时不可用，请稍后重试。",
    stageAnalyzing: "正在分析问题…",
    stageRouting: "正在选择处理 Agent…",
    stageDelegating: "正在分配处理任务…",
    stageKnowledge: "正在查询知识库…",
    stageGenerating: "正在生成回答…",
    stageProcessing: "正在整理处理结果…",
    stageSummarizing: "正在整理最终回答…",
    stageTool: (tool: string) => `正在调用工具：${tool}`,
    uploadFailed: "附件上传失败",
    invalidAction: "操作提案格式无效",
    rejected: "用户拒绝",
    inputPlaceholder: "描述问题或输入你的需求,Shift+Enter换行...",
    chatInput: "聊天输入框",
    agentSelector: "选择 Agent",
    agentAuto: "自动",
    agentGeneralGroup: "通用 Agent",
    agentDomainGroup: "领域 Agent",
    agentRefresh: "刷新 Agent 列表",
    toolInvoked: "调用工具",
    toolResult: "工具返回",
    handledBy: "处理 Agent",
    delegatedTo: "委派子 Agent",
    expandComposer: "展开输入框",
    collapseComposer: "收起输入框",
    send: "发送",
    stop: "停止生成",
    addTools: "添加插件或附件",
    permission: "权限",
    toolsUnavailable: "插件、附件等扩展能力将在后续版本接入。",
    addTab: "添加标签页",
    tabsHint: "选择要提供给助手的标签页",
    noTabs: "没有可用标签页",
    removeTab: "移除标签页",
    attachFile: "上传文件",
    attachmentMenu: "附加文件",
    screenshot: "从屏幕上选择",
    screenshotSelectHint: "拖动鼠标框选需要截图的页面区域，松开完成",
    pageInfo: "页面信息",
    pageInfoHint: "选择要随消息发送的页面信息",
    pageInfoUrl: "当前网址",
    pageInfoTitle: "页面标题",
    pageInfoSelection: "选中文本",
    pageInfoVisibleText: "可见文本",
    pageInfoDomSummary: "页面结构摘要",
    screenshotNew: "新",
    removeAttachment: "移除附件",
    screenshotFailed: "截图失败，请确认浏览器权限。",
    screenshotRestricted: "当前页面不允许截图，请切换到普通网页后重试。",
    screenshotRateLimited: "截图请求过于频繁，请稍后再试。",
    dismissError: "关闭异常提示",
    imagePreview: "查看图片",
    closeImagePreview: "关闭图片预览",
    like: "有帮助",
    dislike: "没帮助",
    feedbackCancelHint: "再次点击可撤销",
    feedbackCleared: "已撤销投票",
    feedbackThanks: "已收到，感谢反馈",
    feedbackInlineTitle: "这条回答哪里可以更好？",
    feedbackInlineHint: "点踩后可补充原因，全部为选填",
    feedbackChipInaccurate: "不准确",
    feedbackChipIrrelevant: "答非所问",
    feedbackChipTooLong: "太长",
    feedbackChipOther: "其他",
    feedbackInlinePlaceholder: "补充一点具体原因（可选）",
    feedbackInlineSubmit: "提交反馈",
    feedbackInlineSkip: "不用了",
    copyMessage: "复制回答",
    copyCode: "复制代码",
    copied: "已复制",
    copyFailed: "复制失败，请手动选择文本复制。",
    retry: "重试",
    editResend: "重新编辑并发送",
    imageOnly: "图片",
    pagePermission: "页面权限",
    readPage: "允许读取当前页面上下文",
    permissionNote: "写入页面的操作仍会逐项请求确认。",
    actionConfirm: (type: string, reason: string, risk: string) =>
      `助手请求执行 ${type} 操作。\n原因：${reason}\n风险：${risk}\n\n是否执行？`,
  },
  en: {
    appSubtitle: "Browser AI assistant",
    newSession: "New chat",
    history: "History",
    settings: "Settings",
    appearance: "Appearance",
    followSystem: "Follow system",
    light: "Light",
    dark: "Dark",
    activationScope: "Extension activation",
    defaultCurrentPage: "Open on the current page by default",
    allPages: "Enable on all pages",
    currentPage: "Current page",
    enableCurrentPage: "Enable on current page",
    disableCurrentPage: "Disable on current page",
    language: "Language",
    chinese: "中文",
    english: "English",
    chatWindows: "Chat windows",
    empty:
      "Hello! I can help diagnose the current page or assist with your questions.",
    you: "You",
    assistant: "Assistant",
    thinking: "Thinking…",
    stopped: "Generation stopped",
    responseUnavailable: "This reply was not saved. Please send again.",
    closeHistory: "Close history",
    selectAll: "Select all",
    noHistory: "No chat history",
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    bulkDelete: "Delete selected",
    saveNameTitle: "Save name",
    cancelEditTitle: "Cancel editing",
    editTitle: "Rename",
    deleteTitle: "Delete chat",
    switchChat: "Switch chat window",
    historyLabel: (count: number) => `${count} chat${count === 1 ? "" : "s"}`,
    defaultSession: (index: number) => `New chat ${index}`,
    selectSession: (title: string) => `Select ${title}`,
    deleteConfirm: (names: string) =>
      `Delete ${names}? All messages in this chat will also be removed.`,
    thisSession: "this chat",
    sessions: (count: number) => `${count} chat${count === 1 ? "" : "s"}`,
    nameRequired: "Chat name cannot be empty",
    renameFailed: "Failed to rename chat",
    deleteFailed: "Failed to delete chat",
    createFailed: "Failed to create chat",
    reorderFailed: "Failed to reorder chats",
    backendError:
      "Unable to connect to the backend. Please make sure Spring Boot is enabled.",
    requestFailed: "Request failed",
    requestTimeout: "The request timed out. Please try again.",
    modelTimeout: "The model timed out. Please try again.",
    modelUnavailable:
      "The model service is temporarily unavailable. Please try again.",
    stageAnalyzing: "Analyzing your question…",
    stageRouting: "Selecting an Agent…",
    stageDelegating: "Assigning the task…",
    stageKnowledge: "Searching the knowledge base…",
    stageGenerating: "Generating a response…",
    stageProcessing: "Processing the result…",
    stageSummarizing: "Preparing the final response…",
    stageTool: (tool: string) => `Calling tool: ${tool}`,
    uploadFailed: "Attachment upload failed",
    invalidAction: "Invalid action proposal",
    rejected: "Rejected by user",
    inputPlaceholder: "Describe the problem or enter your request…",
    chatInput: "Chat input",
    agentSelector: "Select Agent",
    agentAuto: "Auto",
    agentGeneralGroup: "General Agents",
    agentDomainGroup: "Domain Agents",
    agentRefresh: "Refresh agents",
    toolInvoked: "Calling tool",
    toolResult: "Tool returned",
    handledBy: "Handled by",
    delegatedTo: "Delegated to",
    expandComposer: "Expand input",
    collapseComposer: "Collapse input",
    send: "Send",
    stop: "Stop generating",
    addTools: "Add plugin or attachment",
    permission: "Permissions",
    toolsUnavailable:
      "Plugins and attachments will be available in a future version.",
    addTab: "Add tabs",
    tabsHint: "Choose tabs to share with the assistant",
    noTabs: "No available tabs",
    removeTab: "Remove tab",
    attachFile: "Upload file",
    attachmentMenu: "Attachments",
    screenshot: "Select from screen",
    screenshotSelectHint:
      "Drag to select the page area to capture, then release",
    pageInfo: "Page info",
    pageInfoHint: "Choose page information to include with the message",
    pageInfoUrl: "Current URL",
    pageInfoTitle: "Page title",
    pageInfoSelection: "Selected text",
    pageInfoVisibleText: "Visible text",
    pageInfoDomSummary: "DOM summary",
    screenshotNew: "New",
    removeAttachment: "Remove attachment",
    screenshotFailed: "Screenshot failed. Check browser permissions.",
    screenshotRestricted:
      "This page cannot be captured. Switch to a regular webpage and try again.",
    screenshotRateLimited:
      "Screenshot requested too often. Please try again shortly.",
    dismissError: "Dismiss error",
    imagePreview: "View image",
    closeImagePreview: "Close image preview",
    like: "Helpful",
    dislike: "Not helpful",
    feedbackCancelHint: "Click again to undo",
    feedbackCleared: "Vote removed",
    feedbackThanks: "Thanks for your feedback",
    feedbackInlineTitle: "What could be better here?",
    feedbackInlineHint: "Add an optional reason after down-voting.",
    feedbackChipInaccurate: "Inaccurate",
    feedbackChipIrrelevant: "Off-topic",
    feedbackChipTooLong: "Too long",
    feedbackChipOther: "Other",
    feedbackInlinePlaceholder: "Add a short reason (optional)",
    feedbackInlineSubmit: "Send feedback",
    feedbackInlineSkip: "No thanks",
    copyMessage: "Copy answer",
    copyCode: "Copy code",
    copied: "Copied",
    copyFailed: "Copy failed. Please select and copy the text manually.",
    retry: "Retry",
    editResend: "Edit and resend",
    imageOnly: "Image",
    pagePermission: "Page permissions",
    readPage: "Allow reading the current page context",
    permissionNote:
      "Write actions on the page will still ask for confirmation one by one.",
    actionConfirm: (type: string, reason: string, risk: string) =>
      `The assistant requests to perform ${type}.\nReason: ${reason}\nRisk: ${risk}\n\nProceed?`,
  },
} as const;

function isDefaultSessionTitle(title: unknown) {
  return (
    !title ||
    title === "新会话" ||
    (typeof title === "string" && title.toLowerCase() === "new chat")
  );
}

type AssistantMarkdownProps = {
  content: string;
  messageIndex: number;
  copiedCode?: string;
  onCopyCode: (code: string, codeId: string) => void;
  copyCodeLabel: string;
  copiedLabel: string;
};
type CodeElementProps = {
  className?: string;
  children?: React.ReactNode;
};

function getRenderedText(value: React.ReactNode): string {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return value.map(getRenderedText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(value)) {
    return getRenderedText(value.props.children);
  }
  return "";
}

/**
 * Models occasionally omit the space/newline that Markdown requires for a
 * heading (for example `###标题` or `... ###下一步`).  Normalise only the
 * prose portions, leaving fenced code untouched, so streamed responses remain
 * readable without changing the actual message text copied by the user.
 */
function decodeAssistantEscapes(value: string): string {
  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"');
}

function normalizeAssistantMarkdown(value: string): string {
  return decodeAssistantEscapes(value)
    .replace(/\r\n?/g, "\n")
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g)
    .map((part) => {
      if (/^(```|~~~)/.test(part)) return part;
      return part
        .replace(/(^|\n)([ \t]*#{1,6})(?=\S)/g, "$1$2 ")
        .replace(/([^\n])\s+(#{1,6})(?=\S)/g, "$1\n$2 ")
        .replace(/([^\n])\s+(?=(?:\d{1,2}[.)]|[-*+•])\s*\S)/g, "$1\n")
        .replace(
          /([。！？.!?])\s+(?=(?:下一步|注意|总结|说明|结论|示例)[:：])/g,
          "$1\n\n",
        )
        .replace(
          /([。！？.!?])\s+(?=[\u4e00-\u9fffA-Za-z][^\n。！？]{1,18}[:：])/g,
          "$1\n\n",
        )
        .replace(
          /\s+[·•]\s*(?=[\u4e00-\u9fffA-Za-z][^\n。！？]{1,18}[:：])/g,
          "\n\n",
        )
        .replace(/([^\n])\s+(?=\|[^\n]+\|\s*\n)/g, "$1\n");
    })
    .join("\n");
}

function isSafeAssistantUrl(value?: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function AssistantMarkdown({
  content,
  messageIndex,
  copiedCode,
  onCopyCode,
  copyCodeLabel,
  copiedLabel,
}: AssistantMarkdownProps) {
  let codeBlockIndex = 0;
  return (
    <ReactMarkdown
      skipHtml
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        code({ className, children, ...props }) {
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        pre({ children }) {
          const codeElement = React.Children.toArray(children).find((child) =>
            React.isValidElement(child),
          ) as React.ReactElement<CodeElementProps> | undefined;
          const code = getRenderedText(codeElement?.props.children).replace(
            /\n$/,
            "",
          );
          const className = codeElement?.props.className;
          const language =
            className?.match(/language-([\w+-]+)/)?.[1]?.toLowerCase() ||
            "text";
          const codeId = `${messageIndex}:${codeBlockIndex++}`;
          const isCopied = copiedCode === codeId;
          return (
            <div className="code-block">
              <div className="code-toolbar">
                <span className="code-language">{language}</span>
                <button
                  type="button"
                  className="code-copy-button"
                  onClick={() => onCopyCode(code, codeId)}
                  title={isCopied ? copiedLabel : copyCodeLabel}
                  aria-label={isCopied ? copiedLabel : copyCodeLabel}
                >
                  {isCopied ? "✓" : "⧉"}{" "}
                  {isCopied ? copiedLabel : copyCodeLabel}
                </button>
              </div>
              <pre>{codeElement ?? <code>{children}</code>}</pre>
            </div>
          );
        },
        a({ href, children, ...props }) {
          return (
            <a href={href} target="_blank" rel="noreferrer" {...props}>
              {children}
            </a>
          );
        },
        table({ children }) {
          return (
            <div className="markdown-table-wrap">
              <table>{children}</table>
            </div>
          );
        },
        img({ src, alt }) {
          if (
            !src ||
            !(
              isSafeAssistantUrl(src) ||
              /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(src)
            )
          )
            return null;
          return (
            <img
              className="markdown-image"
              src={src}
              alt={alt ?? ""}
              loading="lazy"
            />
          );
        },
      }}
    >
      {normalizeAssistantMarkdown(content)}
    </ReactMarkdown>
  );
}

function App() {
  const [authedFetch, setAuthedFetch] = useState<AuthedFetch | null>(null);
  const [authError, setAuthError] = useState<string>("");
  const [sessions, setSessions] = useState<any[]>([]);
  const [session, setSession] = useState<any>();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [messageFeedback, setMessageFeedback] = useState<
    Record<number, Feedback>
  >({});
  const [inlineFeedbackIndex, setInlineFeedbackIndex] = useState<number>();
  const [inlineFeedbackComment, setInlineFeedbackComment] = useState("");
  const [feedbackToast, setFeedbackToast] = useState<FeedbackToast>();
  const [copiedMessage, setCopiedMessage] = useState<number>();
  const [copiedCode, setCopiedCode] = useState<string>();
  const [input, setInput] = useState("");
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<Theme>("system");
  const [language, setLanguage] = useState<Language>("zh");
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [readPageEnabled, setReadPageEnabled] = useState(true);
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
    useState<ActivationMode>("current_page");
  const [defaultCurrentPage, setDefaultCurrentPage] = useState(true);
  const [currentTabId, setCurrentTabId] = useState<number>();
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
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [editingSessionId, setEditingSessionId] = useState<string>();
  const [editingTitle, setEditingTitle] = useState("");
  // 拖拽排序：draggingId 为正在拖动的会话 id；dropTarget 为插入目标
  // { id, before } 表示「插到 id 之前」（before=true）或「之后」（before=false）。
  const [draggingSessionId, setDraggingSessionId] = useState<string>();
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    before: boolean;
  }>();
  const [agents, setAgents] = useState<
    { id: string; displayName: string; role: string; description?: string }[]
  >([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const reorderRef = useRef<string[] | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerToolsRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const authedFetchRef = useRef<AuthedFetch | null>(null);
  const agentsRequestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { authedFetch } = await bootstrapAuth(API_BASE);
        if (cancelled) return;
        authedFetchRef.current = authedFetch;
        setAuthedFetch(() => authedFetch);
        load();
      } catch (error) {
        if (cancelled) return;
        const message =
          (error as Error).message || "Failed to register device with backend";
        setAuthError(message);
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
    const messageList = mainRef.current;
    if (!messageList) return;
    messageList.scrollTo({
      top: messageList.scrollHeight,
      behavior: "smooth",
    });
  }, [msgs]);

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
    chrome.storage.local.remove("tmsAuthorized");
    chrome.storage.local.get(
      [
        "theme",
        "language",
        "readPageEnabled",
        "activationMode",
        "defaultCurrentPage",
        "pageInfoSelection",
      ],
      (value: {
        theme?: Theme;
        language?: Language;
        readPageEnabled?: boolean;
        activationMode?: ActivationMode;
        defaultCurrentPage?: boolean;
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
          value.activationMode === "all_pages" ||
          value.activationMode === "current_page"
        ) {
          setActivationMode(value.activationMode);
        }
        if (typeof value.defaultCurrentPage === "boolean") {
          setDefaultCurrentPage(value.defaultCurrentPage);
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
    chrome.storage.local.set({ activationMode, defaultCurrentPage });
    refreshCurrentTabState();
  }, [activationMode, defaultCurrentPage, preferencesLoaded]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    chrome.storage.local.set({ pageInfoSelection });
  }, [pageInfoSelection, preferencesLoaded]);

  async function refreshCurrentTabState() {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const id = tabs[0]?.id;
      setCurrentTabId(id);
      if (id == null) return;
      const result = await chrome.runtime.sendMessage({
        type: "GET_TAB_ENABLED",
        tabId: id,
      });
      setCurrentTabEnabled(Boolean(result?.enabled));
    } catch {
      setCurrentTabId(undefined);
    }
  }

  async function toggleCurrentTab() {
    if (currentTabId == null) return;
    const type = currentTabEnabled
      ? "DISABLE_CURRENT_TAB"
      : "ENABLE_CURRENT_TAB";
    const result = await chrome.runtime.sendMessage({
      type,
      tabId: currentTabId,
    });
    if (result?.ok) setCurrentTabEnabled(Boolean(result.enabled));
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

  function saveFeedback(
    index: number,
    feedback: Exclude<Feedback, null>,
    comment = "",
  ) {
    const userMessage =
      [...msgs.slice(0, index)].reverse().find((item) => item.role === "user")
        ?.content || "";
    const target = msgs[index];
    if (!session?.id) return;
    apiFetch("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        messageId: target?.id,
        messageIndex: index,
        agentId: target?.agentId,
        rating: feedback,
        comment,
        messageContent: target?.content || "",
        userMessage,
      }),
    }).catch(() => undefined);
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

  function toggleFeedback(index: number, target: Exclude<Feedback, null>) {
    const prev: Feedback = messageFeedback[index] ?? null;
    const next: Feedback = prev === target ? null : target;

    setMessageFeedback((current) => {
      const updated = { ...current };
      if (next === null) delete updated[index];
      else updated[index] = next;
      return updated;
    });

    persistFeedback(index, next);

    // 内联反馈条：仅在 down 时出现；切换 / 撤销时关闭
    if (target === "down") {
      if (next === "down") setInlineFeedbackIndex(index);
      else if (prev === "down")
        setInlineFeedbackIndex((curr) => (curr === index ? undefined : curr));
    } else if (prev === "down") {
      setInlineFeedbackIndex((curr) => (curr === index ? undefined : curr));
    }
    setInlineFeedbackComment("");

    // 撤销投票给用户一个轻量反馈
    if (prev !== null && next === null) {
      showFeedbackToast("cleared", index);
    }

    if (next !== null) saveFeedback(index, next);

    // 让该条消息（连同刚展开的内联反馈条）滚到可视区域中心
    requestAnimationFrame(() => scrollMessageIntoView(index));
  }

  function submitInlineFeedback() {
    if (inlineFeedbackIndex == null) return;
    const index = inlineFeedbackIndex;
    const comment = inlineFeedbackComment.trim();
    if (comment) {
      saveFeedback(index, "down", comment);
      showFeedbackToast("thanks", index);
    }
    setInlineFeedbackIndex(undefined);
    setInlineFeedbackComment("");
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
      setSession(conversation);
      setMsgs([]);
      setMessageFeedback({});
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function select(conversation: any) {
    setSession(conversation);
    try {
      const response = await apiFetch(`/sessions/${conversation.id}/messages`);
      if (!response.ok) throw new Error(`messages: ${response.status}`);
      const payload = await response.json();
      const history: Msg[] = Array.isArray(payload) ? payload : [];
      setMsgs(
        history.map((message) =>
          message.role === "assistant" && !message.content.trim()
            ? {
                ...message,
                content: t.responseUnavailable,
                stopped: true,
              }
            : message,
        ),
      );
    } catch {
      setMsgs([]);
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
    setDraggingSessionId(conversation.id);
  }

  function endDrag() {
    setDraggingSessionId(undefined);
    setDropTarget(undefined);
  }

  // 计算插入位置：draggingId 拖到 targetId 处，根据鼠标在上半/下半决定 before/after。
  function updateDropTarget(
    targetId: string,
    event: React.DragEvent<HTMLElement>,
  ) {
    if (!draggingSessionId || draggingSessionId === targetId) {
      setDropTarget(undefined);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    setDropTarget({ id: targetId, before });
  }

  async function dropOnSession(targetId: string, before: boolean) {
    if (!draggingSessionId || draggingSessionId === targetId) {
      endDrag();
      return;
    }
    const dragged = draggingSessionId;
    const previousOrder = sessions.map((s) => s.id);

    // 先记下旧顺序用于失败回滚。
    reorderRef.current = previousOrder;

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
      if (reorderRef.current) setSessions(previousOrder);
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
      setSession((current: any) =>
        current?.id === updated.id ? updated : current,
      );
      cancelRename();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeSessions(ids: string[]) {
    if (!ids.length) return;
    const names = ids.length === 1 ? t.thisSession : t.sessions(ids.length);
    if (!window.confirm(t.deleteConfirm(names))) return;
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

  function markGenerationStopped(messageIndex?: number) {
    setMsgs((items) => {
      if (!items.length) return items;
      const next = [...items];
      const index = messageIndex ?? next.length - 1;
      const last = next[index];
      if (
        !last ||
        last.role !== "assistant" ||
        last.content.includes(t.stopped)
      ) {
        return next;
      }
      next[index] = {
        ...last,
        content: last.content ? `${last.content}\n\n${t.stopped}` : t.stopped,
        stopped: true,
        stage: undefined,
      };
      return next;
    });
  }

  function markGenerationFailed(message: string, messageIndex?: number) {
    const visibleMessage = message || t.requestFailed;
    setError(visibleMessage);
    setMsgs((items) => {
      if (!items.length) return items;
      const next = [...items];
      const index = messageIndex ?? next.length - 1;
      const last = next[index];
      if (
        !last ||
        last.role !== "assistant" ||
        last.content.includes(visibleMessage)
      ) {
        return next;
      }
      next[index] = {
        ...last,
        content: last.content
          ? `${last.content}\n\n> ${visibleMessage}`
          : visibleMessage,
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
    if (busy) return;
    setInput(message.content.replace(new RegExp(`\\n\\n${t.stopped}$`), ""));
    setScreenshot(undefined);
    setAttachments([]);
    setMsgs((items) => items.slice(0, messageIndex));
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
    if (
      (!text && !pendingAttachments.length && !pendingScreenshot) ||
      busy ||
      !session
    )
      return;
    const controller = new AbortController();
    abortControllerRef.current = controller;

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
          setBusy(false);
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
      : msgs.length + 1;

    if (!retryRequest) {
      setInput("");
      setAttachments([]);
      setScreenshot(undefined);
    }
    setBusy(true);
    setError("");

    if (retryRequest) {
      setMsgs((items) =>
        items.map((item, index) =>
          index === assistantIndex
            ? {
                ...item,
                content: "",
                stopped: false,
                stage: undefined,
                agentName: undefined,
                delegatedTo: undefined,
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
      setMsgs((items) => [
        ...items,
        { role: "user", content: text, attachments: messageAttachments },
        { role: "assistant", content: "" },
      ]);
    }

    let pageContext = "";
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
        const contexts = await Promise.all(
          ids.map(async (id) => {
            try {
              return await chrome.tabs.sendMessage(id, {
                type: "COLLECT_CONTEXT",
              });
            } catch {
              return null;
            }
          }),
        );
        pageContext = JSON.stringify(
          contexts.filter(Boolean).map((context: Record<string, string>) => {
            const selected: Record<string, string> = {
              source: "current_page",
              timestamp: context.timestamp,
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

    let streamError = "";
    let sawContent = false;
    let timedOut = false;
    let timeoutId: number | undefined;
    try {
      if (controller.signal.aborted) {
        markGenerationStopped(assistantIndex);
        return;
      }
      timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, CHAT_STREAM_TIMEOUT_MS);
      const response = await apiFetch("/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          sessionId: session.id,
          message: text,
          attachmentIds: retryRequest
            ? retryAttachmentIds
            : uploaded.map((u) => u.id),
          retry: Boolean(retryRequest),
          agentId: selectedAgentId || null,
          pageContext,
          permissions: {
            readPage: readPageEnabled,
          },
        }),
      });
      if (!response.ok || !response.body) throw Error(t.requestFailed);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // 修改当前助手消息的元信息（内容、Agent 归属、委派关系等）。
      const patchAssistantMsg = (patch: (last: Msg) => Partial<Msg>) => {
        setMsgs((items) => {
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
      // 把工具调用过程追加到当前助手消息中（与 token 追加逻辑保持一致）。
      const appendToolLine = (line: string) => {
        patchAssistantMsg((last) => ({ content: last.content + line }));
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const name = (part.match(/^event: ?(.+)$/m) || [])[1];
          const data = (part.match(/^data: ?(.+)$/m) || [])[1];
          if (name === "token" && data) {
            sawContent = true;
            setMsgs((items) => {
              const target = items[assistantIndex];
              if (!target || target.role !== "assistant") return items;
              const next = [...items];
              next[assistantIndex] = {
                ...target,
                content: target.content + data,
                stage: undefined,
              };
              return next;
            });
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
          if (name === "delegation_decided" && data) {
            try {
              const delegation = JSON.parse(data);
              patchAssistantMsg(() => ({
                delegatedTo: delegation.childAgentId,
              }));
            } catch {
              /* 忽略无法解析的事件 */
            }
          }
          if (name === "message_completed" && data) {
            // 兜底：若中途没有收到任何 token（例如流被代理缓冲），用完整内容补齐，
            // 避免界面上出现一条空的助手消息。
            try {
              const completed = JSON.parse(data);
              if (typeof completed.content === "string") {
                if (completed.content) sawContent = true;
                patchAssistantMsg((last) =>
                  last.content
                    ? { stage: undefined }
                    : { content: completed.content, stage: undefined },
                );
              }
            } catch {
              /* 忽略无法解析的事件 */
            }
          }
          if (name === "action_proposed" && data) {
            try {
              const action = JSON.parse(data);
              const approved = window.confirm(
                t.actionConfirm(
                  action.type,
                  action.reason || "",
                  action.risk || "",
                ),
              );
              let result = {
                status: approved ? "EXECUTED" : "REJECTED",
                result: approved ? "" : t.rejected,
              };
              if (approved) {
                const tabs = await chrome.tabs.query({
                  active: true,
                  currentWindow: true,
                });
                if (tabs[0]?.id) {
                  result = await chrome.tabs.sendMessage(tabs[0].id, {
                    type: "EXECUTE_ACTION",
                    action,
                  });
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
            // 工具调用过程可视化：让用户看到 Agent 实际执行了什么，而不是只有最终答案。
            try {
              const payload = JSON.parse(data);
              appendToolLine(`\n\n> ${t.toolInvoked} \`${payload.tool}\`\n`);
            } catch {
              /* 忽略无法解析的工具事件 */
            }
          }
          if (name === "tool_result" && data) {
            try {
              const payload = JSON.parse(data);
              appendToolLine(
                `\n\n> ${t.toolResult} \`${payload.tool}\`\n\n\`\`\`\n${payload.result}\n\`\`\`\n`,
              );
            } catch {
              /* 忽略无法解析的工具事件 */
            }
          }
          if (name === "error") {
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
            markGenerationFailed(message, assistantIndex);
          }
        }
      }
      if (!sawContent && !streamError)
        markGenerationFailed(t.requestFailed, assistantIndex);
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") {
        if (timedOut) markGenerationFailed(t.requestTimeout, assistantIndex);
        else markGenerationStopped(assistantIndex);
      } else if (!streamError) {
        const rawMessage = (e as Error).message?.trim();
        markGenerationFailed(
          !rawMessage || rawMessage === "Failed to fetch"
            ? t.backendError
            : rawMessage,
          assistantIndex,
        );
      }
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setBusy(false);
    }
  }

  function retryMessage(messageIndex: number) {
    if (busy || messageIndex !== msgs.length - 1) return;
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
    abortControllerRef.current?.abort();
  }

  const generalAgents = agents.filter((agent) => agent.role === "GENERAL");
  const domainAgents = agents.filter((agent) => agent.role === "DOMAIN");

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
                {t.activationScope}
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={defaultCurrentPage}
                  disabled={activationMode === "all_pages"}
                  onChange={(event) =>
                    setDefaultCurrentPage(event.target.checked)
                  }
                />
                {t.defaultCurrentPage}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={activationMode === "all_pages"}
                  onChange={(event) =>
                    setActivationMode(
                      event.target.checked ? "all_pages" : "current_page",
                    )
                  }
                />
                {t.allPages}
              </label>
              {activationMode === "current_page" && !defaultCurrentPage && (
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
      <nav className="session-tabs" aria-label={t.chatWindows}>
        {sessions.map((conversation, index) =>
          (() => {
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
                  (conversation.id === session?.id ? "active" : "") +
                  (isDropBefore ? " drop-before" : "") +
                  (isDropAfter ? " drop-after" : "")
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
                    updateDropTarget(conversation.id, event);
                  }
                }}
                onDragLeave={(event) => {
                  if (dropTarget?.id === conversation.id)
                    setDropTarget(undefined);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dropTarget != null && dropTarget.id === conversation.id)
                    dropOnSession(conversation.id, dropTarget.before);
                }}
                title={t.editTitle}
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
                    {assistant && (message.agentName || message.delegatedTo) ? (
                      <div className="agent-badges">
                        {message.agentName ? (
                          <span
                            className="agent-badge"
                            title={`${t.handledBy}: ${message.agentName}`}
                          >
                            {message.agentName}
                          </span>
                        ) : null}
                        {message.delegatedTo ? (
                          <span
                            className="agent-badge delegated"
                            title={`${t.delegatedTo}: ${message.delegatedTo}`}
                          >
                            → {message.delegatedTo}
                          </span>
                        ) : null}
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
                          {message.stage || t.thinking}
                        </span>
                      )
                    ) : (
                      message.content ||
                      (message.attachments?.length ? t.imageOnly : t.thinking)
                    )}
                  </div>
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
                        onClick={() => toggleFeedback(index, "up")}
                        title={
                          messageFeedback[index] === "up"
                            ? t.feedbackCancelHint
                            : t.like
                        }
                        aria-label={t.like}
                        aria-pressed={messageFeedback[index] === "up"}
                      >
                        👍
                      </button>
                      <button
                        type="button"
                        className={
                          "message-action feedback-action feedback-down " +
                          (messageFeedback[index] === "down" ? "selected" : "")
                        }
                        onClick={() => toggleFeedback(index, "down")}
                        title={
                          messageFeedback[index] === "down"
                            ? t.feedbackCancelHint
                            : t.dislike
                        }
                        aria-label={t.dislike}
                        aria-pressed={messageFeedback[index] === "down"}
                      >
                        👎
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
                            disabled={busy}
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
                          {[
                            t.feedbackChipInaccurate,
                            t.feedbackChipIrrelevant,
                            t.feedbackChipTooLong,
                            t.feedbackChipOther,
                          ].map((chip) => (
                            <button
                              key={chip}
                              type="button"
                              className={
                                "feedback-chip" +
                                (inlineFeedbackComment === chip
                                  ? " selected"
                                  : "")
                              }
                              onClick={() => {
                                setInlineFeedbackComment((current) =>
                                  current === chip ? "" : chip,
                                );
                              }}
                            >
                              {chip}
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
                        />
                        <div className="feedback-inline-actions">
                          <button
                            type="button"
                            className="feedback-inline-skip"
                            onClick={() => {
                              setInlineFeedbackIndex(undefined);
                              setInlineFeedbackComment("");
                            }}
                          >
                            {t.feedbackInlineSkip}
                          </button>
                          <button
                            type="button"
                            className="feedback-inline-submit"
                            onClick={submitInlineFeedback}
                            disabled={!inlineFeedbackComment.trim()}
                          >
                            {t.feedbackInlineSubmit}
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
                      if (dropTarget?.id === conversation.id)
                        setDropTarget(undefined);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (
                        dropTarget != null &&
                        dropTarget.id === conversation.id
                      )
                        dropOnSession(conversation.id, dropTarget.before);
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
                disabled={busy}
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
              className={"send-button" + (busy ? " stop-button" : "")}
              onClick={busy ? stopGeneration : () => void send()}
              title={busy ? t.stop : t.send}
              aria-label={busy ? t.stop : t.send}
            >
              {busy ? "■" : t.send}
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
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      setReadPageEnabled(enabled);
                      chrome.storage.local.set({ readPageEnabled: enabled });
                    }}
                  />
                  {t.readPage}
                </label>
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
