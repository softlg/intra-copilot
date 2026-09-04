import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const API = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8080/api/v1";
type Language = "zh" | "en";
type Theme = "dark" | "light";

const translations = {
  zh: {
    title: "页面助手",
    subtitle: "管理控制台",
    agents: "Agent",
    knowledge: "知识库",
    toolsMenu: "工具",
    skillsMenu: "Skill",
    skillsTitle: "Skill 管理",
    router: "路由测试",
    agentRatings: "Agent 评分",
    conversationLogs: "对话日志",
    conversationLogsSubtitle: "按会话查看用户消息、路由和 Agent 执行过程。",
    agentConfig: "Agent 配置",
    routerTest: "主 Agent 路由测试",
    localMode: "本机模式",
    newAgent: "+ 新建 Agent",
    newBase: "+ 新建知识库",
    enabled: "已启用",
    disabled: "已停用",
    noDescription: "暂无描述",
    stop: "停用",
    enable: "启用",
    deleteAgent: "删除",
    deleteAgentConfirm: (name: string) =>
      `确定删除 Agent“${name}”吗？此操作不可撤销。`,
    deleteAgentDisabledHint: "请先停用 Agent 后再删除",
    deleteAgentFailed: "删除 Agent 失败，请稍后重试",
    systemAgent: "系统 Agent",
    customAgent: "自定义 Agent",
    systemAgentHint: "系统 Agent 由页面助手内置提供，不允许删除",
    customAgentHint: "自定义 Agent 可按需停用后删除",
    supportedDocs: "支持 Markdown、TXT、PDF 文档",
    upload: "上传文档",
    processing: "解析中…",
    uploadHint: "Markdown、TXT、PDF，最大 10 MB",
    parsed: "已解析",
    pending: "等待处理",
    parseFailed: "解析失败",
    reindex: "重新解析",
    delete: "删除",
    deleteConfirm: (name: string) => `确定删除文档“${name}”吗？`,
    routerPlaceholder: "输入一条消息测试路由",
    testRoute: "测试路由",
    newAgentTitle: "新建 Agent",
    newAgentSubtitle: "先填写基础信息，创建后可在设置中配置能力和关联资源。",
    agentId: "Agent ID",
    agentIdHint: "使用 2-128 位小写字母、数字和连字符。",
    agentIdPlaceholder: "例如：release-helper",
    displayName: "显示名称",
    displayNamePlaceholder: "例如：发布助手",
    descriptionOptional: "描述（可选）",
    agentDescriptionPlaceholder: "简要说明这个 Agent 负责处理什么问题",
    systemPrompt: "系统提示词",
    systemPromptPlaceholder: "定义 Agent 的角色、边界和回答方式",
    browserActions: "允许使用浏览器操作提案（执行前仍需用户确认）",
    cancel: "取消",
    createAgent: "确认创建 Agent",
    editAgentTitle: "Agent 设置",
    editAgentSubtitle: "调整 Agent 的能力、提示词和关联资源，保存后立即生效。",
    saveAgent: "确认保存",
    saving: "保存中…",
    model: "模型（可选）",
    modelPlaceholder: "留空使用系统默认模型",
    temperature: "温度（可选）",
    priority: "调度优先级",
    knowledgeBases: "关联知识库 ID（可选）",
    tools: "工具绑定",
    skills: "Skill 绑定",
    noTools: "暂无可用工具，请先在工具管理中启用工具。",
    noSkills: "暂无可用 Skill，请先在 Skill 管理中启用 Skill。",
    toolType: "类型",
    browserProposal: "浏览器动作",
    idsHint: "多个 ID 使用英文逗号分隔",
    creating: "创建中…",
    newBaseTitle: "新建知识库",
    newBaseSubtitle: "创建后即可上传文档并用于页面助手检索。",
    baseName: "名称",
    baseNamePlaceholder: "例如：产品操作手册",
    baseDescriptionPlaceholder: "简要说明这个知识库的内容",
    createBase: "创建知识库",
    baseNameRequired: "请输入知识库名称",
    agentIdInvalid: "Agent ID 只能使用 2-128 位小写字母、数字和连字符",
    agentNameRequired: "Agent 名称不能为空",
    promptRequired: "系统提示词不能为空",
    createAgentFailed: "创建 Agent 失败，请稍后重试",
    createBaseFailed: "创建知识库失败，请稍后重试",
    uploadFailed: "上传文档失败，请稍后重试",
    reindexFailed: "重新解析文档失败，请稍后重试",
    deleteFailed: "删除文档失败，请稍后重试",
    settings: "设置",
    language: "语言",
    chinese: "中文",
    english: "English",
    appearance: "背景颜色",
    dark: "深色",
    light: "浅色",
    close: "关闭",
    enter: "进入维护",
    back: "返回知识库",
    maintenance: "知识维护",
    qaSettings: "问答场景设置",
    documentCount: (count: number) => `${count} 个文档`,
    noDocuments: "暂无文档，请上传资料开始维护。",
    chooseDocuments: "选择文档",
    qaPrompt: "问答场景提示词",
    qaPromptPlaceholder: "描述回答范围、语气和引用要求",
    topK: "检索条数",
    topKHint: "每次问答最多注入的相关片段数量",
    saveSettings: "保存设置",
    saved: "已保存",
    collapseSidebar: "收缩菜单栏",
    expandSidebar: "展开菜单栏",
    testAgent: "测试",
    testAgentTitle: "测试 Agent",
    testAgentSubtitle: "直接模拟一轮对话，验证当前提示词和能力配置是否生效。",
    testMessage: "测试消息",
    testMessagePlaceholder: "输入要发送给该 Agent 的问题",
    testPageContext: "页面上下文（可选）",
    testPageContextPlaceholder: "粘贴页面信息，验证 Agent 是否能正确使用上下文",
    runTest: "运行测试",
    testing: "测试中…",
    testResponse: "Agent 回复",
    testFailed: "Agent 测试失败，请稍后重试",
    agentSettingsPage: "Agent 配置",
    backToAgents: "返回 Agent 列表",
    basicInfo: "基本信息",
    knowledgeBinding: "知识库绑定",
    noKnowledgeBases: "暂无可用知识库，请先创建知识库。",
    search: "搜索",
    searchPlaceholder: "搜索名称、ID或描述",
    noSearchResults: "没有匹配的结果。",
    viewDetails: "查看详情",
    resourceDetails: "资源详情",
    capabilityBinding: "工具和 Skill",
    toolsTitle: "工具管理",
    toolsSubtitle: "注册可供 Agent 调用的后端 API 工具。",
    skillsSubtitle: "注册可供 Agent 使用的提示词技能。",
    newTool: "+ 新建工具",
    newSkill: "+ 新建 Skill",
    tool: "工具",
    skill: "Skill",
    toolName: "名称",
    toolTypeLabel: "类型",
    endpoint: "Endpoint（HTTPS）",
    method: "HTTP 方法",
    toolDescriptionPlaceholder: "说明这个工具可以完成什么操作",
    endpointPlaceholder: "https://api.example.com/resource",
    skillPrompt: "Skill 提示词",
    skillPromptPlaceholder: "定义 Skill 的行为和使用边界",
    version: "版本",
    noResources: "暂无资源，请先创建工具或 Skill。",
    edit: "编辑",
    deleteResource: "删除",
    deleteResourceConfirm: (name: string) =>
      `确定删除“${name}”吗？此操作不可撤销。`,
    resourceNameRequired: "请输入名称",
    endpointRequired: "HTTP 工具必须填写 Endpoint",
    skillPromptRequired: "Skill 提示词不能为空",
    resourceSaveFailed: "保存资源失败，请稍后重试",
    resourceDeleteFailed: "删除资源失败，请稍后重试",
    saveResource: "保存",
    createResource: "创建",
    ratingUp: "赞",
    ratingDown: "踩",
    noFeedback: "暂无评分反馈。用户在插件中点击赞/踩后会显示在这里。",
    noConversationLogs:
      "暂无对话日志。用户从浏览器插件发起对话后会显示在这里。",
    userMessage: "用户",
    assistantMessage: "助手",
    invocationDetails: "Agent 执行记录",
    actionDetails: "浏览器动作提案",
    route: "路由",
    duration: "耗时",
    confidence: "置信度",
    routeSource: "路由来源",
    actionPending: "待处理",
    actionCompleted: "已完成",
    actionFailed: "失败",
  },
  en: {
    title: "Page Assistant",
    subtitle: "Admin Console",
    agents: "Agents",
    knowledge: "Knowledge bases",
    toolsMenu: "Tools",
    skillsMenu: "Skill",
    skillsTitle: "Skill management",
    router: "Router test",
    agentRatings: "Agent ratings",
    conversationLogs: "Conversation logs",
    conversationLogsSubtitle:
      "Review user messages, routing, and Agent execution by session.",
    agentConfig: "Agent configuration",
    routerTest: "Main Agent router test",
    localMode: "Local mode",
    newAgent: "+ New Agent",
    newBase: "+ New knowledge base",
    enabled: "Enabled",
    disabled: "Disabled",
    noDescription: "No description",
    stop: "Disable",
    enable: "Enable",
    deleteAgent: "Delete",
    deleteAgentConfirm: (name: string) =>
      `Delete Agent “${name}”? This cannot be undone.`,
    deleteAgentDisabledHint: "Disable the Agent before deleting it",
    deleteAgentFailed: "Failed to delete the Agent. Please try again.",
    systemAgent: "System Agent",
    customAgent: "Custom Agent",
    systemAgentHint: "Built-in page-assistant agents cannot be deleted",
    customAgentHint: "Custom agents can be deleted after they are disabled",
    supportedDocs: "Supports Markdown, TXT, and PDF documents",
    upload: "Upload document",
    processing: "Processing…",
    uploadHint: "Markdown, TXT, PDF, up to 10 MB",
    parsed: "Parsed",
    pending: "Pending",
    parseFailed: "Failed",
    reindex: "Reprocess",
    delete: "Delete",
    deleteConfirm: (name: string) => `Delete “${name}”?`,
    routerPlaceholder: "Enter a message to test routing",
    testRoute: "Test route",
    newAgentTitle: "New Agent",
    newAgentSubtitle:
      "Enter the basic information first; configure capabilities and resources after creation.",
    agentId: "Agent ID",
    agentIdHint: "Use 2-128 lowercase letters, numbers, and hyphens.",
    agentIdPlaceholder: "e.g. release-helper",
    displayName: "Display name",
    displayNamePlaceholder: "e.g. Release assistant",
    descriptionOptional: "Description (optional)",
    agentDescriptionPlaceholder: "Briefly describe what this Agent handles",
    systemPrompt: "System prompt",
    systemPromptPlaceholder:
      "Define the Agent role, boundaries, and response style",
    browserActions:
      "Allow browser action proposals (user confirmation is still required)",
    cancel: "Cancel",
    createAgent: "Confirm create Agent",
    editAgentTitle: "Agent settings",
    editAgentSubtitle:
      "Tune capabilities, prompts, and resource links. Changes apply immediately.",
    saveAgent: "Confirm save",
    saving: "Saving…",
    model: "Model (optional)",
    modelPlaceholder: "Leave empty to use the default model",
    temperature: "Temperature (optional)",
    priority: "Routing priority",
    knowledgeBases: "Knowledge base IDs (optional)",
    tools: "Tool bindings",
    skills: "Skill bindings",
    noTools: "No enabled tools. Enable tools in tool management first.",
    noSkills: "No enabled Skills. Enable Skills in Skill management first.",
    toolType: "Type",
    browserProposal: "Browser action",
    idsHint: "Separate multiple IDs with commas",
    creating: "Creating…",
    newBaseTitle: "New knowledge base",
    newBaseSubtitle:
      "Upload documents and use them for page-assistant retrieval.",
    baseName: "Name",
    baseNamePlaceholder: "e.g. Product operation manual",
    baseDescriptionPlaceholder: "Briefly describe this knowledge base",
    createBase: "Create knowledge base",
    baseNameRequired: "Enter a knowledge base name",
    agentIdInvalid:
      "Agent ID must be 2-128 lowercase letters, numbers, or hyphens",
    agentNameRequired: "Agent name is required",
    promptRequired: "System prompt is required",
    createAgentFailed: "Failed to create Agent. Please try again.",
    createBaseFailed: "Failed to create knowledge base. Please try again.",
    uploadFailed: "Failed to upload document. Please try again.",
    reindexFailed: "Failed to reprocess document. Please try again.",
    deleteFailed: "Failed to delete document. Please try again.",
    settings: "Settings",
    language: "Language",
    chinese: "中文",
    english: "English",
    appearance: "Background",
    dark: "Dark",
    light: "Light",
    close: "Close",
    enter: "Open maintenance",
    back: "Back to knowledge bases",
    maintenance: "Knowledge maintenance",
    qaSettings: "Q&A scene settings",
    documentCount: (count: number) =>
      `${count} document${count === 1 ? "" : "s"}`,
    noDocuments:
      "No documents yet. Upload files to start maintaining this base.",
    chooseDocuments: "Choose documents",
    qaPrompt: "Q&A scene prompt",
    qaPromptPlaceholder:
      "Describe answer scope, tone, and citation requirements",
    topK: "Retrieval count",
    topKHint: "Maximum number of relevant chunks injected per question",
    saveSettings: "Save settings",
    saved: "Saved",
    collapseSidebar: "Collapse menu",
    expandSidebar: "Expand menu",
    testAgent: "Test",
    testAgentTitle: "Test Agent",
    testAgentSubtitle:
      "Simulate one conversation turn to verify the current prompt and capability configuration.",
    testMessage: "Test message",
    testMessagePlaceholder: "Enter a question for this Agent",
    testPageContext: "Page context (optional)",
    testPageContextPlaceholder:
      "Paste page information to verify context handling",
    runTest: "Run test",
    testing: "Testing…",
    testResponse: "Agent response",
    testFailed: "Agent test failed. Please try again.",
    agentSettingsPage: "Agent configuration",
    backToAgents: "Back to Agents",
    basicInfo: "Basic information",
    knowledgeBinding: "Knowledge bases",
    noKnowledgeBases: "No knowledge bases available. Create one first.",
    search: "Search",
    searchPlaceholder: "Search by name, ID, or description",
    noSearchResults: "No matching results.",
    viewDetails: "View details",
    resourceDetails: "Resource details",
    capabilityBinding: "Tools and Skill",
    toolsTitle: "Tool management",
    toolsSubtitle: "Register backend API tools that Agents can call.",
    skillsSubtitle: "Register prompt-based skills that Agents can use.",
    newTool: "+ New tool",
    newSkill: "+ New Skill",
    tool: "Tool",
    skill: "Skill",
    toolName: "Name",
    toolTypeLabel: "Type",
    endpoint: "Endpoint (HTTPS)",
    method: "HTTP method",
    toolDescriptionPlaceholder: "Describe what this tool can do",
    endpointPlaceholder: "https://api.example.com/resource",
    skillPrompt: "Skill prompt",
    skillPromptPlaceholder: "Define the Skill behavior and boundaries",
    version: "Version",
    noResources: "No resources yet. Create a tool or Skill first.",
    edit: "Edit",
    deleteResource: "Delete",
    deleteResourceConfirm: (name: string) =>
      `Delete “${name}”? This cannot be undone.`,
    resourceNameRequired: "Enter a name",
    endpointRequired: "HTTP tools require an Endpoint",
    skillPromptRequired: "Skill prompt is required",
    resourceSaveFailed: "Failed to save the resource. Please try again.",
    resourceDeleteFailed: "Failed to delete the resource. Please try again.",
    saveResource: "Save",
    createResource: "Create",
    ratingUp: "Up",
    ratingDown: "Down",
    noFeedback: "No feedback yet. Ratings from the extension will appear here.",
    noConversationLogs:
      "No conversation logs yet. Logs will appear after users chat from the extension.",
    userMessage: "User",
    assistantMessage: "Assistant",
    invocationDetails: "Agent invocations",
    actionDetails: "Browser action proposals",
    route: "Route",
    duration: "Duration",
    confidence: "Confidence",
    routeSource: "Route source",
    actionPending: "Pending",
    actionCompleted: "Completed",
    actionFailed: "Failed",
  },
} as const;

