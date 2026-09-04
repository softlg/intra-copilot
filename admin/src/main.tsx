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
    router: "路由测试",
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
    newAgentSubtitle: "配置一个可供主 Agent 调度的页面助手子 Agent。",
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
    createAgent: "创建 Agent",
    editAgentTitle: "Agent 设置",
    editAgentSubtitle: "调整 Agent 的能力、提示词和关联资源，保存后立即生效。",
    saveAgent: "保存设置",
    saving: "保存中…",
    model: "模型（可选）",
    modelPlaceholder: "留空使用系统默认模型",
    temperature: "温度（可选）",
    priority: "调度优先级",
    knowledgeBases: "关联知识库 ID（可选）",
    tools: "工具 / 插件绑定",
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
  },
  en: {
    title: "Page Assistant",
    subtitle: "Admin Console",
    agents: "Agents",
    knowledge: "Knowledge bases",
    router: "Router test",
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
      "Configure a page-assistant sub-agent for the main Agent to dispatch.",
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
    createAgent: "Create Agent",
    editAgentTitle: "Agent settings",
    editAgentSubtitle:
      "Tune capabilities, prompts, and resource links. Changes apply immediately.",
    saveAgent: "Save settings",
    saving: "Saving…",
    model: "Model (optional)",
    modelPlaceholder: "Leave empty to use the default model",
    temperature: "Temperature (optional)",
    priority: "Routing priority",
    knowledgeBases: "Knowledge base IDs (optional)",
    tools: "Tool / plugin bindings",
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
  enabled: boolean;
};

type SkillDefinition = {
  id: string;
  name: string;
  description?: string;
  version?: string;
  enabled: boolean;
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
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
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
  const [agentSubmitting, setAgentSubmitting] = useState(false);
  const [agentError, setAgentError] = useState("");
  const [agentActionId, setAgentActionId] = useState<string>();
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
    request<ToolDefinition[]>("/admin/tools")
      .then(setTools)
      .catch(() => setTools([]));
    request<SkillDefinition[]>("/admin/skills")
      .then(setSkills)
      .catch(() => setSkills([]));
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

  useEffect(() => {
    if (!baseDialogOpen && !agentDialogOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (baseDialogOpen && !baseSubmitting) {
        setBaseDialogOpen(false);
      }
      if (agentDialogOpen && !agentSubmitting) {
        setAgentDialogOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [agentDialogOpen, agentSubmitting, baseDialogOpen, baseSubmitting]);

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
    setAgentError("");
    setAgentDialogOpen(true);
  };

  const openAgentSettings = (agent: Agent) => {
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
    setAgentError("");
    setAgentDialogOpen(true);
  };

  const closeAgentDialog = () => {
    if (!agentSubmitting) setAgentDialogOpen(false);
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
      ["assistant", "diagnosis", "tms-manual"].includes(agent.id)
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
    ["assistant", "diagnosis", "tms-manual"].includes(agent.id);

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
          tmsAuthorized: false,
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
          ["router", "⌁"],
        ].map(([key, icon]) => {
          const labels: Record<string, string> = {
            agents: t.agents,
            knowledge: t.knowledge,
            router: t.router,
          };
          return (
            <button
              className={tab === key ? "nav active" : "nav"}
              onClick={() => setTab(key)}
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
              : tab === "knowledge"
                ? t.knowledge
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
                  onChange={(event) => setAgentEnabled(event.target.checked)}
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
              <label className="field">
                <span>{t.knowledgeBases}</span>
                <input
                  value={agentKnowledgeBaseIds}
                  onChange={(event) =>
                    setAgentKnowledgeBaseIds(event.target.value)
                  }
                  placeholder={t.idsHint}
                />
              </label>

              <section
                className="binding-section"
                aria-labelledby="tool-bindings-title"
              >
                <div className="binding-heading">
                  <div>
                    <h4 id="tool-bindings-title">{t.tools}</h4>
                    <p>{t.browserActions}</p>
                  </div>
                  <span className="binding-count">{agentToolIds.length}</span>
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
                              <span className="binding-name">{tool.name}</span>
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
                  <span className="binding-count">{agentSkillIds.length}</span>
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
                                    ? current.filter((id) => id !== skill.id)
                                    : [...current, skill.id],
                                )
                              }
                            />
                            <span className="binding-copy">
                              <span className="binding-name">{skill.name}</span>
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
                          </label>
                        );
                      })}
                  </div>
                )}
              </section>
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