type Agent = {
  id: string;
  displayName: string;
  description?: string;
  enabled: boolean;
  systemPrompt: string;
  systemAgent?: boolean;
  supportsBrowserActions?: boolean;
  priority?: number;
  model?: string;
  temperature?: number;
  knowledgeBaseIds?: string;
  toolIds?: string;
  skillIds?: string;
};

type ToolDefinition = {
  id: string;
  name: string;
  description?: string;
  type?: string;
  method?: string;
  endpoint?: string;
  enabled: boolean;
};

type SkillDefinition = {
  id: string;
  name: string;
  description?: string;
  prompt: string;
  version?: string;
  enabled: boolean;
};

type ResourceDetails =
  | { kind: "tool"; resource: ToolDefinition }
  | { kind: "skill"; resource: SkillDefinition };

type AgentFeedback = {
  id: string;
  sessionId?: string;
  messageId?: string;
  messageIndex?: number;
  agentId?: string;
  rating: "up" | "down";
  comment?: string;
  createdAt?: string;
};

type Base = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
};

type KnowledgeDocument = {
  id: string;
  knowledgeBaseId: string;
  filename: string;
  mediaType?: string;
  status: "PENDING" | "INDEXING" | "READY" | "ERROR" | string;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
};

type QASceneSettings = {
  prompt: string;
  topK: number;
};

type ConversationLog = {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  messages: {
    id: string;
    role: string;
    content: string;
    agentId?: string;
    contextSummary?: string;
    createdAt?: string;
  }[];
  invocations: {
    id: string;
    requestedAgentId?: string;
    selectedAgentId?: string;
    routeReason?: string;
    confidence?: number;
    routeSource?: string;
    durationMs?: number;
    error?: string;
    createdAt?: string;
  }[];
  actions: {
    actionId: string;
    type?: string;
    target?: string;
    reason?: string;
    risk?: string;
    status?: string;
    result?: string;
    expiresAt?: string;
  }[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `请求失败（${response.status}）`);
  }

  return response.status === 204 ? (undefined as T) : response.json();
}

function App() {
  const [language, setLanguage] = useState<Language>(() => {
    return localStorage.getItem("admin-language") === "en" ? "en" : "zh";
  });
  const [theme, setTheme] = useState<Theme>(() => {
    return localStorage.getItem("admin-theme") === "light" ? "light" : "dark";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("admin-sidebar-collapsed") === "true",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversationLogs, setConversationLogs] = useState<ConversationLog[]>(
    [],
  );
  const [selectedConversationLogId, setSelectedConversationLogId] =
    useState<string>();
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [feedback, setFeedback] = useState<AgentFeedback[]>([]);
  const [resourceDialog, setResourceDialog] = useState<"tool" | "skill">();
  const [editingResourceId, setEditingResourceId] = useState<string>();
  const [resourceName, setResourceName] = useState("");
  const [resourceDescription, setResourceDescription] = useState("");
  const [resourceType, setResourceType] = useState("BROWSER_PROPOSAL");
  const [resourceMethod, setResourceMethod] = useState("POST");
  const [resourceEndpoint, setResourceEndpoint] = useState("");
  const [resourcePrompt, setResourcePrompt] = useState("");
  const [resourceVersion, setResourceVersion] = useState("1.0.0");
  const [resourceEnabled, setResourceEnabled] = useState(true);
  const [resourceSubmitting, setResourceSubmitting] = useState(false);
  const [resourceError, setResourceError] = useState("");
  const [resourceActionId, setResourceActionId] = useState<string>();
  const [resourceDetails, setResourceDetails] = useState<
    ResourceDetails | undefined
  >();
  const [bases, setBases] = useState<Base[]>([]);
  const [documents, setDocuments] = useState<
    Record<string, KnowledgeDocument[]>
  >({});
  const [uploadingBaseId, setUploadingBaseId] = useState<string>();
  const [uploadError, setUploadError] = useState("");
  const [documentActionId, setDocumentActionId] = useState<string>();
  const [activeBaseId, setActiveBaseId] = useState<string>();
  const [knowledgeSection, setKnowledgeSection] = useState<
    "maintenance" | "qa"
  >("maintenance");
  const [qaSettings, setQaSettings] = useState<Record<string, QASceneSettings>>(
    {},
  );
  const [qaSaved, setQaSaved] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    current: 0,
    total: 0,
  });
  const [tab, setTab] = useState("agents");
  const [message, setMessage] = useState("");
  const [route, setRoute] = useState<Record<string, unknown>>();
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string>();
  const [agentConfigId, setAgentConfigId] = useState<string>();
  const [agentConfigSection, setAgentConfigSection] = useState<
    "basic" | "knowledge" | "tools" | "skills"
  >("basic");
  const [agentId, setAgentId] = useState("custom-agent");
  const [agentDisplayName, setAgentDisplayName] = useState("自定义 Agent");
  const [agentDescription, setAgentDescription] = useState("");
  const [agentSystemPrompt, setAgentSystemPrompt] =
    useState("你是一个页面助手子 Agent。");
  const [agentBrowserActions, setAgentBrowserActions] = useState(false);
  const [agentEnabled, setAgentEnabled] = useState(true);
  const [agentPriority, setAgentPriority] = useState(100);
  const [agentModel, setAgentModel] = useState("");
  const [agentTemperature, setAgentTemperature] = useState("");
  const [agentKnowledgeBaseIds, setAgentKnowledgeBaseIds] = useState("");
  const [agentToolIds, setAgentToolIds] = useState<string[]>([]);
  const [agentSkillIds, setAgentSkillIds] = useState<string[]>([]);
  const [agentKnowledgeSearch, setAgentKnowledgeSearch] = useState("");
  const [agentToolSearch, setAgentToolSearch] = useState("");
  const [agentSkillSearch, setAgentSkillSearch] = useState("");
  const [agentSubmitting, setAgentSubmitting] = useState(false);
  const [agentError, setAgentError] = useState("");
  const [agentActionId, setAgentActionId] = useState<string>();
  const [agentTestDialogOpen, setAgentTestDialogOpen] = useState(false);
  const [testingAgent, setTestingAgent] = useState<Agent>();
  const [agentTestMessage, setAgentTestMessage] = useState("");
  const [agentTestContext, setAgentTestContext] = useState("");
  const [agentTestResult, setAgentTestResult] = useState("");
  const [agentTestError, setAgentTestError] = useState("");
  const [agentTestSubmitting, setAgentTestSubmitting] = useState(false);
  const [baseDialogOpen, setBaseDialogOpen] = useState(false);
  const [baseName, setBaseName] = useState("");
  const [baseDescription, setBaseDescription] = useState("");
  const [baseSubmitting, setBaseSubmitting] = useState(false);
  const [baseError, setBaseError] = useState("");
  const t = translations[language];

  const parseIds = (value?: string) => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === "string");
      }
    } catch {
      // Older records may use comma-separated IDs.
    }
    return value
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("admin-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("admin-language", language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem("admin-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem("admin-qa-settings") ?? "{}",
      );
      if (stored && typeof stored === "object") setQaSettings(stored);
    } catch {
      setQaSettings({});
    }
  }, []);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [settingsOpen]);

  const load = () => {
    request<Agent[]>("/admin/agents")
      .then(setAgents)
      .catch(() => setAgents([]));
    request<ConversationLog[]>("/admin/conversation-logs")
      .then((logs) => {
        setConversationLogs(logs);
        setSelectedConversationLogId((current) =>
          current && logs.some((log) => log.id === current)
            ? current
            : logs[0]?.id,
        );
      })
      .catch(() => setConversationLogs([]));
    request<ToolDefinition[]>("/admin/tools")
      .then(setTools)
      .catch(() => setTools([]));
    request<SkillDefinition[]>("/admin/skills")
      .then(setSkills)
      .catch(() => setSkills([]));
    request<AgentFeedback[]>("/admin/agent-feedback")
      .then(setFeedback)
      .catch(() => setFeedback([]));
    request<Base[]>("/admin/knowledge-bases")
      .then((list) => {
        setBases(list);
        Promise.all(
          list.map(async (base) => {
            try {
              return [
                base.id,
                await request<KnowledgeDocument[]>(
                  `/admin/knowledge-bases/${base.id}/documents`,
                ),
              ] as const;
            } catch {
              return [base.id, []] as const;
            }
          }),
        ).then((entries) => setDocuments(Object.fromEntries(entries)));
      })
      .catch(() => {
        setBases([]);
        setDocuments({});
      });
  };

  useEffect(load, []);

  const openResourceDialog = (
    kind: "tool" | "skill",
    resource?: ToolDefinition | SkillDefinition,
  ) => {
    setResourceDialog(kind);
    setEditingResourceId(resource?.id);
    setResourceName(resource?.name ?? "");
    setResourceDescription(resource?.description ?? "");
    setResourceEnabled(resource?.enabled ?? true);
    setResourceError("");
    if (kind === "tool") {
      const tool = resource as ToolDefinition | undefined;
      setResourceType(tool?.type ?? "BROWSER_PROPOSAL");
      setResourceMethod(tool?.method ?? "POST");
      setResourceEndpoint(tool?.endpoint ?? "");
    } else {
      const skill = resource as SkillDefinition | undefined;
      setResourcePrompt(skill?.prompt ?? "");
      setResourceVersion(skill?.version ?? "1.0.0");
    }
  };

  const closeResourceDialog = () => {
    if (!resourceSubmitting) setResourceDialog(undefined);
  };

  const saveResource = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resourceDialog) return;
    const name = resourceName.trim();
    if (!name) {
      setResourceError(t.resourceNameRequired);
      return;
    }
    if (
      resourceDialog === "tool" &&
      resourceType === "HTTP" &&
      !resourceEndpoint.trim()
    ) {
      setResourceError(t.endpointRequired);
      return;
    }
    if (resourceDialog === "skill" && !resourcePrompt.trim()) {
      setResourceError(t.skillPromptRequired);
      return;
    }
    setResourceSubmitting(true);
    setResourceError("");
    try {
      const path = editingResourceId
        ? `/admin/${resourceDialog === "tool" ? "tools" : "skills"}/${editingResourceId}`
        : `/admin/${resourceDialog === "tool" ? "tools" : "skills"}`;
      const body =
        resourceDialog === "tool"
          ? {
              id: editingResourceId,
              name,
              description: resourceDescription.trim(),
              type: resourceType,
              method: resourceMethod,
              endpoint: resourceEndpoint.trim() || null,
              enabled: resourceEnabled,
            }
          : {
              id: editingResourceId,
              name,
              description: resourceDescription.trim(),
              prompt: resourcePrompt.trim(),
              version: resourceVersion.trim() || "1.0.0",
              enabled: resourceEnabled,
            };
      await request(path, {
        method: editingResourceId ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      setResourceDialog(undefined);
      load();
    } catch (error) {
      setResourceError(
        error instanceof Error ? error.message : t.resourceSaveFailed,
      );
    } finally {
      setResourceSubmitting(false);
    }
  };

  const toggleResource = async (
    kind: "tool" | "skill",
    resource: ToolDefinition | SkillDefinition,
  ) => {
    setResourceActionId(resource.id);
    try {
      await request(
        `/admin/${kind === "tool" ? "tools" : "skills"}/${resource.id}`,
        {
          method: "PUT",
          body: JSON.stringify({ ...resource, enabled: !resource.enabled }),
        },
      );
      load();
    } catch (error) {
      setResourceError(
        error instanceof Error ? error.message : t.resourceSaveFailed,
      );
    } finally {
      setResourceActionId(undefined);
    }
  };

  const deleteResource = async (
    kind: "tool" | "skill",
    resource: ToolDefinition | SkillDefinition,
  ) => {
    if (!window.confirm(t.deleteResourceConfirm(resource.name))) return;
    setResourceActionId(resource.id);
    try {
      await request(
        `/admin/${kind === "tool" ? "tools" : "skills"}/${resource.id}`,
        {
          method: "DELETE",
        },
      );
      load();
    } catch (error) {
      setResourceError(
        error instanceof Error ? error.message : t.resourceDeleteFailed,
      );
    } finally {
      setResourceActionId(undefined);
    }
  };

  useEffect(() => {
    if (
      !baseDialogOpen &&
      !agentDialogOpen &&
      !agentTestDialogOpen &&
      !resourceDialog
    )
      return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (baseDialogOpen && !baseSubmitting) {
        setBaseDialogOpen(false);
      }
      if (agentDialogOpen && !agentSubmitting) {
        setAgentDialogOpen(false);
      }
      if (agentTestDialogOpen && !agentTestSubmitting) {
        setAgentTestDialogOpen(false);
      }
      if (resourceDialog && !resourceSubmitting) {
        setResourceDialog(undefined);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    agentDialogOpen,
    agentSubmitting,
    agentTestDialogOpen,
    agentTestSubmitting,
    baseDialogOpen,
    baseSubmitting,
    resourceDialog,
    resourceSubmitting,
  ]);

  const activeBase = bases.find((base) => base.id === activeBaseId);
  const activeQaSettings: QASceneSettings = activeBaseId
    ? (qaSettings[activeBaseId] ?? { prompt: "", topK: 5 })
    : { prompt: "", topK: 5 };

  const openKnowledgeBase = (base: Base) => {
    setActiveBaseId(base.id);
    setKnowledgeSection("maintenance");
    setUploadError("");
    setQaSaved(false);
  };

  const closeKnowledgeBase = () => {
    setActiveBaseId(undefined);
    setUploadError("");
  };

  const updateQaSettings = (patch: Partial<QASceneSettings>) => {
    if (!activeBaseId) return;
    setQaSettings((current) => ({
      ...current,
      [activeBaseId]: { ...activeQaSettings, ...patch },
    }));
    setQaSaved(false);
  };

  const saveQaSettings = () => {
    localStorage.setItem("admin-qa-settings", JSON.stringify(qaSettings));
    setQaSaved(true);
    window.setTimeout(() => setQaSaved(false), 1800);
  };

  const addAgent = () => {
    setAgentConfigId(undefined);
    setEditingAgentId(undefined);
    setAgentId("custom-agent");
    setAgentDisplayName(language === "zh" ? "自定义 Agent" : "Custom Agent");
    setAgentDescription("");
    setAgentSystemPrompt(
      language === "zh"
        ? "你是一个页面助手子 Agent。"
        : "You are a page-assistant sub-agent.",
    );
    setAgentBrowserActions(false);
    setAgentEnabled(true);
    setAgentPriority(100);
    setAgentModel("");
    setAgentTemperature("");
    setAgentKnowledgeBaseIds("");
    setAgentToolIds([]);
    setAgentSkillIds([]);
    setAgentKnowledgeSearch("");
    setAgentToolSearch("");
    setAgentSkillSearch("");
    setAgentError("");
    setAgentDialogOpen(true);
  };

  const openAgentSettings = (agent: Agent) => {
    setAgentConfigId(agent.id);
    setTab("agent-settings");
    setAgentConfigSection("basic");
    setEditingAgentId(agent.id);
    setAgentId(agent.id);
    setAgentDisplayName(agent.displayName);
    setAgentDescription(agent.description ?? "");
    setAgentSystemPrompt(agent.systemPrompt ?? "");
    setAgentBrowserActions(Boolean(agent.supportsBrowserActions));
    setAgentEnabled(agent.enabled);
    setAgentPriority(agent.priority ?? 100);
    setAgentModel(agent.model ?? "");
    setAgentTemperature(
      agent.temperature === undefined || agent.temperature === null
        ? ""
        : String(agent.temperature),
    );
    setAgentKnowledgeBaseIds(agent.knowledgeBaseIds ?? "");
    setAgentToolIds(parseIds(agent.toolIds));
    setAgentSkillIds(parseIds(agent.skillIds));
    setAgentKnowledgeSearch("");
    setAgentToolSearch("");
    setAgentSkillSearch("");
    setAgentError("");
    setAgentDialogOpen(false);
  };

  const closeAgentConfig = () => {
    setAgentConfigId(undefined);
    setTab("agents");
  };

  const closeAgentDialog = () => {
    if (!agentSubmitting) setAgentDialogOpen(false);
  };

  const openAgentTest = (agent: Agent) => {
    setTestingAgent(agent);
    setAgentTestMessage("");
    setAgentTestContext("");
    setAgentTestResult("");
    setAgentTestError("");
    setAgentTestDialogOpen(true);
  };

  const closeAgentTest = () => {
    if (!agentTestSubmitting) setAgentTestDialogOpen(false);
  };

  const runAgentTest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!testingAgent || !agentTestMessage.trim()) return;
    setAgentTestSubmitting(true);
    setAgentTestError("");
    setAgentTestResult("");
    try {
      const result = await request<{ response: string }>(
        `/admin/agents/${testingAgent.id}/test`,
        {
          method: "POST",
          body: JSON.stringify({
            message: agentTestMessage.trim(),
            pageContext: agentTestContext.trim() || null,
          }),
        },
      );
      setAgentTestResult(result.response);
    } catch (error) {
      setAgentTestError(error instanceof Error ? error.message : t.testFailed);
    } finally {
      setAgentTestSubmitting(false);
    }
  };

  const saveAgent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = agentId.trim();
    const displayName = agentDisplayName.trim();
    const systemPrompt = agentSystemPrompt.trim();
    if (!/^[a-z0-9][a-z0-9-]{1,127}$/.test(id)) {
      setAgentError(t.agentIdInvalid);
      return;
    }
    if (!displayName) {
      setAgentError(t.agentNameRequired);
      return;
    }
    if (!systemPrompt) {
      setAgentError(t.promptRequired);
      return;
    }

    setAgentSubmitting(true);
    setAgentError("");
    try {
      await request(
        editingAgentId ? `/admin/agents/${editingAgentId}` : "/admin/agents",
        {
          method: editingAgentId ? "PUT" : "POST",
          body: JSON.stringify({
            id,
            displayName,
            description: agentDescription.trim(),
            systemPrompt,
            enabled: agentEnabled,
            priority: Math.max(0, Math.min(10000, Number(agentPriority) || 0)),
            supportsBrowserActions: agentBrowserActions,
            model: agentModel.trim() || null,
            temperature: agentTemperature.trim()
              ? Number(agentTemperature)
              : null,
            knowledgeBaseIds: agentKnowledgeBaseIds.trim(),
            toolIds: JSON.stringify(agentToolIds),
            skillIds: JSON.stringify(agentSkillIds),
          }),
        },
      );
      setAgentDialogOpen(false);
      load();
    } catch (error) {
      setAgentError(
        error instanceof Error ? error.message : t.createAgentFailed,
      );
    } finally {
      setAgentSubmitting(false);
    }
  };

  const toggle = async (agent: Agent) => {
    await request(`/admin/agents/${agent.id}/enabled`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !agent.enabled }),
    });
    load();
  };

  const deleteAgent = async (agent: Agent) => {
    if (
      agent.systemAgent ||
      ["assistant", "route-copilot"].includes(agent.id)
    ) {
      return;
    }
    if (
      agent.enabled ||
      !window.confirm(t.deleteAgentConfirm(agent.displayName))
    ) {
      return;
    }
    setAgentActionId(agent.id);
    try {
      await request(`/admin/agents/${agent.id}`, { method: "DELETE" });
      setAgents((current) => current.filter((item) => item.id !== agent.id));
    } catch (error) {
      setAgentError(
        error instanceof Error ? error.message : t.deleteAgentFailed,
      );
    } finally {
      setAgentActionId(undefined);
    }
  };

  const isSystemAgent = (agent: Agent) =>
    agent.systemAgent === true ||
    ["assistant", "route-copilot"].includes(agent.id);

  const addBase = () => {
    setBaseName("");
    setBaseDescription("");
    setBaseError("");
    setBaseDialogOpen(true);
  };

  const closeBaseDialog = () => {
    if (!baseSubmitting) setBaseDialogOpen(false);
  };

  const createBase = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = baseName.trim();
    if (!name) {
      setBaseError(t.baseNameRequired);
      return;
    }

    setBaseSubmitting(true);
    setBaseError("");
    try {
      await request("/admin/knowledge-bases", {
        method: "POST",
        body: JSON.stringify({
          name,
          description: baseDescription.trim(),
          enabled: true,
        }),
      });
      setBaseDialogOpen(false);
      load();
    } catch (error) {
      setBaseError(error instanceof Error ? error.message : t.createBaseFailed);
    } finally {
      setBaseSubmitting(false);
    }
  };

  const uploadDocument = async (baseId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(
      `${API}/admin/knowledge-bases/${baseId}/documents`,
      {
        method: "POST",
        body: formData,
      },
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `上传失败（${response.status}）`);
    }
    return (await response.json()) as KnowledgeDocument;
  };

  const uploadDocuments = async (
    baseId: string,
    files: FileList | null,
    input: HTMLInputElement,
  ) => {
    input.value = "";
    const selectedFiles = files ? Array.from(files) : [];
    if (!selectedFiles.length) return;
    setUploadingBaseId(baseId);
    setUploadError("");
    setUploadProgress({ current: 0, total: selectedFiles.length });
    try {
      for (const [index, file] of selectedFiles.entries()) {
        const document = await uploadDocument(baseId, file);
        setDocuments((current) => ({
          ...current,
          [baseId]: [
            document,
            ...(current[baseId] ?? []).filter(
              (item) => item.id !== document.id,
            ),
          ],
        }));
        setUploadProgress({ current: index + 1, total: selectedFiles.length });
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t.uploadFailed);
    } finally {
      setUploadingBaseId(undefined);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  const reindexDocument = async (document: KnowledgeDocument) => {
    setDocumentActionId(document.id);
    setUploadError("");
    try {
      const updated = await request<KnowledgeDocument>(
        `/admin/knowledge-bases/documents/${document.id}/reindex`,
        { method: "POST" },
      );
      setDocuments((current) => ({
        ...current,
        [document.knowledgeBaseId]: (
          current[document.knowledgeBaseId] ?? []
        ).map((item) => (item.id === document.id ? updated : item)),
      }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t.reindexFailed);
    } finally {
      setDocumentActionId(undefined);
    }
  };

  const deleteDocument = async (document: KnowledgeDocument) => {
    if (!window.confirm(t.deleteConfirm(document.filename))) return;
    setDocumentActionId(document.id);
    setUploadError("");
    try {
      await request(`/admin/knowledge-bases/documents/${document.id}`, {
        method: "DELETE",
      });
      setDocuments((current) => ({
        ...current,
        [document.knowledgeBaseId]: (
          current[document.knowledgeBaseId] ?? []
        ).filter((item) => item.id !== document.id),
      }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t.deleteFailed);
    } finally {
      setDocumentActionId(undefined);
    }
  };

  const documentStatus = (
    status: KnowledgeDocument["status"],
    labels: (typeof translations)[Language],
  ) => {
    if (status === "READY") return labels.parsed;
    if (status === "INDEXING") return labels.processing;
    if (status === "ERROR") return labels.parseFailed;
    return labels.pending;
  };

  const testRoute = async () => {
    if (!message.trim()) return;
    setRoute(
      await request<Record<string, unknown>>("/admin/router/test", {
        method: "POST",
        body: JSON.stringify({
          message,
          pageContext: "",
        }),
      }),
    );
  };

  return (
    <div className="shell">
      <aside className={sidebarCollapsed ? "sidebar-collapsed" : undefined}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <h1>{t.title}</h1>
            {!sidebarCollapsed && <p className="muted">{t.subtitle}</p>}
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={sidebarCollapsed ? t.expandSidebar : t.collapseSidebar}
            title={sidebarCollapsed ? t.expandSidebar : t.collapseSidebar}
          >
            {sidebarCollapsed ? "›" : "‹"}
          </button>
        </div>
        {[
          ["agents", "◆"],
          ["knowledge", "▣"],
          ["tools", "⚒"],
          ["skills", "✦"],
          ["ratings", "★"],
          ["conversation-logs", "☷"],
          ["router", "⌁"],
        ].map(([key, icon]) => {
          const labels: Record<string, string> = {
            agents: t.agents,
            knowledge: t.knowledge,
            tools: t.toolsMenu,
            skills: t.skillsMenu,
            ratings: t.agentRatings,
            "conversation-logs": t.conversationLogs,
            router: t.router,
          };
          return (
            <button
              className={tab === key ? "nav active" : "nav"}
              onClick={() => setTab(key)}
              title={sidebarCollapsed ? labels[key] : undefined}
              aria-label={labels[key]}
              key={key}
            >
              <span className="nav-icon" aria-hidden="true">
                {icon}
              </span>
              {!sidebarCollapsed && <span>{labels[key]}</span>}
            </button>
          );
        })}
      </aside>

      <main>
        <header>
          <h2>
            {tab === "agents"
              ? t.agentConfig
              : tab === "agent-settings"
                ? t.agentSettingsPage
                : tab === "knowledge"
                  ? t.knowledge
                  : tab === "tools"
                    ? t.toolsTitle
                    : tab === "skills"
                      ? t.skillsTitle
                      : tab === "ratings"
                        ? t.agentRatings
                        : tab === "conversation-logs"
                          ? t.conversationLogs
                          : t.routerTest}
          </h2>
          <div className="header-actions">
            <span className="badge">{t.localMode}</span>
            <button
              className="settings-button"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-label={t.settings}
              title={t.settings}
            >
              ⚙
            </button>
            {settingsOpen && (
              <div
                className="settings-popover"
                role="dialog"
                aria-label={t.settings}
              >
                <strong>{t.settings}</strong>
                <span className="settings-label">{t.language}</span>
                <div className="settings-options">
                  <button
                    className={language === "zh" ? "option active" : "option"}
                    onClick={() => setLanguage("zh")}
                  >
                    {t.chinese}
                  </button>
                  <button
                    className={language === "en" ? "option active" : "option"}
                    onClick={() => setLanguage("en")}
                  >
                    {t.english}
                  </button>
                </div>
                <span className="settings-label">{t.appearance}</span>
                <div className="settings-options">
                  <button
                    className={theme === "dark" ? "option active" : "option"}
                    onClick={() => setTheme("dark")}
                  >
                    {t.dark}
                  </button>
                  <button
                    className={theme === "light" ? "option active" : "option"}
                    onClick={() => setTheme("light")}
                  >
                    {t.light}
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {tab === "agent-settings" && agentConfigId && (
          <section className="agent-settings-page">
            <div className="detail-header agent-settings-header">
              <button className="back-button" onClick={closeAgentConfig}>
                {t.backToAgents}
              </button>
              <div>
                <h3>{agentDisplayName || agentId}</h3>
                <p>{t.editAgentSubtitle}</p>
              </div>
              <button
                className="agent-test"
                onClick={() => {
                  const current = agents.find(
                    (item) => item.id === agentConfigId,
                  );
                  if (current) openAgentTest(current);
                }}
                disabled={!agentEnabled}
              >
                {t.testAgent}
              </button>
            </div>
            <div className="config-tabs">
              {(
                [
                  ["basic", t.basicInfo],
                  ["knowledge", t.knowledgeBinding],
                  ["tools", t.tools],
                  ["skills", t.skills],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={agentConfigSection === key ? "active" : undefined}
                  onClick={() => setAgentConfigSection(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <form className="agent-settings-form" onSubmit={saveAgent}>
              {agentConfigSection === "basic" && (
                <div className="settings-panel">
                  <label className="field">
                    <span>{t.agentId}</span>
                    <input value={agentId} disabled />
                    <small className="field-hint">{t.agentIdHint}</small>
                  </label>
                  <label className="field">
                    <span>{t.displayName}</span>
                    <input
                      value={agentDisplayName}
                      onChange={(event) =>
                        setAgentDisplayName(event.target.value)
                      }
                      maxLength={100}
                    />
                  </label>
                  <label className="field">
                    <span>{t.descriptionOptional}</span>
                    <textarea
                      value={agentDescription}
                      onChange={(event) =>
                        setAgentDescription(event.target.value)
                      }
                      rows={3}
                      maxLength={500}
                    />
                  </label>
                  <label className="field">
                    <span>{t.systemPrompt}</span>
                    <textarea
                      value={agentSystemPrompt}
                      onChange={(event) =>
                        setAgentSystemPrompt(event.target.value)
                      }
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
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={agentEnabled}
                      onChange={(event) =>
                        setAgentEnabled(event.target.checked)
                      }
                    />
                    <span>{t.enabled}</span>
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
                        onChange={(event) =>
                          setAgentTemperature(event.target.value)
                        }
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
                        return [
                          base.id,
                          base.name,
                          base.description ?? "",
                        ].some((value) => value.toLowerCase().includes(query));
                      }).length === 0 ? (
                        <p className="binding-empty">{t.noSearchResults}</p>
                      ) : (
                        <div className="binding-list">
                          {bases
                            .filter((base) => {
                              const query = agentKnowledgeSearch
                                .trim()
                                .toLowerCase();
                              if (!query) return true;
                              return [
                                base.id,
                                base.name,
                                base.description ?? "",
                              ].some((value) =>
                                value.toLowerCase().includes(query),
                              );
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
                                      const current = parseIds(
                                        agentKnowledgeBaseIds,
                                      );
                                      const next = selected
                                        ? current.filter((id) => id !== base.id)
                                        : [...current, base.id];
                                      setAgentKnowledgeBaseIds(
                                        JSON.stringify(next),
                                      );
                                    }}
                                  />
                                  <span className="binding-copy">
                                    <span className="binding-name">
                                      {base.name}
                                    </span>
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
                        <span className="binding-count">
                          {agentToolIds.length}
                        </span>
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
                            ].some((value) =>
                              value.toLowerCase().includes(query),
                            );
                          }).length === 0 ? (
                            <p className="binding-empty">{t.noSearchResults}</p>
                          ) : (
                            <div className="binding-list">
                              {tools
                                .filter((tool) => {
                                  if (!tool.enabled) return false;
                                  const query = agentToolSearch
                                    .trim()
                                    .toLowerCase();
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
                                  const checked = agentToolIds.includes(
                                    tool.id,
                                  );
                                  return (
                                    <label
                                      className="binding-option"
                                      key={tool.id}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          setAgentToolIds((current) =>
                                            checked
                                              ? current.filter(
                                                  (id) => id !== tool.id,
                                                )
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
                        <span className="binding-count">
                          {agentSkillIds.length}
                        </span>
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
                            ].some((value) =>
                              value.toLowerCase().includes(query),
                            );
                          }).length === 0 ? (
                            <p className="binding-empty">{t.noSearchResults}</p>
                          ) : (
                            <div className="binding-list">
                              {skills
                                .filter((skill) => {
                                  if (!skill.enabled) return false;
                                  const query = agentSkillSearch
                                    .trim()
                                    .toLowerCase();
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
                                  const checked = agentSkillIds.includes(
                                    skill.id,
                                  );
                                  return (
                                    <label
                                      className="binding-option"
                                      key={skill.id}
                                    >
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
              {agentError && <p className="error">{agentError}</p>}
              <div className="settings-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeAgentConfig}
                >
                  {t.cancel}
                </button>
                <button type="submit" disabled={agentSubmitting}>
                  {agentSubmitting ? t.saving : t.saveAgent}
                </button>
              </div>
            </form>
          </section>
        )}

        {tab === "agents" && (
          <section>
            <button onClick={addAgent}>{t.newAgent}</button>
            {agentError && !agentDialogOpen && (
              <p className="error page-error">{agentError}</p>
            )}
            {([true, false] as const).map((system) => {
              const group = agents.filter(
                (agent) => isSystemAgent(agent) === system,
              );
              if (!group.length) return null;
              return (
                <section
                  className="agent-group"
                  key={system ? "system" : "custom"}
                >
                  <div className="group-heading">
                    <div>
                      <h3>{system ? t.systemAgent : t.customAgent}</h3>
                      <p>{system ? t.systemAgentHint : t.customAgentHint}</p>
                    </div>
                    <span className="group-count">{group.length}</span>
                  </div>
                  <div className="grid">
                    {group.map((agent) => (
                      <article key={agent.id}>
                        <div className="row">
                          <strong>{agent.displayName}</strong>
                          <span className={agent.enabled ? "ok" : "off"}>
                            {agent.enabled ? t.enabled : t.disabled}
                          </span>
                        </div>
                        <code>{agent.id}</code>
                        <p>{agent.description || t.noDescription}</p>
                        <div className="agent-actions">
                          <button
                            onClick={() => openAgentSettings(agent)}
                            className="secondary"
                            disabled={agentActionId === agent.id}
                          >
                            {t.settings}
                          </button>
                          <button
                            onClick={() => toggle(agent)}
                            disabled={agentActionId === agent.id}
                          >
                            {agent.enabled ? t.stop : t.enable}
                          </button>
                          {!system && (
                            <button
                              className="agent-delete"
                              onClick={() => deleteAgent(agent)}
                              disabled={
                                agent.enabled || agentActionId === agent.id
                              }
                              title={
                                agent.enabled
                                  ? t.deleteAgentDisabledHint
                                  : t.deleteAgent
                              }
                            >
                              {t.deleteAgent}
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </section>
        )}

        {tab === "knowledge" && (
          <section>
            {!activeBase ? (
              <>
                <button onClick={addBase}>{t.newBase}</button>
                {uploadError && (
                  <p className="error page-error">{uploadError}</p>
                )}
                <div className="grid">
                  {bases.map((base) => (
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
                      <code>{base.id}</code>
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
                      </div>
                    </article>
                  ))}
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
                  <div>
                    <h3>{activeBase.name}</h3>
                    <p>{activeBase.description || t.supportedDocs}</p>
                  </div>
                </div>
                <div className="detail-tabs" role="tablist">
                  <button
                    role="tab"
                    aria-selected={knowledgeSection === "maintenance"}
                    className={
                      knowledgeSection === "maintenance"
                        ? "detail-tab active"
                        : "detail-tab"
                    }
                    onClick={() => setKnowledgeSection("maintenance")}
                  >
                    {t.maintenance}
                  </button>
                  <button
                    role="tab"
                    aria-selected={knowledgeSection === "qa"}
                    className={
                      knowledgeSection === "qa"
                        ? "detail-tab active"
                        : "detail-tab"
                    }
                    onClick={() => setKnowledgeSection("qa")}
                  >
                    {t.qaSettings}
                  </button>
                </div>
                {uploadError && (
                  <p className="error page-error">{uploadError}</p>
                )}
                {knowledgeSection === "maintenance" ? (
                  <div className="maintenance-panel">
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
                    {(documents[activeBase.id] ?? []).length === 0 ? (
                      <p className="empty-documents">{t.noDocuments}</p>
                    ) : (
                      <div className="document-list detail-document-list">
                        {(documents[activeBase.id] ?? []).map((document) => (
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
                  </div>
                ) : (
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
                    <div className="modal-actions qa-actions">
                      <button onClick={saveQaSettings}>
                        {qaSaved ? `✓ ${t.saved}` : t.saveSettings}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {tab === "tools" && (
          <section>
            <div className="resource-toolbar">
              <div>
                <p className="muted">{t.toolsSubtitle}</p>
              </div>
              <div className="resource-toolbar-actions">
                <button onClick={() => openResourceDialog("tool")}>
                  {t.newTool}
                </button>
              </div>
            </div>
            {resourceError && !resourceDialog && (
              <p className="error page-error">{resourceError}</p>
            )}
            <div className="resource-section">
              <h3>{t.tool}</h3>
              {tools.length === 0 ? (
                <p className="empty-documents">{t.noResources}</p>
              ) : (
                <div className="grid">
                  {tools.map((tool) => (
                    <article key={tool.id}>
                      <div className="row">
                        <strong>{tool.name}</strong>
                        <span className={tool.enabled ? "ok" : "off"}>
                          {tool.enabled ? t.enabled : t.disabled}
                        </span>
                      </div>
                      <code>{tool.id}</code>
                      <p>{tool.description || t.noDescription}</p>
                      <div className="resource-meta">
                        <span>{tool.type || t.toolTypeLabel}</span>
                        {tool.method && <span>{tool.method}</span>}
                        {tool.endpoint && <span>{tool.endpoint}</span>}
                      </div>
                      <div className="agent-actions">
                        <button
                          className="secondary"
                          onClick={() => openResourceDialog("tool", tool)}
                          disabled={resourceActionId === tool.id}
                        >
                          {t.edit}
                        </button>
                        <button
                          onClick={() => toggleResource("tool", tool)}
                          disabled={resourceActionId === tool.id}
                        >
                          {tool.enabled ? t.stop : t.enable}
                        </button>
                        <button
                          className="agent-delete"
                          onClick={() => deleteResource("tool", tool)}
                          disabled={resourceActionId === tool.id}
                        >
                          {t.deleteResource}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "skills" && (
          <section>
            <div className="resource-toolbar">
              <p className="muted">{t.skillsSubtitle}</p>
              <button onClick={() => openResourceDialog("skill")}>
                {t.newSkill}
              </button>
            </div>
            {resourceError && !resourceDialog && (
              <p className="error page-error">{resourceError}</p>
            )}
            <div className="resource-section">
              <h3>{t.skill}</h3>
              {skills.length === 0 ? (
                <p className="empty-documents">{t.noResources}</p>
              ) : (
                <div className="grid">
                  {skills.map((skill) => (
                    <article key={skill.id}>
                      <div className="row">
                        <strong>{skill.name}</strong>
                        <span className={skill.enabled ? "ok" : "off"}>
                          {skill.enabled ? t.enabled : t.disabled}
                        </span>
                      </div>
                      <code>{skill.id}</code>
                      <p>{skill.description || t.noDescription}</p>
                      <div className="resource-meta">
                        <span>v{skill.version || "1.0.0"}</span>
                      </div>
                      <div className="agent-actions">
                        <button
                          className="secondary"
                          onClick={() => openResourceDialog("skill", skill)}
                          disabled={resourceActionId === skill.id}
                        >
                          {t.edit}
                        </button>
                        <button
                          onClick={() => toggleResource("skill", skill)}
                          disabled={resourceActionId === skill.id}
                        >
                          {skill.enabled ? t.stop : t.enable}
                        </button>
                        <button
                          className="agent-delete"
                          onClick={() => deleteResource("skill", skill)}
                          disabled={resourceActionId === skill.id}
                        >
                          {t.deleteResource}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "ratings" && (
          <section>
            <p className="muted">{t.noFeedback}</p>
            {feedback.length === 0 ? (
              <p className="empty-documents">{t.noFeedback}</p>
            ) : (
              <div className="feedback-list">
                {feedback.map((item) => (
                  <article className="feedback-card" key={item.id}>
                    <div className="row">
                      <strong>{item.agentId || "-"}</strong>
                      <span className={item.rating === "up" ? "ok" : "off"}>
                        {item.rating === "up" ? t.ratingUp : t.ratingDown}
                      </span>
                    </div>
                    <code>{item.sessionId || item.messageId || ""}</code>
                    {item.createdAt && (
                      <small>{new Date(item.createdAt).toLocaleString()}</small>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "conversation-logs" && (
          <section className="conversation-logs-page">
            <p className="muted">{t.conversationLogsSubtitle}</p>
            {conversationLogs.length === 0 ? (
              <p className="empty-documents">{t.noConversationLogs}</p>
            ) : (
              <div className="conversation-log-list">
                {conversationLogs.map((log) => {
                  const selected = selectedConversationLogId === log.id;
                  return (
                    <article
                      className={
                        selected
                          ? "conversation-log-card selected"
                          : "conversation-log-card"
                      }
                      key={log.id}
                    >
                      <button
                        type="button"
                        className="conversation-log-heading"
                        onClick={() => setSelectedConversationLogId(log.id)}
                        aria-expanded={selected}
                      >
                        <span>
                          <strong>{log.title || log.id}</strong>
                          <code>{log.id}</code>
                        </span>
                        <span className="conversation-log-meta">
                          {log.updatedAt
                            ? new Date(log.updatedAt).toLocaleString()
                            : "-"}
                          <span>{log.messages.length} 条消息</span>
                        </span>
                      </button>
                      {selected && (
                        <div className="conversation-log-body">
                          <section>
                            <h4>
                              {t.userMessage} / {t.assistantMessage}
                            </h4>
                            <div className="conversation-log-messages">
                              {log.messages.length === 0 ? (
                                <p className="binding-empty">-</p>
                              ) : (
                                log.messages.map((item) => (
                                  <div
                                    className={
                                      item.role === "user"
                                        ? "conversation-log-message user"
                                        : "conversation-log-message assistant"
                                    }
                                    key={item.id}
                                  >
                                    <div className="conversation-log-message-meta">
                                      <strong>
                                        {item.role === "user"
                                          ? t.userMessage
                                          : t.assistantMessage}
                                      </strong>
                                      {item.agentId && (
                                        <code>{item.agentId}</code>
                                      )}
                                      {item.createdAt && (
                                        <small>
                                          {new Date(
                                            item.createdAt,
                                          ).toLocaleString()}
                                        </small>
                                      )}
                                    </div>
                                    <p>{item.content || "-"}</p>
                                    {item.contextSummary && (
                                      <details>
                                        <summary>Context</summary>
                                        <pre>{item.contextSummary}</pre>
                                      </details>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          </section>
                          <section>
                            <h4>{t.invocationDetails}</h4>
                            {log.invocations.length === 0 ? (
                              <p className="binding-empty">-</p>
                            ) : (
                              <div className="conversation-log-invocations">
                                {log.invocations.map((item) => (
                                  <div
                                    className="conversation-log-invocation"
                                    key={item.id}
                                  >
                                    <div className="conversation-log-message-meta">
                                      <strong>
                                        {item.selectedAgentId || "-"}
                                      </strong>
                                      {item.createdAt && (
                                        <small>
                                          {new Date(
                                            item.createdAt,
                                          ).toLocaleString()}
                                        </small>
                                      )}
                                    </div>
                                    <div className="conversation-log-fields">
                                      <span>
                                        {t.route}:{" "}
                                        {item.requestedAgentId || "auto"}
                                      </span>
                                      <span>
                                        {t.confidence}:{" "}
                                        {item.confidence == null
                                          ? "-"
                                          : item.confidence.toFixed(2)}
                                      </span>
                                      <span>
                                        {t.duration}:{" "}
                                        {item.durationMs == null
                                          ? "-"
                                          : `${item.durationMs} ms`}
                                      </span>
                                      <span>
                                        {t.routeSource}:{" "}
                                        {item.routeSource || "-"}
                                      </span>
                                    </div>
                                    {item.routeReason && (
                                      <p>{item.routeReason}</p>
                                    )}
                                    {item.error && (
                                      <p className="error">{item.error}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </section>
                          <section>
                            <h4>{t.actionDetails}</h4>
                            {log.actions.length === 0 ? (
                              <p className="binding-empty">-</p>
                            ) : (
                              <div className="conversation-log-invocations">
                                {log.actions.map((item) => (
                                  <div
                                    className="conversation-log-invocation"
                                    key={item.actionId}
                                  >
                                    <div className="conversation-log-message-meta">
                                      <strong>{item.type || "-"}</strong>
                                      <span
                                        className={
                                          item.status === "COMPLETED"
                                            ? "ok"
                                            : item.status === "FAILED"
                                              ? "off"
                                              : "badge"
                                        }
                                      >
                                        {item.status === "COMPLETED"
                                          ? t.actionCompleted
                                          : item.status === "FAILED"
                                            ? t.actionFailed
                                            : t.actionPending}
                                      </span>
                                    </div>
                                    <code>{item.target || item.actionId}</code>
                                    {item.reason && <p>{item.reason}</p>}
                                    {item.result && <pre>{item.result}</pre>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </section>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === "router" && (
          <section>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t.routerPlaceholder}
            />
            <button onClick={testRoute}>{t.testRoute}</button>
            {route && <pre>{JSON.stringify(route, null, 2)}</pre>}
          </section>
        )}
      </main>

      {resourceDetails && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setResourceDetails(undefined);
          }}
        >
          <div
            className="modal resource-details-modal"
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <div>
                <h3>{resourceDetails.resource.name}</h3>
                <p className="modal-subtitle">{t.resourceDetails}</p>
              </div>
              <button
                className="icon-button"
                onClick={() => setResourceDetails(undefined)}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <div className="resource-detail-grid">
              <div>
                <span className="detail-label">ID</span>
                <code>{resourceDetails.resource.id}</code>
              </div>
              <div>
                <span className="detail-label">{t.enabled}</span>
                <span
                  className={resourceDetails.resource.enabled ? "ok" : "off"}
                >
                  {resourceDetails.resource.enabled ? t.enabled : t.disabled}
                </span>
              </div>
              {resourceDetails.kind === "tool" ? (
                <>
                  <div>
                    <span className="detail-label">{t.toolTypeLabel}</span>
                    <span>{resourceDetails.resource.type || "-"}</span>
                  </div>
                  <div>
                    <span className="detail-label">{t.method}</span>
                    <span>{resourceDetails.resource.method || "-"}</span>
                  </div>
                  <div className="detail-full">
                    <span className="detail-label">{t.endpoint}</span>
                    <code>{resourceDetails.resource.endpoint || "-"}</code>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span className="detail-label">{t.version}</span>
                    <span>{resourceDetails.resource.version || "-"}</span>
                  </div>
                  <div className="detail-full">
                    <span className="detail-label">{t.skillPrompt}</span>
                    <pre>{resourceDetails.resource.prompt || "-"}</pre>
                  </div>
                </>
              )}
              <div className="detail-full">
                <span className="detail-label">{t.descriptionOptional}</span>
                <p>{resourceDetails.resource.description || t.noDescription}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {agentDialogOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAgentDialog();
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-dialog-title"
          >
            <div className="modal-header">
              <div>
                <h3 id="agent-dialog-title">
                  {editingAgentId ? t.editAgentTitle : t.newAgentTitle}
                </h3>
                <p className="modal-subtitle">
                  {editingAgentId ? t.editAgentSubtitle : t.newAgentSubtitle}
                </p>
              </div>
              <button
                className="icon-button"
                onClick={closeAgentDialog}
                disabled={agentSubmitting}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <form onSubmit={saveAgent}>
              <label className="field">
                <span>{t.agentId}</span>
                <input
                  autoFocus
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                  placeholder={t.agentIdPlaceholder}
                  maxLength={128}
                  disabled={Boolean(editingAgentId)}
                />
                <small className="field-hint">{t.agentIdHint}</small>
              </label>
              <label className="field">
                <span>{t.displayName}</span>
                <input
                  value={agentDisplayName}
                  onChange={(event) => setAgentDisplayName(event.target.value)}
                  placeholder={t.displayNamePlaceholder}
                  maxLength={100}
                />
              </label>
              <label className="field">
                <span>{t.descriptionOptional}</span>
                <textarea
                  value={agentDescription}
                  onChange={(event) => setAgentDescription(event.target.value)}
                  placeholder={t.agentDescriptionPlaceholder}
                  rows={2}
                  maxLength={500}
                />
              </label>
              <label className="field">
                <span>{t.systemPrompt}</span>
                <textarea
                  value={agentSystemPrompt}
                  onChange={(event) => setAgentSystemPrompt(event.target.value)}
                  placeholder={t.systemPromptPlaceholder}
                  rows={4}
                  maxLength={8000}
                />
              </label>
              {editingAgentId && (
                <>
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
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={agentEnabled}
                      onChange={(event) =>
                        setAgentEnabled(event.target.checked)
                      }
                    />
                    <span>{t.enabled}</span>
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
                        onChange={(event) =>
                          setAgentTemperature(event.target.value)
                        }
                        placeholder="0.7"
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
                  <section className="binding-section">
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
                      <div className="binding-list">
                        {bases.map((base) => {
                          const selected = parseIds(
                            agentKnowledgeBaseIds,
                          ).includes(base.id);
                          return (
                            <label className="binding-option" key={base.id}>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => {
                                  const current = parseIds(
                                    agentKnowledgeBaseIds,
                                  );
                                  const next = selected
                                    ? current.filter((id) => id !== base.id)
                                    : [...current, base.id];
                                  setAgentKnowledgeBaseIds(
                                    JSON.stringify(next),
                                  );
                                }}
                              />
                              <span className="binding-copy">
                                <span className="binding-name">
                                  {base.name}
                                </span>
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
                  </section>

                  <section
                    className="binding-section"
                    aria-labelledby="tool-bindings-title"
                  >
                    <div className="binding-heading">
                      <div>
                        <h4 id="tool-bindings-title">{t.tools}</h4>
                        <p>{t.browserActions}</p>
                      </div>
                      <span className="binding-count">
                        {agentToolIds.length}
                      </span>
                    </div>
                    {tools.filter((tool) => tool.enabled).length === 0 ? (
                      <p className="binding-empty">{t.noTools}</p>
                    ) : (
                      <div className="binding-list">
                        {tools
                          .filter((tool) => tool.enabled)
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
                                      : (tool.type ?? t.toolType)}
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
                  </section>

                  <section
                    className="binding-section"
                    aria-labelledby="skill-bindings-title"
                  >
                    <div className="binding-heading">
                      <div>
                        <h4 id="skill-bindings-title">{t.skills}</h4>
                        <p>{t.idsHint}</p>
                      </div>
                      <span className="binding-count">
                        {agentSkillIds.length}
                      </span>
                    </div>
                    {skills.filter((skill) => skill.enabled).length === 0 ? (
                      <p className="binding-empty">{t.noSkills}</p>
                    ) : (
                      <div className="binding-list">
                        {skills
                          .filter((skill) => skill.enabled)
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
                  </section>
                </>
              )}
              {agentError && <p className="error">{agentError}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeAgentDialog}
                  disabled={agentSubmitting}
                >
                  {t.cancel}
                </button>
                <button type="submit" disabled={agentSubmitting}>
                  {agentSubmitting
                    ? t.saving
                    : editingAgentId
                      ? t.saveAgent
                      : t.createAgent}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resourceDialog && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeResourceDialog();
          }}
        >
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <h3>
                  {editingResourceId ? t.edit : t.createResource} ·{" "}
                  {resourceDialog === "tool" ? t.tool : t.skill}
                </h3>
                <p className="modal-subtitle">
                  {resourceDialog === "tool"
                    ? t.toolsSubtitle
                    : t.skillsSubtitle}
                </p>
              </div>
              <button
                className="icon-button"
                onClick={closeResourceDialog}
                disabled={resourceSubmitting}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <form onSubmit={saveResource}>
              <label className="field">
                <span>{t.toolName}</span>
                <input
                  autoFocus
                  value={resourceName}
                  onChange={(event) => setResourceName(event.target.value)}
                  maxLength={100}
                  required
                />
              </label>
              <label className="field">
                <span>{t.descriptionOptional}</span>
                <textarea
                  value={resourceDescription}
                  onChange={(event) =>
                    setResourceDescription(event.target.value)
                  }
                  placeholder={
                    resourceDialog === "tool"
                      ? t.toolDescriptionPlaceholder
                      : t.noDescription
                  }
                  rows={2}
                  maxLength={500}
                />
              </label>
              {resourceDialog === "tool" ? (
                <>
                  <div className="field-grid">
                    <label className="field">
                      <span>{t.toolTypeLabel}</span>
                      <select
                        value={resourceType}
                        onChange={(event) =>
                          setResourceType(event.target.value)
                        }
                      >
                        <option value="BROWSER_PROPOSAL">
                          {t.browserProposal}
                        </option>
                        <option value="HTTP">HTTP API</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>{t.method}</span>
                      <select
                        value={resourceMethod}
                        onChange={(event) =>
                          setResourceMethod(event.target.value)
                        }
                      >
                        {["GET", "POST", "PUT", "PATCH", "DELETE"].map(
                          (method) => (
                            <option key={method} value={method}>
                              {method}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  </div>
                  {resourceType === "HTTP" && (
                    <label className="field">
                      <span>{t.endpoint}</span>
                      <input
                        value={resourceEndpoint}
                        onChange={(event) =>
                          setResourceEndpoint(event.target.value)
                        }
                        placeholder={t.endpointPlaceholder}
                      />
                    </label>
                  )}
                </>
              ) : (
                <>
                  <label className="field">
                    <span>{t.skillPrompt}</span>
                    <textarea
                      value={resourcePrompt}
                      onChange={(event) =>
                        setResourcePrompt(event.target.value)
                      }
                      placeholder={t.skillPromptPlaceholder}
                      rows={5}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>{t.version}</span>
                    <input
                      value={resourceVersion}
                      onChange={(event) =>
                        setResourceVersion(event.target.value)
                      }
                      placeholder="1.0.0"
                    />
                  </label>
                </>
              )}
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={resourceEnabled}
                  onChange={(event) => setResourceEnabled(event.target.checked)}
                />
                <span>{t.enabled}</span>
              </label>
              {resourceError && <p className="error">{resourceError}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeResourceDialog}
                  disabled={resourceSubmitting}
                >
                  {t.cancel}
                </button>
                <button type="submit" disabled={resourceSubmitting}>
                  {resourceSubmitting
                    ? t.saving
                    : editingResourceId
                      ? t.saveResource
                      : t.createResource}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {agentTestDialogOpen && testingAgent && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAgentTest();
          }}
        >
          <div
            className="modal agent-test-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-test-dialog-title"
          >
            <div className="modal-header">
              <div>
                <h3 id="agent-test-dialog-title">
                  {t.testAgentTitle} · {testingAgent.displayName}
                </h3>
                <p className="modal-subtitle">{t.testAgentSubtitle}</p>
              </div>
              <button
                className="icon-button"
                onClick={closeAgentTest}
                disabled={agentTestSubmitting}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <form onSubmit={runAgentTest}>
              <label className="field">
                <span>{t.testMessage}</span>
                <textarea
                  autoFocus
                  value={agentTestMessage}
                  onChange={(event) => setAgentTestMessage(event.target.value)}
                  placeholder={t.testMessagePlaceholder}
                  rows={4}
                  required
                />
              </label>
              <label className="field">
                <span>{t.testPageContext}</span>
                <textarea
                  value={agentTestContext}
                  onChange={(event) => setAgentTestContext(event.target.value)}
                  placeholder={t.testPageContextPlaceholder}
                  rows={3}
                />
              </label>
              {agentTestError && <p className="error">{agentTestError}</p>}
              {agentTestResult && (
                <section className="test-result" aria-live="polite">
                  <div className="test-result-heading">{t.testResponse}</div>
                  <pre>{agentTestResult}</pre>
                </section>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeAgentTest}
                  disabled={agentTestSubmitting}
                >
                  {t.close}
                </button>
                <button
                  type="submit"
                  disabled={agentTestSubmitting || !agentTestMessage.trim()}
                >
                  {agentTestSubmitting ? t.testing : t.runTest}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {baseDialogOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeBaseDialog();
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="base-dialog-title"
          >
            <div className="modal-header">
              <div>
                <h3 id="base-dialog-title">{t.newBaseTitle}</h3>
                <p className="modal-subtitle">{t.newBaseSubtitle}</p>
              </div>
              <button
                className="icon-button"
                onClick={closeBaseDialog}
                disabled={baseSubmitting}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <form onSubmit={createBase}>
              <label className="field">
                <span>{t.baseName}</span>
                <input
                  autoFocus
                  value={baseName}
                  onChange={(event) => setBaseName(event.target.value)}
                  placeholder={t.baseNamePlaceholder}
                  maxLength={100}
                />
              </label>
              <label className="field">
                <span>{t.descriptionOptional}</span>
                <textarea
                  value={baseDescription}
                  onChange={(event) => setBaseDescription(event.target.value)}
                  placeholder={t.baseDescriptionPlaceholder}
                  rows={3}
                  maxLength={500}
                />
              </label>
              {baseError && <p className="error">{baseError}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeBaseDialog}
                  disabled={baseSubmitting}
                >
                  {t.cancel}
                </button>
                <button type="submit" disabled={baseSubmitting}>
                  {baseSubmitting ? t.creating : t.createBase}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
