import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import "./components/Toast.css";
import "./components/ConfirmDialog.css";
import "./components/Tooltip.css";
import "./components/TruncatedId.css";
import "./components/FieldHint.css";
import "./components/Dropdown.css";
import "./components/StatusBadge.css";
import "./components/EmptyState.css";
import "./components/Sparkline.css";
import "./components/Icon.css";
import "./components/KeyboardShortcutsHelp.css";
import "./components/Skeleton.css";
import Pagination from "./components/Pagination";
import { ToastContainer, toast } from "./components/Toast";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Tooltip } from "./components/Tooltip";
import { TruncatedId } from "./components/TruncatedId";
import { FieldHint } from "./components/FieldHint";
import { Dropdown } from "./components/Dropdown";
import { StatusBadge, type StatusKind } from "./components/StatusBadge";
import { EmptyState } from "./components/EmptyState";
import { Sparkline, type SparklinePoint } from "./components/Sparkline";
import { Icon, type IconName } from "./components/Icon";
import {
  useKeyboardShortcuts,
  shortcutHint,
  isMac,
} from "./components/useKeyboardShortcuts";
import { KeyboardShortcutsHelp } from "./components/KeyboardShortcutsHelp";
import { Skeleton } from "./components/Skeleton";
import { InlineEditable } from "./components/InlineEditable";
import { LoginScreen } from "./components/LoginScreen";
import {
  translations,
  type Language,
  type Translations,
} from "./i18n/translations";
import type {
  Agent,
  AgentChildBinding,
  AgentConfigVersion,
  AgentFeedback,
  AgentPreset,
  Base,
  ConversationAttachment,
  ConversationLog,
  ConversationLogPage,
  ConversationLogSummary,
  DocumentChunk,
  EmbeddingConfig,
  EmbeddingConfigRequest,
  EmbeddingProfile,
  EmbeddingValidation,
  FeedbackSummary,
  HookDefinition,
  KnowledgeDiagnostics,
  KnowledgeDocument,
  McpInterface,
  McpServer,
  QASceneSettings,
  ResourceDetails,
  ResourceListUpdater,
  RetrievalResult,
  SkillDefinition,
  Theme,
  ToolDefinition,
} from "./types";
import { AGENT_PRESETS } from "./data/agentPresets";
import {
  apiFetch,
  clearAuthToken,
  fetchAdminIdentity,
  getAuthToken,
  request,
} from "./lib/api";
import { formatDateTime, parseIds } from "./lib/format";
import { mcpStatusLabel, truncateError } from "./lib/mcp";
import { documentStatus } from "./lib/knowledge";
import { buildDailyFeedbackTrend } from "./lib/feedback";
import { RatingsPage } from "./pages/RatingsPage";
import { ConversationLogsPage } from "./pages/ConversationLogsPage";
import { RouterPage } from "./pages/RouterPage";
import { HooksPage } from "./pages/HooksPage";
import { McpServersPage } from "./pages/McpServersPage";
import { ToolsPage } from "./pages/ToolsPage";
import { SkillsPage } from "./pages/SkillsPage";
import { AgentSettingsPage } from "./pages/AgentSettingsPage";
import { KnowledgePage } from "./pages/KnowledgePage";

type AgentConfigSnapshot = {
  id: string;
  displayName: string;
  description: string;
  systemPrompt: string;
  browserActions: boolean;
  enabled: boolean;
  priority: number;
  routingRules: string;
  role: string;
  parentAgentId: string;
  handlingMode: string;
  returnMode: string;
  model: string;
  temperature: string;
  knowledgeBaseIds: string;
  toolIds: string[];
  skillIds: string[];
  childIds: string[];
  childRules: Record<string, string>;
};

function normalizeIdList(ids: string[]) {
  return [...new Set(ids)].sort();
}

function serializeAgentConfig(snapshot: AgentConfigSnapshot) {
  return JSON.stringify({
    ...snapshot,
    knowledgeBaseIds: normalizeIdList(parseIds(snapshot.knowledgeBaseIds)),
    toolIds: normalizeIdList(snapshot.toolIds),
    skillIds: normalizeIdList(snapshot.skillIds),
    childIds: normalizeIdList(snapshot.childIds),
    childRules: Object.fromEntries(
      Object.entries(snapshot.childRules).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  });
}

function agentConfigSnapshot(
  agent: Agent,
  childIds: string[] = [],
  childRules: Record<string, string> = {},
): AgentConfigSnapshot {
  return {
    id: agent.id,
    displayName: agent.displayName,
    description: agent.description ?? "",
    systemPrompt: agent.systemPrompt ?? "",
    browserActions: Boolean(agent.supportsBrowserActions),
    enabled: agent.enabled,
    priority: agent.priority ?? 100,
    routingRules: agent.routingRules ?? "",
    role: agent.role ?? (agent.systemAgent ? "MAIN" : "DOMAIN"),
    parentAgentId: agent.parentAgentId ?? "",
    handlingMode: agent.handlingMode ?? "AUTO",
    returnMode: agent.returnMode ?? "CHILD_DIRECT",
    model: agent.model ?? "",
    temperature:
      agent.temperature === undefined || agent.temperature === null
        ? ""
        : String(agent.temperature),
    knowledgeBaseIds: agent.knowledgeBaseIds ?? "",
    toolIds: parseIds(agent.toolIds),
    skillIds: parseIds(agent.skillIds),
    childIds,
    childRules,
  };
}

function agentTabForRole(role: string) {
  if (role === "GENERAL") return "agents-general";
  if (role === "DOMAIN") return "agents-domain";
  if (role === "SUB") return "agents-sub";
  return "agents";
}

function AdminApp({
  username,
  onLogout,
}: {
  username: string;
  onLogout: () => void;
}) {
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [conversationLogs, setConversationLogs] = useState<
    ConversationLogSummary[]
  >([]);
  const [conversationTotal, setConversationTotal] = useState(0);
  const [conversationPage, setConversationPage] = useState(1);
  const [conversationPageSize, setConversationPageSize] = useState(10);
  const [conversationSessionId, setConversationSessionId] = useState("");
  const [conversationSessionIdDraft, setConversationSessionIdDraft] =
    useState("");
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationDetail, setConversationDetail] =
    useState<ConversationLog>();
  const [conversationDetailOpen, setConversationDetailOpen] = useState(false);
  const [conversationDetailLoading, setConversationDetailLoading] =
    useState(false);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpServersLoading, setMcpServersLoading] = useState(true);
  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);
  const [editingMcpId, setEditingMcpId] = useState<string>();
  const [mcpName, setMcpName] = useState("");
  const [mcpDescription, setMcpDescription] = useState("");
  const [mcpServerUrl, setMcpServerUrl] = useState("");
  const [mcpTransport, setMcpTransport] = useState("STREAMABLE_HTTP");
  const [mcpAuthEnv, setMcpAuthEnv] = useState("");
  const [mcpEnabled, setMcpEnabled] = useState(true);
  const [mcpSubmitting, setMcpSubmitting] = useState(false);
  const [mcpActionId, setMcpActionId] = useState<string>();
  const [mcpDetails, setMcpDetails] = useState<McpServer>();
  const [mcpErrorDetail, setMcpErrorDetail] = useState<McpServer | null>(null);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [hooks, setHooks] = useState<HookDefinition[]>([]);
  const [hooksLoading, setHooksLoading] = useState(true);
  const [feedback, setFeedback] = useState<AgentFeedback[]>([]);
  const [feedbackSummary, setFeedbackSummary] = useState<FeedbackSummary>();
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
  const [confirmRequest, setConfirmRequest] = useState<{
    title: string;
    description: React.ReactNode;
    confirmLabel: string;
    cancelLabel: string;
    tone: "danger" | "primary";
    loading: boolean;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const closeConfirm = () => setConfirmRequest(null);
  const runConfirm = async () => {
    if (!confirmRequest) return;
    setConfirmRequest((prev) => (prev ? { ...prev, loading: true } : prev));
    try {
      await confirmRequest.onConfirm();
      setConfirmRequest(null);
    } finally {
      setConfirmRequest((prev) => (prev ? { ...prev, loading: false } : prev));
    }
  };
  const askConfirm = (options: {
    title: string;
    description?: React.ReactNode;
    confirmLabel: string;
    cancelLabel: string;
    tone?: "danger" | "primary";
    onConfirm: () => void | Promise<void>;
  }) => {
    setConfirmRequest({
      title: options.title,
      description: options.description,
      confirmLabel: options.confirmLabel,
      cancelLabel: options.cancelLabel,
      tone: options.tone ?? "primary",
      loading: false,
      onConfirm: options.onConfirm,
    });
  };
  const [hookDialogOpen, setHookDialogOpen] = useState(false);
  const [editingHookId, setEditingHookId] = useState<string>();
  const [hookName, setHookName] = useState("");
  const [hookDescription, setHookDescription] = useState("");
  const [hookRuleType, setHookRuleType] = useState("REQUIRE_PERMISSION");
  const [hookRuleConfig, setHookRuleConfig] = useState(
    '{"permission":"readPage"}',
  );
  const [hookFailureMessage, setHookFailureMessage] = useState("");
  const [hookPriority, setHookPriority] = useState(100);
  const [hookEnabled, setHookEnabled] = useState(true);
  const [hookSubmitting, setHookSubmitting] = useState(false);
  const [hookActionId, setHookActionId] = useState<string>();
  const [bases, setBases] = useState<Base[]>([]);
  const [basesLoading, setBasesLoading] = useState(true);
  const [documents, setDocuments] = useState<
    Record<string, KnowledgeDocument[]>
  >({});
  const [uploadingBaseId, setUploadingBaseId] = useState<string>();
  const [uploadError, setUploadError] = useState("");
  const [documentActionId, setDocumentActionId] = useState<string>();
  const [selectedDocument, setSelectedDocument] = useState<KnowledgeDocument>();
  const [documentChunks, setDocumentChunks] = useState<DocumentChunk[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [retrievalQuery, setRetrievalQuery] = useState("");
  const [retrievalResults, setRetrievalResults] = useState<RetrievalResult[]>(
    [],
  );
  const [retrievalLoading, setRetrievalLoading] = useState(false);
  const [retrievalError, setRetrievalError] = useState("");
  const [activeBaseId, setActiveBaseId] = useState<string>();
  const [editingBase, setEditingBase] = useState(false);
  const [baseDraftName, setBaseDraftName] = useState("");
  const [baseDraftDescription, setBaseDraftDescription] = useState("");
  const [baseSaving, setBaseSaving] = useState(false);
  const [knowledgeSection, setKnowledgeSection] = useState<
    "basic" | "maintenance" | "qa" | "retrieval"
  >("basic");
  const [qaSettings, setQaSettings] = useState<Record<string, QASceneSettings>>(
    {},
  );
  const [qaSaved, setQaSaved] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    current: 0,
    total: 0,
  });
  const [tab, setTab] = useState("agents");
  const [agentMenuOpen, setAgentMenuOpen] = useState(
    () => localStorage.getItem("admin-agent-menu-open") !== "false",
  );
  const [agentReturnTab, setAgentReturnTab] = useState("agents");
  const [resourceStatus, setResourceStatus] = useState<
    "all" | "enabled" | "disabled"
  >("all");
  const [knowledgeStatus, setKnowledgeStatus] = useState<
    "all" | "enabled" | "disabled"
  >("all");
  const [message, setMessage] = useState("");
  const [routePageContext, setRoutePageContext] = useState("");
  const [routeAttachments, setRouteAttachments] = useState<
    ConversationAttachment[]
  >([]);
  const [routeUploading, setRouteUploading] = useState(false);
  const [routeReadPage, setRouteReadPage] = useState(true);
  const [route, setRoute] = useState<Record<string, unknown>>();
  const [routeAnalysis, setRouteAnalysis] = useState("");
  const [routeAnalyzing, setRouteAnalyzing] = useState(false);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string>();
  const [agentConfigId, setAgentConfigId] = useState<string>();
  const [agentConfigSection, setAgentConfigSection] = useState<
    | "basic"
    | "routing"
    | "strategy"
    | "children"
    | "knowledge"
    | "tools"
    | "skills"
    | "versions"
  >("basic");
  const [agentId, setAgentId] = useState("custom-agent");
  const [agentDisplayName, setAgentDisplayName] = useState("领域 Agent");
  const [agentDescription, setAgentDescription] = useState("");
  const [agentSystemPrompt, setAgentSystemPrompt] =
    useState("你是一个页面助手领域 Agent。");
  const [agentBrowserActions, setAgentBrowserActions] = useState(false);
  const [agentEnabled, setAgentEnabled] = useState(true);
  const [agentPriority, setAgentPriority] = useState(100);
  const [agentRoutingRules, setAgentRoutingRules] = useState("");
  const [agentRole, setAgentRole] = useState("DOMAIN");
  const [agentParentId, setAgentParentId] = useState("");
  const [agentHandlingMode, setAgentHandlingMode] = useState("AUTO");
  const [agentReturnMode, setAgentReturnMode] = useState("CHILD_DIRECT");
  const [agentChildIds, setAgentChildIds] = useState<string[]>([]);
  const [agentChildRules, setAgentChildRules] = useState<
    Record<string, string>
  >({});
  const [agentChildSearch, setAgentChildSearch] = useState("");
  const [agentVersions, setAgentVersions] = useState<AgentConfigVersion[]>([]);
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
  const [embeddingProfiles, setEmbeddingProfiles] = useState<
    EmbeddingProfile[]
  >([]);
  const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfig>();
  const [embeddingValidation, setEmbeddingValidation] =
    useState<EmbeddingValidation>();
  const [embeddingSaving, setEmbeddingSaving] = useState(false);
  const [knowledgeDiagnostics, setKnowledgeDiagnostics] =
    useState<KnowledgeDiagnostics>();
  const t = translations[language];

  const normalizedName = (value: string) => value.trim().toLocaleLowerCase();

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

  useKeyboardShortcuts({
    bindings: [
      {
        key: "/",
        modifiers: ["shift"],
        description: "打开键盘快捷键帮助",
        handler: () => setShortcutsOpen(true),
      },
    ],
  });

  useEffect(() => {
    localStorage.setItem("admin-agent-menu-open", String(agentMenuOpen));
  }, [agentMenuOpen]);

  useEffect(() => {
    if (
      ["agents-general", "agents-domain", "agents-sub"].includes(tab) &&
      !agentMenuOpen
    ) {
      setAgentMenuOpen(true);
    }
  }, [tab]);

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

  const loadAgents = async () => {
    setAgentsLoading(true);
    try {
      const list = await request<Agent[]>("/admin/agents");
      setAgents(list);
      return list;
    } catch {
      setAgents([]);
      return [];
    } finally {
      setAgentsLoading(false);
    }
  };

  const loadConversationLogs = () => {
    setConversationLoading(true);
    const params = new URLSearchParams({
      page: String(conversationPage),
      size: String(conversationPageSize),
    });
    if (conversationSessionId.trim()) {
      params.set("sessionId", conversationSessionId.trim());
    }
    request<ConversationLogPage>(
      `/admin/conversation-logs?${params.toString()}`,
    )
      .then((data) => {
        setConversationLogs(data.items);
        setConversationTotal(data.total);
        // 过滤或翻页后当前页可能超出范围，回退到最后一页
        if (data.items.length === 0 && data.total > 0 && data.page > 1) {
          setConversationPage(Math.max(1, Math.ceil(data.total / data.size)));
        }
      })
      .catch(() => {
        setConversationLogs([]);
        setConversationTotal(0);
      })
      .finally(() => setConversationLoading(false));
  };

  const openConversationDetail = (id: string) => {
    setConversationDetail(undefined);
    setConversationDetailOpen(true);
    setConversationDetailLoading(true);
    request<ConversationLog>(`/admin/conversation-logs/${id}`)
      .then(setConversationDetail)
      .catch(() => setConversationDetail(undefined))
      .finally(() => setConversationDetailLoading(false));
  };

  const loadTools = () => {
    setToolsLoading(true);
    request<ToolDefinition[]>("/admin/tools")
      .then(setTools)
      .catch(() => setTools([]))
      .finally(() => setToolsLoading(false));
  };

  const loadMcpServers = () => {
    setMcpServersLoading(true);
    request<McpServer[]>("/admin/mcp-servers")
      .then(setMcpServers)
      .catch(() => setMcpServers([]))
      .finally(() => setMcpServersLoading(false));
  };

  const loadSkills = () => {
    setSkillsLoading(true);
    request<SkillDefinition[]>("/admin/skills")
      .then(setSkills)
      .catch(() => setSkills([]))
      .finally(() => setSkillsLoading(false));
  };

  const loadHooks = () => {
    setHooksLoading(true);
    request<HookDefinition[]>("/admin/hooks")
      .then(setHooks)
      .catch(() => setHooks([]))
      .finally(() => setHooksLoading(false));
  };

  const loadFeedback = () => {
    request<AgentFeedback[]>("/admin/agent-feedback")
      .then(setFeedback)
      .catch(() => setFeedback([]));
    request<FeedbackSummary>("/admin/agent-feedback/summary")
      .then(setFeedbackSummary)
      .catch(() => setFeedbackSummary(undefined));
  };

  const loadBases = () => {
    setBasesLoading(true);
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
      })
      .finally(() => setBasesLoading(false));
    request<EmbeddingProfile[]>("/admin/embedding-profiles")
      .then(setEmbeddingProfiles)
      .catch(() => setEmbeddingProfiles([]));
  };

  // 记录已按需加载过的资源，避免进入页面时重复请求
  const loadedResources = useRef<Set<string>>(new Set());
  const [agentConfigBaseline, setAgentConfigBaseline] =
    useState<AgentConfigSnapshot>();
  const agentSettingsRequestId = useRef(0);
  const ensureResourceLoaded = (key: string, loader: () => void) => {
    if (loadedResources.current.has(key)) return;
    loadedResources.current.add(key);
    loader();
  };

  // 根据当前 tab 按需加载对应资源，默认进入 agents 页面只请求 agents
  useEffect(() => {
    const agentTabs = [
      "agents",
      "agents-general",
      "agents-domain",
      "agents-sub",
    ];
    if (agentTabs.includes(tab)) {
      ensureResourceLoaded("agents", loadAgents);
    } else if (tab === "agent-settings") {
      // Agent 配置页的 knowledge/tools/skills 绑定区需要对应列表数据
      ensureResourceLoaded("agents", loadAgents);
      ensureResourceLoaded("bases", loadBases);
      ensureResourceLoaded("tools", loadTools);
      ensureResourceLoaded("skills", loadSkills);
    } else if (tab === "knowledge") {
      ensureResourceLoaded("bases", loadBases);
    } else if (tab === "mcp-servers") {
      ensureResourceLoaded("mcp-servers", loadMcpServers);
    } else if (tab === "tools") {
      ensureResourceLoaded("tools", loadTools);
    } else if (tab === "skills") {
      ensureResourceLoaded("skills", loadSkills);
    } else if (tab === "hooks") {
      ensureResourceLoaded("hooks", loadHooks);
    } else if (tab === "ratings") {
      ensureResourceLoaded("feedback", loadFeedback);
    }
  }, [tab]);

  // 对话日志：进入页面或翻页/改每页条数/切换过滤条件时重新拉取
  useEffect(() => {
    if (tab !== "conversation-logs") return;
    loadConversationLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, conversationPage, conversationPageSize, conversationSessionId]);

  useEffect(() => {
    if (!activeBaseId) {
      setEmbeddingConfig(undefined);
      return;
    }
    request<EmbeddingConfig>(
      `/admin/knowledge-bases/${activeBaseId}/embedding-config`,
    )
      .then(setEmbeddingConfig)
      .catch(() => setEmbeddingConfig(undefined));
  }, [activeBaseId]);

  const openMcpDialog = (server?: McpServer) => {
    setEditingMcpId(server?.id);
    setMcpName(server?.name ?? "");
    setMcpDescription(server?.description ?? "");
    setMcpServerUrl(server?.serverUrl ?? "");
    setMcpTransport(server?.transport ?? "STREAMABLE_HTTP");
    setMcpAuthEnv(server?.authEnv ?? "");
    setMcpEnabled(server?.enabled ?? true);
    setResourceError("");
    setMcpDialogOpen(true);
  };

  const closeMcpDialog = () => {
    if (!mcpSubmitting) setMcpDialogOpen(false);
  };

  const saveMcpServer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = mcpName.trim();
    const url = mcpServerUrl.trim();
    if (!name) return setResourceError(t.resourceNameRequired);
    if (!url) return setResourceError(t.mcpServerRequired);
    if (
      mcpServers.some(
        (item) =>
          item.id !== editingMcpId &&
          normalizedName(item.name) === normalizedName(name),
      )
    ) {
      return setResourceError(t.nameExists);
    }
    setMcpSubmitting(true);
    setResourceError("");
    try {
      const path = editingMcpId
        ? `/admin/mcp-servers/${editingMcpId}`
        : "/admin/mcp-servers";
      await request(path, {
        method: editingMcpId ? "PUT" : "POST",
        body: JSON.stringify({
          id: editingMcpId,
          name,
          description: mcpDescription.trim(),
          serverUrl: url,
          transport: mcpTransport,
          authEnv: mcpAuthEnv.trim() || null,
          enabled: mcpEnabled,
        }),
      });
      setMcpDialogOpen(false);
      loadMcpServers();
    } catch (error) {
      setResourceError(
        error instanceof Error ? error.message : t.mcpSaveFailed,
      );
    } finally {
      setMcpSubmitting(false);
    }
  };

  const checkMcpHealth = async (server: McpServer) => {
    setMcpActionId(server.id);
    try {
      const updated = await request<McpServer>(
        `/admin/mcp-servers/${server.id}/health`,
        { method: "POST" },
      );
      setMcpServers((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (mcpDetails?.id === updated.id) setMcpDetails(updated);
    } catch (error) {
      setResourceError(
        error instanceof Error ? error.message : t.mcpCheckFailed,
      );
    } finally {
      setMcpActionId(undefined);
    }
  };

  const deleteMcpServer = async (server: McpServer) => {
    if (server.enabled) {
      toast.warning(t.deleteDisabledEnabled);
      return;
    }
    const snapshot = { ...server };
    askConfirm({
      title: t.confirmDeleteTitle,
      description: t.mcpDeleteConfirm(server.name),
      confirmLabel: t.deleteResource,
      cancelLabel: t.cancelLabel,
      tone: "danger",
      onConfirm: async () => {
        setMcpServers((items) => items.filter((item) => item.id !== server.id));
        if (mcpDetails?.id === server.id) setMcpDetails(undefined);
        try {
          await request(`/admin/mcp-servers/${server.id}`, {
            method: "DELETE",
          });
          toast.success(t.mcpDeleted(server.name), {
            duration: 5000,
            action: {
              label: t.undo,
              onAction: async () => {
                try {
                  const restored = await request<McpServer>(
                    "/admin/mcp-servers",
                    { method: "POST", body: JSON.stringify(snapshot) },
                  );
                  setMcpServers((items) => [restored, ...items]);
                  toast.success(t.restored);
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : t.restoreFailed,
                  );
                  loadMcpServers();
                }
              },
            },
          });
        } catch (error) {
          // 删除失败：把卡片加回来
          setMcpServers((items) => [snapshot, ...items]);
          toast.error(
            error instanceof Error ? error.message : t.resourceDeleteFailed,
          );
          throw error;
        } finally {
          setMcpActionId(undefined);
        }
      },
    });
  };

  const toggleMcpServer = async (server: McpServer) => {
    const original = server.enabled;
    setMcpServers((items) =>
      items.map((item) =>
        item.id === server.id ? { ...item, enabled: !original } : item,
      ),
    );
    setMcpActionId(server.id);
    try {
      const updated = await request<McpServer>(
        `/admin/mcp-servers/${server.id}`,
        {
          method: "PUT",
          body: JSON.stringify({ ...server, enabled: !original }),
        },
      );
      setMcpServers((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (error) {
      // 乐观更新回滚
      setMcpServers((items) =>
        items.map((item) =>
          item.id === server.id ? { ...item, enabled: original } : item,
        ),
      );
      toast.error(error instanceof Error ? error.message : t.mcpSaveFailed);
    } finally {
      setMcpActionId(undefined);
    }
  };

  const parseMcpInterfaces = (server: McpServer): McpInterface[] => {
    try {
      const parsed = JSON.parse(server.interfacesJson ?? "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const copyMcpError = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t.copied);
    } catch {
      toast.error(t.copyFailed);
    }
  };

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
    if (!resourceDescription.trim()) {
      setResourceError(t.descriptionRequired);
      return;
    }
    const resourceNames =
      resourceDialog === "tool"
        ? tools.map((item) => ({ id: item.id, name: item.name }))
        : skills.map((item) => ({ id: item.id, name: item.name }));
    if (
      resourceNames.some(
        (item) =>
          item.id !== editingResourceId &&
          normalizedName(item.name) === normalizedName(name),
      )
    ) {
      setResourceError(t.nameExists);
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
      if (resourceDialog === "tool") loadTools();
      else loadSkills();
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
    const original = resource.enabled;
    if (kind === "tool") {
      setTools((items) =>
        items.map((item) =>
          item.id === resource.id ? { ...item, enabled: !original } : item,
        ),
      );
    } else {
      setSkills((items) =>
        items.map((item) =>
          item.id === resource.id ? { ...item, enabled: !original } : item,
        ),
      );
    }
    setResourceActionId(resource.id);
    try {
      await request(
        `/admin/${kind === "tool" ? "tools" : "skills"}/${resource.id}`,
        {
          method: "PUT",
          body: JSON.stringify({ ...resource, enabled: !original }),
        },
      );
      if (kind === "tool") loadTools();
      else loadSkills();
    } catch (error) {
      // 乐观更新回滚
      if (kind === "tool") {
        setTools((items) =>
          items.map((item) =>
            item.id === resource.id ? { ...item, enabled: original } : item,
          ),
        );
      } else {
        setSkills((items) =>
          items.map((item) =>
            item.id === resource.id ? { ...item, enabled: original } : item,
          ),
        );
      }
      toast.error(
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
    if (resource.enabled) {
      toast.warning(t.deleteDisabledEnabled);
      return;
    }
    const snapshot = { ...resource };
    const path = `/admin/${kind === "tool" ? "tools" : "skills"}`;
    // `setTools` and `setSkills` have incompatible state types, so a bare
    // union of the two setters loses its parameter type. Wrap them in one
    // function that works on the shared resource shape instead.
    const setter = (update: ResourceListUpdater) => {
      if (kind === "tool") {
        setTools((items) => update(items) as ToolDefinition[]);
      } else {
        setSkills((items) => update(items) as SkillDefinition[]);
      }
    };
    const reload = kind === "tool" ? loadTools : loadSkills;
    const deletedLabel = kind === "tool" ? t.toolDeleted : t.skillDeleted;
    askConfirm({
      title: t.confirmDeleteTitle,
      description: t.deleteResourceConfirm(resource.name),
      confirmLabel: t.deleteResource,
      cancelLabel: t.cancelLabel,
      tone: "danger",
      onConfirm: async () => {
        setter((items) => items.filter((item) => item.id !== resource.id));
        try {
          await request(`${path}/${resource.id}`, { method: "DELETE" });
          toast.success(deletedLabel(resource.name), {
            duration: 5000,
            action: {
              label: t.undo,
              onAction: async () => {
                try {
                  const restored = await request<
                    ToolDefinition | SkillDefinition
                  >(path, { method: "POST", body: JSON.stringify(snapshot) });
                  setter((items) => [restored, ...items]);
                  toast.success(t.restored);
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : t.restoreFailed,
                  );
                  reload();
                }
              },
            },
          });
        } catch (error) {
          // 删除失败：把卡片加回来
          setter((items) => [snapshot, ...items]);
          toast.error(
            error instanceof Error ? error.message : t.resourceDeleteFailed,
          );
          throw error;
        } finally {
          setResourceActionId(undefined);
        }
      },
    });
  };

  const openHookDialog = (hook?: HookDefinition) => {
    setEditingHookId(hook?.id);
    setHookName(hook?.name ?? "");
    setHookDescription(hook?.description ?? "");
    setHookRuleType(hook?.ruleType ?? "REQUIRE_PERMISSION");
    setHookRuleConfig(hook?.ruleConfig ?? '{"permission":"readPage"}');
    setHookFailureMessage(hook?.failureMessage ?? "");
    setHookPriority(hook?.priority ?? 100);
    setHookEnabled(hook?.enabled ?? true);
    setHookDialogOpen(true);
  };

  const saveHook = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hookName.trim()) return setResourceError(t.hookNameRequired);
    if (!hookDescription.trim()) return setResourceError(t.descriptionRequired);
    try {
      JSON.parse(hookRuleConfig || "{}");
    } catch {
      return setResourceError(t.hookRuleConfig);
    }
    setHookSubmitting(true);
    setResourceError("");
    try {
      const payload = {
        id: editingHookId,
        name: hookName.trim(),
        description: hookDescription.trim(),
        phase: "PRE_AGENT",
        ruleType: hookRuleType,
        ruleConfig: hookRuleConfig.trim() || "{}",
        failureMessage: hookFailureMessage.trim(),
        priority: Math.max(0, Math.min(10000, Number(hookPriority) || 0)),
        enabled: hookEnabled,
      };
      const saved = await request<HookDefinition>(
        editingHookId ? `/admin/hooks/${editingHookId}` : "/admin/hooks",
        {
          method: editingHookId ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
      );
      setHooks((current) =>
        editingHookId
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...current],
      );
      setHookDialogOpen(false);
    } catch (error) {
      setResourceError(
        error instanceof Error ? error.message : t.hookSaveFailed,
      );
    } finally {
      setHookSubmitting(false);
    }
  };

  const toggleHook = async (hook: HookDefinition) => {
    const original = hook.enabled;
    setHooks((current) =>
      current.map((item) =>
        item.id === hook.id ? { ...item, enabled: !original } : item,
      ),
    );
    setHookActionId(hook.id);
    try {
      const updated = await request<HookDefinition>(`/admin/hooks/${hook.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...hook, enabled: !original }),
      });
      setHooks((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (error) {
      // 乐观更新回滚
      setHooks((current) =>
        current.map((item) =>
          item.id === hook.id ? { ...item, enabled: original } : item,
        ),
      );
      toast.error(error instanceof Error ? error.message : t.hookSaveFailed);
    } finally {
      setHookActionId(undefined);
    }
  };

  const deleteHook = async (hook: HookDefinition) => {
    if (hook.enabled) {
      toast.warning(t.deleteDisabledEnabled);
      return;
    }
    const snapshot = { ...hook };
    askConfirm({
      title: t.confirmDeleteTitle,
      description: t.hookDeleteConfirm(hook.name),
      confirmLabel: t.deleteResource,
      cancelLabel: t.cancelLabel,
      tone: "danger",
      onConfirm: async () => {
        setHooks((current) => current.filter((item) => item.id !== hook.id));
        try {
          await request(`/admin/hooks/${hook.id}`, { method: "DELETE" });
          toast.success(t.hookDeleted(hook.name), {
            duration: 5000,
            action: {
              label: t.undo,
              onAction: async () => {
                try {
                  const restored = await request<HookDefinition>(
                    "/admin/hooks",
                    { method: "POST", body: JSON.stringify(snapshot) },
                  );
                  setHooks((current) => [restored, ...current]);
                  toast.success(t.restored);
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : t.restoreFailed,
                  );
                  loadHooks();
                }
              },
            },
          });
        } catch (error) {
          setHooks((current) => [snapshot, ...current]);
          toast.error(
            error instanceof Error ? error.message : t.hookDeleteFailed,
          );
          throw error;
        } finally {
          setHookActionId(undefined);
        }
      },
    });
  };

  useEffect(() => {
    if (
      !baseDialogOpen &&
      !agentDialogOpen &&
      !agentTestDialogOpen &&
      !resourceDialog &&
      !hookDialogOpen &&
      !mcpDialogOpen &&
      !settingsOpen &&
      !shortcutsOpen &&
      !mcpErrorDetail &&
      !confirmRequest
    )
      return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (shortcutsOpen) {
        setShortcutsOpen(false);
        return;
      }
      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      if (confirmRequest) {
        setConfirmRequest(null);
        return;
      }
      if (mcpErrorDetail) {
        setMcpErrorDetail(null);
        return;
      }
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
      if (hookDialogOpen && !hookSubmitting) {
        setHookDialogOpen(false);
      }
      if (mcpDialogOpen && !mcpSubmitting) {
        setMcpDialogOpen(false);
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
    hookDialogOpen,
    hookSubmitting,
    mcpDialogOpen,
    mcpSubmitting,
    confirmRequest,
    mcpErrorDetail,
    settingsOpen,
    shortcutsOpen,
  ]);

  const activeBase = bases.find((base) => base.id === activeBaseId);
  const activeQaSettings: QASceneSettings = activeBaseId
    ? (qaSettings[activeBaseId] ?? { prompt: "", topK: 5 })
    : { prompt: "", topK: 5 };

  const openKnowledgeBase = (base: Base) => {
    setActiveBaseId(base.id);
    setEditingBase(false);
    setBaseDraftName(base.name);
    setBaseDraftDescription(base.description ?? "");
    setKnowledgeSection("basic");
    setUploadError("");
    setQaSaved(false);
  };

  const closeKnowledgeBase = () => {
    setActiveBaseId(undefined);
    setEditingBase(false);
    setSelectedDocument(undefined);
    setDocumentChunks([]);
    setRetrievalResults([]);
    setRetrievalQuery("");
    setRetrievalError("");
    setUploadError("");
  };

  const beginBaseEdit = () => {
    if (!activeBase) return;
    setBaseDraftName(activeBase.name);
    setBaseDraftDescription(activeBase.description ?? "");
    setEditingBase(true);
  };

  const cancelBaseEdit = () => setEditingBase(false);

  const saveBaseDetails = async (): Promise<boolean> => {
    if (!activeBase || !baseDraftName.trim()) {
      setBaseError(t.baseNameRequired);
      return false;
    }
    setBaseSaving(true);
    setBaseError("");
    try {
      const updated = await request<Base>(
        `/admin/knowledge-bases/${activeBase.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            id: activeBase.id,
            name: baseDraftName.trim(),
            description: baseDraftDescription.trim(),
            enabled: activeBase.enabled,
          }),
        },
      );
      setBases((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      setEditingBase(false);
      return true;
    } catch (error) {
      setBaseError(error instanceof Error ? error.message : t.createBaseFailed);
      return false;
    } finally {
      setBaseSaving(false);
    }
  };

  const saveBaseField = async (
    field: "name" | "description",
    value: string,
  ): Promise<string> => {
    if (!activeBase) throw new Error(t.baseSaveFailed);
    const nextName = field === "name" ? value : activeBase.name;
    const nextDescription =
      field === "description" ? value : (activeBase.description ?? "");
    if (field === "name" && !nextName.trim()) {
      throw new Error(t.baseNameRequired);
    }
    const updated = await request<Base>(
      `/admin/knowledge-bases/${activeBase.id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          id: activeBase.id,
          name: nextName.trim(),
          description: nextDescription.trim(),
          enabled: activeBase.enabled,
        }),
      },
    );
    setBases((items) =>
      items.map((item) => (item.id === updated.id ? updated : item)),
    );
    setBaseDraftName(updated.name);
    setBaseDraftDescription(updated.description ?? "");
    return field === "name" ? updated.name : (updated.description ?? "");
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

  const saveKnowledgeSettings = async () => {
    if (editingBase && !(await saveBaseDetails())) return;
    saveQaSettings();
  };

  const saveEmbeddingConfig = async (config: EmbeddingConfigRequest) => {
    if (!activeBaseId) return;
    setEmbeddingSaving(true);
    setUploadError("");
    try {
      const savedConfig = await request<EmbeddingConfig>(
        `/admin/knowledge-bases/${activeBaseId}/embedding-config`,
        {
          method: "PUT",
          body: JSON.stringify(config),
        },
      );
      setEmbeddingConfig(savedConfig);
      setEmbeddingValidation(undefined);
      setBases((items) =>
        items.map((item) =>
          item.id === activeBaseId
            ? {
                ...item,
                useSystemEmbedding: config.useSystemEmbedding ?? false,
                embeddingProfileId: config.profileId || undefined,
                embeddingProvider: config.provider || undefined,
                embeddingModel: config.model || undefined,
                embeddingDimension: config.dimension,
              }
            : item,
        ),
      );
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Embedding 配置保存失败",
      );
    } finally {
      setEmbeddingSaving(false);
    }
  };

  const validateEmbeddingConfig = async () => {
    if (!activeBaseId) return;
    setEmbeddingSaving(true);
    setUploadError("");
    try {
      setEmbeddingValidation(
        await request<EmbeddingValidation>(
          `/admin/knowledge-bases/${activeBaseId}/embedding-config/validate`,
          { method: "POST" },
        ),
      );
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Embedding 配置检测失败",
      );
    } finally {
      setEmbeddingSaving(false);
    }
  };

  const runKnowledgeDiagnostics = async () => {
    if (!activeBaseId) return;
    setEmbeddingSaving(true);
    try {
      setKnowledgeDiagnostics(
        await request<KnowledgeDiagnostics>(
          `/admin/knowledge-bases/${activeBaseId}/diagnostics`,
        ),
      );
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "知识库诊断失败");
    } finally {
      setEmbeddingSaving(false);
    }
  };

  const addAgent = (role = "DOMAIN") => {
    const preset =
      AGENT_PRESETS[language][role] ?? AGENT_PRESETS[language].DOMAIN;
    setAgentConfigId(undefined);
    setEditingAgentId(undefined);
    setAgentId(preset.id);
    setAgentDisplayName(preset.displayName);
    setAgentDescription("");
    setAgentSystemPrompt(preset.systemPrompt);
    setAgentBrowserActions(false);
    setAgentEnabled(true);
    setAgentPriority(100);
    setAgentRoutingRules("");
    setAgentRole(role);
    setAgentParentId(
      role === "SUB"
        ? (agents.find((item) => item.role === "DOMAIN" && item.enabled)?.id ??
            "")
        : "",
    );
    setAgentHandlingMode("AUTO");
    setAgentReturnMode("CHILD_DIRECT");
    setAgentChildIds([]);
    setAgentChildRules({});
    setAgentChildSearch("");
    setAgentVersions([]);
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

  const populateAgentConfig = (
    agent: Agent,
    requestId: number,
    resetSearch: boolean,
  ) => {
    setAgentConfigId(agent.id);
    setEditingAgentId(agent.id);
    setAgentId(agent.id);
    setAgentDisplayName(agent.displayName);
    setAgentDescription(agent.description ?? "");
    setAgentSystemPrompt(agent.systemPrompt ?? "");
    setAgentBrowserActions(Boolean(agent.supportsBrowserActions));
    setAgentEnabled(agent.enabled);
    setAgentPriority(agent.priority ?? 100);
    setAgentRoutingRules(agent.routingRules ?? "");
    setAgentRole(agent.role ?? (agent.systemAgent ? "MAIN" : "DOMAIN"));
    setAgentParentId(agent.parentAgentId ?? "");
    setAgentHandlingMode(agent.handlingMode ?? "AUTO");
    setAgentReturnMode(agent.returnMode ?? "CHILD_DIRECT");
    setAgentChildIds([]);
    setAgentChildRules({});
    setAgentVersions([]);
    setAgentModel(agent.model ?? "");
    setAgentTemperature(
      agent.temperature === undefined || agent.temperature === null
        ? ""
        : String(agent.temperature),
    );
    setAgentKnowledgeBaseIds(agent.knowledgeBaseIds ?? "");
    setAgentToolIds(parseIds(agent.toolIds));
    setAgentSkillIds(parseIds(agent.skillIds));
    if (resetSearch) {
      setAgentChildSearch("");
      setAgentKnowledgeSearch("");
      setAgentToolSearch("");
      setAgentSkillSearch("");
    }
    setAgentConfigBaseline(agentConfigSnapshot(agent));

    request<AgentChildBinding[]>(`/admin/agents/${agent.id}/children`)
      .then((items) => {
        if (agentSettingsRequestId.current !== requestId) return;
        const childIds = items.map((item) => item.childAgentId);
        const childRules = Object.fromEntries(
          items.map((item) => [item.childAgentId, item.routingRule ?? ""]),
        );
        setAgentChildIds(childIds);
        setAgentChildRules(childRules);
        setAgentConfigBaseline((current) => ({
          ...agentConfigSnapshot(agent, childIds, childRules),
          enabled: current?.enabled ?? agent.enabled,
        }));
      })
      .catch(() => {
        if (agentSettingsRequestId.current !== requestId) return;
        setAgentChildIds([]);
        setAgentChildRules({});
      });
    request<AgentConfigVersion[]>(`/admin/agents/${agent.id}/versions`)
      .then((items) => {
        if (agentSettingsRequestId.current === requestId) {
          setAgentVersions(items);
        }
      })
      .catch(() => {
        if (agentSettingsRequestId.current === requestId) {
          setAgentVersions([]);
        }
      });
  };

  const openAgentSettings = (agent: Agent) => {
    const requestId = ++agentSettingsRequestId.current;
    setAgentReturnTab(
      ["agents-general", "agents-domain", "agents-sub"].includes(tab)
        ? tab
        : agentTabForRole(agent.role ?? ""),
    );
    setTab("agent-settings");
    setAgentConfigSection("basic");
    populateAgentConfig(agent, requestId, true);
    setAgentError("");
    setAgentDialogOpen(false);
  };

  const closeAgentConfig = () => {
    const performClose = () => {
      agentSettingsRequestId.current += 1;
      setAgentConfigBaseline(undefined);
      setAgentConfigId(undefined);
      setTab(agentReturnTab);
    };
    if (agentConfigDirty && agentConfigId) {
      askConfirm({
        title: t.unsavedChangesTitle,
        description: t.unsavedChangesDesc,
        confirmLabel: t.discardChanges,
        cancelLabel: t.stayHere,
        tone: "primary",
        onConfirm: () => {
          performClose();
        },
      });
      return;
    }
    performClose();
  };

  const requestAgentConfigSection = (key: typeof agentConfigSection) => {
    if (agentConfigSection === key) return;
    setAgentConfigSection(key);
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
    if (editingAgentId && !/^[A-Za-z0-9][A-Za-z0-9-]{1,127}$/.test(id)) {
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
    if (!agentDescription.trim()) {
      setAgentError(t.agentDescriptionRequired);
      return;
    }
    if (
      agentRole === "SUB" &&
      (!agentParentId.trim() ||
        !agents.some(
          (item) =>
            item.id === agentParentId.trim() &&
            item.role === "DOMAIN" &&
            item.enabled,
        ))
    ) {
      setAgentError(t.parentAgentRequired);
      return;
    }

    setAgentSubmitting(true);
    setAgentError("");
    try {
      const savedAgent = await request<Agent>(
        editingAgentId ? `/admin/agents/${editingAgentId}` : "/admin/agents",
        {
          method: editingAgentId ? "PUT" : "POST",
          body: JSON.stringify({
            id: editingAgentId ? id : null,
            displayName,
            description: agentDescription.trim(),
            systemPrompt,
            role: agentRole,
            parentAgentId: agentParentId.trim() || null,
            handlingMode: agentHandlingMode,
            returnMode: agentReturnMode,
            enabled: agentEnabled,
            priority: Math.max(0, Math.min(10000, Number(agentPriority) || 0)),
            routingRules: agentRoutingRules.trim() || null,
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
      if (agentRole === "DOMAIN" && savedAgent?.id) {
        await request(`/admin/agents/${savedAgent.id}/children`, {
          method: "PUT",
          body: JSON.stringify(
            agentChildIds.map((childAgentId, index) => ({
              childAgentId,
              priority: index * 10,
              enabled: true,
              routingRule: agentChildRules[childAgentId]?.trim() || null,
            })),
          ),
        });
      }
      setAgentDialogOpen(false);
      const refreshedAgents = await loadAgents();
      const refreshedAgent =
        refreshedAgents.find((item) => item.id === savedAgent.id) ?? savedAgent;
      const requestId = ++agentSettingsRequestId.current;
      setAgentReturnTab(agentTabForRole(refreshedAgent.role ?? agentRole));
      populateAgentConfig(refreshedAgent, requestId, false);
    } catch (error) {
      setAgentError(
        error instanceof Error ? error.message : t.createAgentFailed,
      );
    } finally {
      setAgentSubmitting(false);
    }
  };

  const publishAgent = async () => {
    if (!configuredAgent) return;
    setAgentSubmitting(true);
    setAgentError("");
    try {
      await request(`/admin/agents/${configuredAgent.id}/publish`, {
        method: "POST",
        body: JSON.stringify({ releaseNote: "后台配置发布" }),
      });
      loadAgents();
      setAgentVersions(
        await request<AgentConfigVersion[]>(
          `/admin/agents/${configuredAgent.id}/versions`,
        ),
      );
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : t.saveAgent);
    } finally {
      setAgentSubmitting(false);
    }
  };

  const rollbackAgent = async (version: number) => {
    if (!configuredAgent) return;
    setAgentSubmitting(true);
    try {
      await request(`/admin/agents/${configuredAgent.id}/rollback`, {
        method: "POST",
        body: JSON.stringify({ version }),
      });
      loadAgents();
      setAgentVersions(
        await request<AgentConfigVersion[]>(
          `/admin/agents/${configuredAgent.id}/versions`,
        ),
      );
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : t.saveAgent);
    } finally {
      setAgentSubmitting(false);
    }
  };

  const toggle = async (agent: Agent) => {
    const enabled = !agent.enabled;
    await request(`/admin/agents/${agent.id}/enabled`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    if (agentConfigId === agent.id) {
      setAgentEnabled(enabled);
      setAgentConfigBaseline((current) =>
        current ? { ...current, enabled } : current,
      );
    }
    loadAgents();
  };

  const deleteAgent = async (agent: Agent) => {
    if (
      agent.systemAgent ||
      ["assistant", "route-copilot"].includes(agent.id)
    ) {
      return;
    }
    if (agent.enabled) {
      toast.warning(t.deleteAgentEnabled);
      return;
    }
    askConfirm({
      title: t.confirmDeleteTitle,
      description: t.deleteAgentConfirm(agent.displayName),
      confirmLabel: t.deleteResource,
      cancelLabel: t.cancelLabel,
      tone: "danger",
      onConfirm: async () => {
        setAgentActionId(agent.id);
        try {
          await request(`/admin/agents/${agent.id}`, { method: "DELETE" });
          setAgents((current) =>
            current.filter((item) => item.id !== agent.id),
          );
          if (agentConfigId === agent.id) closeAgentConfig();
          toast.success(t.agentDeleted(agent.displayName));
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : t.deleteAgentFailed,
          );
        } finally {
          setAgentActionId(undefined);
        }
      },
    });
  };

  const isSystemAgent = (agent: Agent) =>
    agent.systemAgent === true ||
    ["assistant", "route-copilot"].includes(agent.id);

  const agentRoleOf = (agent: Agent) =>
    agent.role ?? (agent.systemAgent ? "MAIN" : "DOMAIN");

  const toggleBase = async (base: Base) => {
    const enabled = !base.enabled;
    try {
      const updated = await request<Base>(`/admin/knowledge-bases/${base.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...base, enabled }),
      });
      setBases((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (activeBaseId === base.id && !enabled) {
        setActiveBaseId(undefined);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.baseActionFailed);
    }
  };

  const deleteBase = (base: Base) => {
    askConfirm({
      title: t.confirmDeleteTitle,
      description: t.baseDeleteConfirm(base.name),
      confirmLabel: t.delete,
      cancelLabel: t.cancelLabel,
      tone: "danger",
      onConfirm: async () => {
        try {
          await request(`/admin/knowledge-bases/${base.id}`, {
            method: "DELETE",
          });
          setBases((items) => items.filter((item) => item.id !== base.id));
          setDocuments((items) => {
            const next = { ...items };
            delete next[base.id];
            return next;
          });
          if (activeBaseId === base.id) closeKnowledgeBase();
          toast.success(t.baseDeleted(base.name));
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : t.baseActionFailed,
          );
          throw error;
        }
      },
    });
  };

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
    if (
      bases.some((item) => normalizedName(item.name) === normalizedName(name))
    ) {
      setBaseError(t.nameExists);
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
      loadBases();
    } catch (error) {
      setBaseError(error instanceof Error ? error.message : t.createBaseFailed);
    } finally {
      setBaseSubmitting(false);
    }
  };

  const uploadDocument = async (baseId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await apiFetch(
      `/admin/knowledge-bases/${baseId}/documents`,
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
    const selectedFiles = files ? Array.from(files) : [];
    input.value = "";
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
    askConfirm({
      title: t.confirmDeleteTitle,
      description: t.deleteConfirm(document.filename),
      confirmLabel: t.deleteResource,
      cancelLabel: t.cancelLabel,
      tone: "danger",
      onConfirm: async () => {
        setDocumentActionId(document.id);
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
          toast.success(t.documentDeleted(document.filename));
        } catch (error) {
          toast.error(error instanceof Error ? error.message : t.deleteFailed);
        } finally {
          setDocumentActionId(undefined);
        }
      },
    });
  };

  const openDocumentDetails = async (document: KnowledgeDocument) => {
    if (!activeBaseId) return;
    setSelectedDocument(document);
    setDocumentChunks([]);
    setChunksLoading(true);
    try {
      const result = await request<DocumentChunk[]>(
        `/admin/knowledge-bases/${activeBaseId}/documents/${document.id}/chunks`,
      );
      setDocumentChunks(result);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t.uploadFailed);
    } finally {
      setChunksLoading(false);
    }
  };

  const runRetrieval = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeBaseId || !retrievalQuery.trim()) return;
    setRetrievalLoading(true);
    setRetrievalError("");
    try {
      const result = await request<RetrievalResult[]>(
        `/admin/knowledge-bases/${activeBaseId}/search`,
        {
          method: "POST",
          body: JSON.stringify({
            query: retrievalQuery.trim(),
            topK: activeQaSettings.topK,
          }),
        },
      );
      setRetrievalResults(result);
    } catch (error) {
      setRetrievalError(
        error instanceof Error ? error.message : t.retrievalFailed,
      );
    } finally {
      setRetrievalLoading(false);
    }
  };

  const uploadRouteAttachments = async (
    files: FileList | null,
    input: HTMLInputElement,
  ) => {
    const selectedFiles = files ? Array.from(files) : [];
    input.value = "";
    if (!selectedFiles.length) return;

    setRouteUploading(true);
    try {
      const form = new FormData();
      for (const file of selectedFiles) {
        form.append("files", file, file.name);
      }
      const response = await apiFetch("/admin/router/attachments", {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || t.routerUploadFailed);
      }
      const uploaded = (await response.json()) as ConversationAttachment[];
      setRouteAttachments((current) => [...current, ...uploaded]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t.routerUploadFailed,
      );
    } finally {
      setRouteUploading(false);
    }
  };

  const removeRouteAttachment = (id: string) => {
    setRouteAttachments((current) =>
      current.filter((attachment) => attachment.id !== id),
    );
  };

  const testRoute = async () => {
    if (!message.trim() && !routeAttachments.length) return;
    setRouteAnalysis("");
    setRoute(
      await request<Record<string, unknown>>("/admin/router/test", {
        method: "POST",
        body: JSON.stringify({
          message: message.trim(),
          pageContext: routePageContext.trim(),
          attachmentIds: routeAttachments.map((attachment) => attachment.id),
          permissions: { readPage: routeReadPage },
        }),
      }),
    );
  };

  const analyzeRoute = async () => {
    if (!route) return;
    setRouteAnalyzing(true);
    setRouteAnalysis("");
    try {
      const result = await request<{ analysis: string }>(
        "/admin/router/analyze",
        {
          method: "POST",
          body: JSON.stringify({
            message: message.trim(),
            pageContext: routePageContext.trim(),
            route,
          }),
        },
      );
      setRouteAnalysis(result.analysis);
    } catch {
      setRouteAnalysis(t.routeAnalysisFailed);
    } finally {
      setRouteAnalyzing(false);
    }
  };

  const currentAgentConfigSnapshot: AgentConfigSnapshot = {
    id: agentId,
    displayName: agentDisplayName,
    description: agentDescription,
    systemPrompt: agentSystemPrompt,
    browserActions: agentBrowserActions,
    enabled: agentEnabled,
    priority: agentPriority,
    routingRules: agentRoutingRules,
    role: agentRole,
    parentAgentId: agentParentId,
    handlingMode: agentHandlingMode,
    returnMode: agentReturnMode,
    model: agentModel,
    temperature: agentTemperature,
    knowledgeBaseIds: agentKnowledgeBaseIds,
    toolIds: agentToolIds,
    skillIds: agentSkillIds,
    childIds: agentChildIds,
    childRules: agentChildRules,
  };
  const agentConfigDirty = Boolean(
    agentConfigId &&
    agentConfigBaseline &&
    serializeAgentConfig(currentAgentConfigSnapshot) !==
      serializeAgentConfig(agentConfigBaseline),
  );
  const configuredAgent = agents.find((item) => item.id === agentConfigId);
  const configuredAgentIsSystem = configuredAgent
    ? isSystemAgent(configuredAgent)
    : true;
  const promptError =
    agentError || agentTestError || baseError || uploadError || resourceError;
  const dismissPromptError = () => {
    setAgentError("");
    setAgentTestError("");
    setBaseError("");
    setUploadError("");
    setResourceError("");
  };
  const filteredAgents = agents;
  const filteredBases = bases.filter(
    (base) =>
      knowledgeStatus === "all" ||
      (knowledgeStatus === "enabled" ? base.enabled : !base.enabled),
  );
  const activeDocuments = activeBaseId ? (documents[activeBaseId] ?? []) : [];
  const hasProcessingDocuments = activeDocuments.some((document) =>
    [
      "PENDING",
      "QUEUED",
      "PARSING",
      "CHUNKING",
      "EMBEDDING",
      "INDEXING",
    ].includes(document.status),
  );

  useEffect(() => {
    if (!activeBaseId || !hasProcessingDocuments) return;
    const intervalId = window.setInterval(() => {
      request<KnowledgeDocument[]>(
        `/admin/knowledge-bases/${activeBaseId}/documents`,
      )
        .then((updated) => {
          setDocuments((current) => ({
            ...current,
            [activeBaseId]: updated,
          }));
          setSelectedDocument((current) =>
            current
              ? (updated.find((document) => document.id === current.id) ??
                current)
              : current,
          );
        })
        .catch(() => {
          // Keep the current status and retry on the next interval.
        });
    }, 1500);
    return () => window.clearInterval(intervalId);
  }, [activeBaseId, hasProcessingDocuments]);

  const filteredDocuments = activeDocuments;
  const filteredTools = tools.filter(
    (tool) =>
      resourceStatus === "all" ||
      (resourceStatus === "enabled" ? tool.enabled : !tool.enabled),
  );
  const filteredMcpServers = mcpServers;
  const filteredSkills = skills.filter(
    (skill) =>
      resourceStatus === "all" ||
      (resourceStatus === "enabled" ? skill.enabled : !skill.enabled),
  );
  const filteredHooks = hooks;
  const filteredFeedback = feedback;
  const agentListTab = (() => {
    const config = {
      agents: { role: "MAIN", title: t.roleMain, hint: t.systemAgentPageHint },
      "agents-general": {
        role: "GENERAL",
        title: t.generalAgentPage,
        hint: t.generalAgentPageHint,
      },
      "agents-domain": {
        role: "DOMAIN",
        title: t.domainAgentPage,
        hint: t.domainAgentPageHint,
      },
      "agents-sub": {
        role: "SUB",
        title: t.subAgentPage,
        hint: t.subAgentPageHint,
      },
    }[tab];
    if (!config) return undefined;
    return {
      ...config,
      items: filteredAgents.filter(
        (agent) => agentRoleOf(agent) === config.role,
      ),
    };
  })();

  return (
    <div className="shell">
      <ToastContainer />
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
            <Icon
              name={sidebarCollapsed ? "chevron-right" : "chevron-left"}
              size={16}
            />
          </button>
        </div>
        <div className="nav-group">
          <div className="nav-row">
            <button
              className={tab === "agents" ? "nav active" : "nav"}
              onClick={() => {
                if (tab === "agents") {
                  setAgentMenuOpen((open) => !open);
                } else {
                  setTab("agents");
                  setAgentMenuOpen(true);
                }
              }}
              title={sidebarCollapsed ? t.agents : undefined}
              aria-label={t.agents}
            >
              <span className="nav-icon" aria-hidden="true">
                <Icon name="agents" size={16} />
              </span>
              {!sidebarCollapsed && <span>{t.agents}</span>}
            </button>
            {!sidebarCollapsed && (
              <button
                className="nav-caret"
                onClick={() => setAgentMenuOpen((open) => !open)}
                aria-expanded={agentMenuOpen}
                aria-label={t.agentRole}
                title={t.agentRole}
              >
                <Icon
                  name={agentMenuOpen ? "chevron-down" : "chevron-right"}
                  size={12}
                />
              </button>
            )}
          </div>
          {!sidebarCollapsed && agentMenuOpen && (
            <div className="nav-sub">
              {(
                [
                  ["agents-general", t.generalAgentPage],
                  ["agents-domain", t.domainAgentPage],
                  ["agents-sub", t.subAgentPage],
                ] as const
              ).map(([key, label]) => (
                <button
                  className={
                    tab === key ? "nav nav-sub-item active" : "nav nav-sub-item"
                  }
                  onClick={() => setTab(key)}
                  aria-label={label}
                  key={key}
                >
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {[
          ["knowledge", "knowledge"],
          ["mcp-servers", "mcp"],
          ["tools", "tool"],
          ["skills", "sparkle"],
          ["hooks", "flag"],
          ["ratings", "star"],
          ["conversation-logs", "chat"],
          ["router", "router"],
        ].map(([key, icon]) => {
          const labels: Record<string, string> = {
            knowledge: t.knowledge,
            "mcp-servers": t.mcpServers,
            tools: t.toolsMenu,
            skills: t.skillsMenu,
            hooks: t.hooksMenu,
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
                <Icon name={icon as IconName} size={16} />
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
              : tab === "agents-general"
                ? t.generalAgentPage
                : tab === "agents-domain"
                  ? t.domainAgentPage
                  : tab === "agents-sub"
                    ? t.subAgentPage
                    : tab === "agent-settings"
                      ? t.agentSettingsPage
                      : tab === "knowledge"
                        ? t.knowledge
                        : tab === "mcp-servers"
                          ? t.mcpServersTitle
                          : tab === "tools"
                            ? t.toolsTitle
                            : tab === "skills"
                              ? t.skillsTitle
                              : tab === "hooks"
                                ? t.hooksTitle
                                : tab === "ratings"
                                  ? t.agentRatings
                                  : tab === "conversation-logs"
                                    ? t.conversationLogs
                                    : t.routerTest}
          </h2>
          <div className="header-actions">
            <Tooltip placement="bottom" content={t.localModeHint}>
              <span className="badge badge-clickable">{t.localMode}</span>
            </Tooltip>
            <Tooltip placement="bottom" content={t.shortcutsHint}>
              <button
                className="settings-button"
                onClick={() => setShortcutsOpen(true)}
                aria-label={t.shortcuts}
                title={t.shortcuts}
              >
                ?
              </button>
            </Tooltip>
            <button
              className="settings-button"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-label={t.settings}
              title={t.settings}
            >
              <Icon name="settings" size={18} />
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
                <div className="settings-account">
                  <span>{t.signedInAs}</span>
                  <span className="settings-account-name">{username}</span>
                </div>
                <button
                  type="button"
                  className="settings-logout"
                  onClick={onLogout}
                >
                  <Icon name="logout" size={16} />
                  {t.logout}
                </button>
              </div>
            )}
          </div>
        </header>

        {tab === "agent-settings" && agentConfigId && (
          <AgentSettingsPage
            key={agentConfigId}
            t={t}
            agentId={agentId}
            agentDisplayName={agentDisplayName}
            agentRole={agentRole}
            agentParentId={agentParentId}
            agentDescription={agentDescription}
            agentSystemPrompt={agentSystemPrompt}
            agentBrowserActions={agentBrowserActions}
            agentEnabled={agentEnabled}
            agentPriority={agentPriority}
            agentTemperature={agentTemperature}
            agentModel={agentModel}
            agentRoutingRules={agentRoutingRules}
            agentHandlingMode={agentHandlingMode}
            agentReturnMode={agentReturnMode}
            agentChildIds={agentChildIds}
            agentChildSearch={agentChildSearch}
            agentChildRules={agentChildRules}
            agentKnowledgeBaseIds={agentKnowledgeBaseIds}
            agentKnowledgeSearch={agentKnowledgeSearch}
            bases={bases}
            tools={tools}
            skills={skills}
            agentToolIds={agentToolIds}
            agentToolSearch={agentToolSearch}
            agentSkillIds={agentSkillIds}
            agentSkillSearch={agentSkillSearch}
            configuredAgent={configuredAgent}
            configuredAgentIsSystem={configuredAgentIsSystem}
            agentActionId={agentActionId}
            agentSubmitting={agentSubmitting}
            agentConfigSection={agentConfigSection}
            agentConfigDirty={agentConfigDirty}
            agentVersions={agentVersions}
            agents={agents}
            closeAgentConfig={closeAgentConfig}
            toggle={toggle}
            openAgentTest={openAgentTest}
            deleteAgent={deleteAgent}
            requestAgentConfigSection={requestAgentConfigSection}
            setAgentRole={setAgentRole}
            setAgentParentId={setAgentParentId}
            setAgentDisplayName={setAgentDisplayName}
            setAgentDescription={setAgentDescription}
            setAgentSystemPrompt={setAgentSystemPrompt}
            setAgentBrowserActions={setAgentBrowserActions}
            setAgentEnabled={setAgentEnabled}
            setAgentPriority={setAgentPriority}
            setAgentTemperature={setAgentTemperature}
            setAgentModel={setAgentModel}
            setAgentRoutingRules={setAgentRoutingRules}
            setAgentHandlingMode={setAgentHandlingMode}
            setAgentReturnMode={setAgentReturnMode}
            setAgentChildIds={setAgentChildIds}
            setAgentChildRules={setAgentChildRules}
            setAgentChildSearch={setAgentChildSearch}
            setAgentKnowledgeBaseIds={setAgentKnowledgeBaseIds}
            setAgentKnowledgeSearch={setAgentKnowledgeSearch}
            setAgentToolIds={setAgentToolIds}
            setAgentToolSearch={setAgentToolSearch}
            setAgentSkillIds={setAgentSkillIds}
            setAgentSkillSearch={setAgentSkillSearch}
            setResourceDetails={setResourceDetails}
            saveAgent={saveAgent}
            publishAgent={publishAgent}
            rollbackAgent={rollbackAgent}
          />
        )}
        {agentListTab && (
          <section>
            {agentListTab.role !== "MAIN" && (
              <button type="button" onClick={() => addAgent(agentListTab.role)}>
                {t.newAgent}
              </button>
            )}
            <section className="agent-group">
              <div className="group-heading">
                <div>
                  <h3>{agentListTab.title}</h3>
                  <p>{agentListTab.hint}</p>
                </div>
                <span className="group-count">
                  {agentsLoading && !agentListTab.items.length ? (
                    <Skeleton width="24px" height="14px" />
                  ) : (
                    agentListTab.items.length
                  )}
                </span>
              </div>
              {agentsLoading && !agentListTab.items.length ? (
                <Skeleton.CardList count={4} />
              ) : (
                <div className="grid">
                  {agentListTab.items.map((agent) => {
                    const parent = agent.parentAgentId
                      ? agents.find((item) => item.id === agent.parentAgentId)
                      : undefined;
                    return (
                      <article key={agent.id}>
                        <div className="row">
                          <strong>{agent.displayName}</strong>
                          <span className={agent.enabled ? "ok" : "off"}>
                            {agent.enabled ? t.enabled : t.disabled}
                          </span>
                        </div>
                        <TruncatedId value={agent.id} label="Agent ID" />
                        {parent && (
                          <p className="agent-parent">
                            {t.parentAgent}：{parent.displayName}
                          </p>
                        )}
                        <p>{agent.description || t.noDescription}</p>
                        <div className="agent-actions">
                          <button
                            onClick={() => openAgentSettings(agent)}
                            className="secondary agent-settings-button"
                            disabled={agentActionId === agent.id}
                          >
                            {t.settings}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              {agentListTab.items.length === 0 &&
                (filteredAgents.length < agents.length ? (
                  <EmptyState
                    compact
                    icon={<Icon name="search" size={22} />}
                    title={t.noSearchResults}
                    hint={t.noSearchResultsHint}
                  />
                ) : agentListTab.role === "MAIN" ? (
                  <EmptyState
                    icon={<Icon name="bot" size={22} />}
                    title={t.noAgentOfType}
                    hint={t.noSystemAgentHint}
                  />
                ) : (
                  <EmptyState
                    icon={<Icon name="bot" size={22} />}
                    title={t.noAgentOfType}
                    hint={t.noDomainAgentHint}
                    action={
                      <button
                        type="button"
                        onClick={() => addAgent(agentListTab.role)}
                      >
                        {t.newAgent}
                      </button>
                    }
                  />
                ))}
            </section>
          </section>
        )}

        {tab === "knowledge" && (
          <KnowledgePage
            t={t}
            language={language}
            bases={bases}
            filteredBases={filteredBases}
            basesLoading={basesLoading}
            status={knowledgeStatus}
            onStatusChange={setKnowledgeStatus}
            documents={documents}
            activeBase={activeBase}
            activeDocuments={activeDocuments}
            filteredDocuments={filteredDocuments}
            activeQaSettings={activeQaSettings}
            baseSaving={baseSaving}
            documentActionId={documentActionId}
            section={knowledgeSection}
            onSectionChange={setKnowledgeSection}
            qaSaved={qaSaved}
            addBase={addBase}
            toggleBase={toggleBase}
            deleteBase={deleteBase}
            openKnowledgeBase={openKnowledgeBase}
            closeKnowledgeBase={closeKnowledgeBase}
            saveBaseField={saveBaseField}
            updateQaSettings={updateQaSettings}
            saveKnowledgeSettings={saveKnowledgeSettings}
            uploadDocuments={uploadDocuments}
            uploadProgress={uploadProgress}
            uploadingBaseId={uploadingBaseId}
            deleteDocument={deleteDocument}
            reindexDocument={reindexDocument}
            openDocumentDetails={openDocumentDetails}
            runRetrieval={runRetrieval}
            retrievalQuery={retrievalQuery}
            onRetrievalQueryChange={setRetrievalQuery}
            retrievalResults={retrievalResults}
            retrievalLoading={retrievalLoading}
            retrievalError={retrievalError}
            embeddingConfig={embeddingConfig}
            embeddingProfiles={embeddingProfiles}
            embeddingValidation={embeddingValidation}
            embeddingSaving={embeddingSaving}
            saveEmbeddingConfig={saveEmbeddingConfig}
            validateEmbeddingConfig={validateEmbeddingConfig}
            knowledgeDiagnostics={knowledgeDiagnostics}
            runKnowledgeDiagnostics={runKnowledgeDiagnostics}
          />
        )}

        {tab === "mcp-servers" && (
          <McpServersPage
            t={t}
            servers={mcpServers}
            filtered={filteredMcpServers}
            loading={mcpServersLoading}
            actionId={mcpActionId}
            onNew={() => openMcpDialog()}
            onEdit={(server) => openMcpDialog(server)}
            onToggle={toggleMcpServer}
            onDelete={deleteMcpServer}
            onCheckHealth={checkMcpHealth}
            onShowDetails={setMcpDetails}
            onShowError={setMcpErrorDetail}
          />
        )}

        {tab === "tools" && (
          <ToolsPage
            t={t}
            tools={tools}
            filteredTools={filteredTools}
            loading={toolsLoading}
            actionId={resourceActionId}
            status={resourceStatus}
            onStatusChange={setResourceStatus}
            onNew={() => openResourceDialog("tool")}
            onEdit={(item) => openResourceDialog("tool", item)}
            onToggle={(item) => toggleResource("tool", item)}
            onDelete={(item) => deleteResource("tool", item)}
          />
        )}

        {tab === "skills" && (
          <SkillsPage
            t={t}
            skills={skills}
            filteredSkills={filteredSkills}
            loading={skillsLoading}
            actionId={resourceActionId}
            status={resourceStatus}
            onStatusChange={setResourceStatus}
            onNew={() => openResourceDialog("skill")}
            onEdit={(item) => openResourceDialog("skill", item)}
            onToggle={(item) => toggleResource("skill", item)}
            onDelete={(item) => deleteResource("skill", item)}
          />
        )}

        {tab === "hooks" && (
          <HooksPage
            t={t}
            hooks={hooks}
            filteredHooks={filteredHooks}
            loading={hooksLoading}
            actionId={hookActionId}
            onNew={() => openHookDialog()}
            onEdit={(hook) => openHookDialog(hook)}
            onToggle={toggleHook}
            onDelete={deleteHook}
          />
        )}

        {tab === "ratings" && (
          <RatingsPage
            t={t}
            language={language}
            feedback={feedback}
            filteredFeedback={filteredFeedback}
            feedbackSummary={feedbackSummary}
          />
        )}

        {tab === "conversation-logs" && (
          <ConversationLogsPage
            t={t}
            logs={conversationLogs}
            total={conversationTotal}
            page={conversationPage}
            pageSize={conversationPageSize}
            loading={conversationLoading}
            sessionId={conversationSessionId}
            sessionIdDraft={conversationSessionIdDraft}
            onSessionIdDraftChange={setConversationSessionIdDraft}
            onApplyFilter={() => {
              setConversationSessionId(conversationSessionIdDraft.trim());
              setConversationPage(1);
            }}
            onResetFilter={() => {
              setConversationSessionIdDraft("");
              setConversationSessionId("");
              setConversationPage(1);
            }}
            onPageChange={setConversationPage}
            onPageSizeChange={(size) => {
              setConversationPageSize(size);
              setConversationPage(1);
            }}
            onOpenLog={openConversationDetail}
            detail={conversationDetail}
            detailOpen={conversationDetailOpen}
            detailLoading={conversationDetailLoading}
            onCloseDetail={() => setConversationDetailOpen(false)}
          />
        )}

        {tab === "router" && (
          <RouterPage
            t={t}
            message={message}
            onMessageChange={setMessage}
            pageContext={routePageContext}
            onPageContextChange={setRoutePageContext}
            onTestRoute={testRoute}
            attachments={routeAttachments}
            uploadingAttachments={routeUploading}
            readPage={routeReadPage}
            onReadPageChange={setRouteReadPage}
            onUploadAttachments={uploadRouteAttachments}
            onRemoveAttachment={removeRouteAttachment}
            route={route}
            analyzing={routeAnalyzing}
            onAnalyze={analyzeRoute}
            analysis={routeAnalysis}
          />
        )}
      </main>
      {promptError && (
        <div className="prompt-modal-overlay" role="presentation">
          <div
            className="prompt-modal"
            role="alertdialog"
            aria-modal="true"
            aria-label={t.error}
          >
            <h3>{t.error}</h3>
            <p>{promptError}</p>
            <button type="button" onClick={dismissPromptError}>
              {t.close}
            </button>
          </div>
        </div>
      )}

      {selectedDocument && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setSelectedDocument(undefined);
          }}
        >
          <div
            className="modal document-details-modal"
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <div>
                <h3>{selectedDocument.filename}</h3>
                <p className="modal-subtitle">{t.documentDetails}</p>
              </div>
              <button
                className="icon-button"
                onClick={() => setSelectedDocument(undefined)}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <div className="document-detail-meta">
              <span>{documentStatus(selectedDocument.status, t)}</span>
              {selectedDocument.sizeBytes !== undefined && (
                <span>
                  {t.documentSize}:{" "}
                  {(selectedDocument.sizeBytes / 1024).toFixed(1)} KB
                </span>
              )}
              {selectedDocument.fileHash && (
                <code title={selectedDocument.fileHash}>
                  {t.documentHash}: {selectedDocument.fileHash.slice(0, 16)}…
                </code>
              )}
            </div>
            <h4>{t.documentChunks}</h4>
            {chunksLoading ? (
              <p className="binding-empty">{t.loading}</p>
            ) : documentChunks.length === 0 ? (
              <p className="binding-empty">{t.retrievalEmpty}</p>
            ) : (
              <div className="chunk-list">
                {documentChunks.map((chunk) => (
                  <article className="chunk-item" key={chunk.id}>
                    <div>
                      <strong>#{chunk.chunkIndex + 1}</strong>
                      {chunk.pageNumber ? (
                        <span> · 第 {chunk.pageNumber} 页</span>
                      ) : null}
                    </div>
                    <pre>{chunk.content}</pre>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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

      {hookDialogOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !hookSubmitting) {
              setHookDialogOpen(false);
            }
          }}
        >
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <h3>{editingHookId ? t.editHook : t.newHook}</h3>
                <p className="modal-subtitle">{t.hooksSubtitle}</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setHookDialogOpen(false)}
                disabled={hookSubmitting}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <form onSubmit={saveHook}>
              <label className="field">
                <span>{t.hookName}</span>
                <input
                  value={hookName}
                  onChange={(event) => setHookName(event.target.value)}
                  required
                  maxLength={160}
                />
              </label>
              <label className="field">
                <span>
                  {t.hookDescription}
                  <span className="required-mark" aria-hidden="true">
                    *
                  </span>
                </span>
                <textarea
                  value={hookDescription}
                  onChange={(event) => setHookDescription(event.target.value)}
                  placeholder={t.hookDescriptionPlaceholder}
                  rows={2}
                  maxLength={500}
                />
              </label>
              <div className="field-grid">
                <label className="field">
                  <span>{t.hookRuleType}</span>
                  <select
                    value={hookRuleType}
                    onChange={(event) => {
                      const type = event.target.value;
                      setHookRuleType(type);
                      if (type === "REQUIRE_PERMISSION") {
                        setHookRuleConfig('{"permission":"readPage"}');
                      } else if (type === "KEYWORD_BLOCK") {
                        setHookRuleConfig('{"keywords":["delete","export"]}');
                      } else if (type === "MAX_MESSAGE_LENGTH") {
                        setHookRuleConfig('{"maxLength":4000}');
                      } else {
                        setHookRuleConfig("{}");
                      }
                    }}
                  >
                    <option value="REQUIRE_PERMISSION">
                      {t.requirePermission}
                    </option>
                    <option value="REQUIRE_PAGE_CONTEXT">
                      {t.requirePageContext}
                    </option>
                    <option value="KEYWORD_BLOCK">{t.keywordBlock}</option>
                    <option value="MAX_MESSAGE_LENGTH">
                      {t.maxMessageLength}
                    </option>
                  </select>
                </label>
                <label className="field">
                  <span>{t.hookPriority}</span>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={hookPriority}
                    onChange={(event) =>
                      setHookPriority(Number(event.target.value) || 0)
                    }
                  />
                </label>
              </div>
              <label className="field">
                <span>{t.hookRuleConfig}</span>
                <textarea
                  value={hookRuleConfig}
                  onChange={(event) => setHookRuleConfig(event.target.value)}
                  placeholder={t.hookRuleConfigPlaceholder}
                  rows={3}
                  spellCheck={false}
                />
              </label>
              <label className="field">
                <span>{t.hookFailureMessage}</span>
                <input
                  value={hookFailureMessage}
                  onChange={(event) =>
                    setHookFailureMessage(event.target.value)
                  }
                  placeholder={t.hookFailureMessagePlaceholder}
                  maxLength={300}
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={hookEnabled}
                  onChange={(event) => setHookEnabled(event.target.checked)}
                />
                <span>{t.enabled}</span>
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setHookDialogOpen(false)}
                  disabled={hookSubmitting}
                >
                  {t.cancel}
                </button>
                <button type="submit" disabled={hookSubmitting}>
                  {hookSubmitting ? t.saving : t.save}
                </button>
              </div>
            </form>
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
              {editingAgentId && (
                <label className="field">
                  <span>{t.agentId}</span>
                  <input value={agentId} disabled />
                  <small className="field-hint">{t.agentIdHint}</small>
                </label>
              )}
              {agentRole === "SUB" && (
                <label className="field">
                  <span>
                    {t.parentAgent}
                    <span aria-hidden="true" className="required-mark">
                      *
                    </span>
                  </span>
                  <select
                    value={agentParentId}
                    onChange={(event) => setAgentParentId(event.target.value)}
                    required
                  >
                    <option value="" disabled>
                      —
                    </option>
                    {agents
                      .filter((item) => item.role === "DOMAIN" && item.enabled)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.displayName}
                        </option>
                      ))}
                  </select>
                </label>
              )}
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
                <span>
                  {t.descriptionLabel}{" "}
                  <span className="field-required-mark" aria-label={t.required}>
                    *
                  </span>
                </span>
                <textarea
                  value={agentDescription}
                  onChange={(event) => setAgentDescription(event.target.value)}
                  placeholder={t.agentDescriptionPlaceholder}
                  rows={2}
                  maxLength={500}
                  required
                  aria-required="true"
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

      {mcpDetails && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMcpDetails(undefined);
          }}
        >
          <div
            className="modal mcp-details-modal"
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <div>
                <h3>
                  {mcpDetails.name} · {t.mcpDetails}
                </h3>
                <p className="modal-subtitle">{mcpDetails.serverUrl}</p>
              </div>
              <button
                className="icon-button"
                onClick={() => setMcpDetails(undefined)}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <div className="mcp-detail-summary">
              <span
                className={`mcp-status ${(mcpDetails.status ?? "UNKNOWN").toLowerCase()}`}
              >
                {mcpStatusLabel(t, mcpDetails.status)}
              </span>
              <span>
                {mcpDetails.interfaceCount ?? 0} {t.mcpInterfaces}
              </span>
              {mcpDetails.lastLatencyMs != null && (
                <span>
                  {t.mcpLatency}: {mcpDetails.lastLatencyMs} ms
                </span>
              )}
              {mcpDetails.lastCheckedAt && (
                <span>
                  {t.mcpLastChecked}:{" "}
                  {new Date(mcpDetails.lastCheckedAt).toLocaleString()}
                </span>
              )}
            </div>
            <h4>{t.mcpCapabilities}</h4>
            <pre className="mcp-json">
              {mcpDetails.capabilitiesJson || "{}"}
            </pre>
            <h4>{t.mcpDetails}</h4>
            {parseMcpInterfaces(mcpDetails).length === 0 ? (
              <p className="binding-empty">{t.mcpNoInterfaces}</p>
            ) : (
              <div className="mcp-interface-list">
                {parseMcpInterfaces(mcpDetails).map((item, index) => (
                  <article
                    className="mcp-interface"
                    key={`${item.name ?? "interface"}-${index}`}
                  >
                    <strong>{item.name || `#${index + 1}`}</strong>
                    {item.description && <p>{item.description}</p>}
                    {Boolean(item.inputSchema) && (
                      <pre className="mcp-json">
                        {JSON.stringify(item.inputSchema, null, 2) ?? "{}"}
                      </pre>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {mcpErrorDetail && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMcpErrorDetail(null);
          }}
        >
          <div
            className="modal mcp-error-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mcp-error-title"
          >
            <div className="modal-header">
              <div>
                <h3 id="mcp-error-title">
                  {mcpErrorDetail.name} · {t.mcpErrorDetail}
                </h3>
                <p className="modal-subtitle">
                  {t.mcpLastChecked}
                  {mcpErrorDetail.lastCheckedAt
                    ? `: ${new Date(mcpErrorDetail.lastCheckedAt).toLocaleString()}`
                    : `: ${t.mcpStatusUnknown}`}
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setMcpErrorDetail(null)}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <p className="mcp-error-hint">{t.mcpErrorHint}</p>
            <pre className="mcp-error-body">{mcpErrorDetail.lastError}</pre>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => copyMcpError(mcpErrorDetail.lastError ?? "")}
              >
                {t.copy}
              </button>
              <button
                type="button"
                disabled={mcpActionId === mcpErrorDetail.id}
                onClick={async () => {
                  await checkMcpHealth(mcpErrorDetail);
                  setMcpErrorDetail((current) => {
                    if (!current) return current;
                    const next = mcpServers.find((s) => s.id === current.id);
                    return next ?? current;
                  });
                }}
              >
                {mcpActionId === mcpErrorDetail.id ? t.loading : t.mcpHealth}
              </button>
            </div>
          </div>
        </div>
      )}

      {mcpDialogOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeMcpDialog();
          }}
        >
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <h3>
                  {editingMcpId ? t.edit : t.createResource} · {t.mcpServers}
                </h3>
                <p className="modal-subtitle">{t.mcpServersSubtitle}</p>
              </div>
              <button
                className="icon-button"
                onClick={closeMcpDialog}
                disabled={mcpSubmitting}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <form onSubmit={saveMcpServer}>
              <label className="field">
                <span>{t.mcpServerName}</span>
                <input
                  autoFocus
                  value={mcpName}
                  onChange={(event) => setMcpName(event.target.value)}
                  maxLength={100}
                  required
                />
              </label>
              <label className="field">
                <span>{t.descriptionOptional}</span>
                <textarea
                  value={mcpDescription}
                  onChange={(event) => setMcpDescription(event.target.value)}
                  placeholder={t.mcpDescriptionPlaceholder}
                  rows={2}
                  maxLength={500}
                />
              </label>
              <label className="field">
                <span>{t.mcpServerUrlLabel}</span>
                <input
                  value={mcpServerUrl}
                  onChange={(event) => setMcpServerUrl(event.target.value)}
                  placeholder={t.mcpServerUrlPlaceholder}
                  required
                />
              </label>
              <div className="field-grid">
                <label className="field">
                  <span>{t.mcpTransportLabel}</span>
                  <select
                    value={mcpTransport}
                    onChange={(event) => setMcpTransport(event.target.value)}
                  >
                    <option value="STREAMABLE_HTTP">Streamable HTTP</option>
                    <option value="SSE">SSE</option>
                  </select>
                </label>
                <label className="field">
                  <span>{t.mcpAuthEnvLabel}</span>
                  <input
                    value={mcpAuthEnv}
                    onChange={(event) => setMcpAuthEnv(event.target.value)}
                    placeholder={t.mcpAuthEnvPlaceholder}
                  />
                  <small className="field-hint">{t.mcpAuthEnvHint}</small>
                </label>
              </div>
              {resourceError && (
                <p className="error" role="alert">
                  {resourceError}
                </p>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeMcpDialog}
                  disabled={mcpSubmitting}
                >
                  {t.cancel}
                </button>
                <button type="submit" disabled={mcpSubmitting}>
                  {mcpSubmitting ? t.saving : t.saveResource}
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
                <span>
                  {t.descriptionLabel}
                  <span className="required-mark" aria-hidden="true">
                    *
                  </span>
                </span>
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
                      <small className="field-hint">{t.endpointHint}</small>
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

      {confirmRequest && (
        <ConfirmDialog
          open
          title={confirmRequest.title}
          description={confirmRequest.description}
          confirmLabel={confirmRequest.confirmLabel}
          cancelLabel={confirmRequest.cancelLabel}
          tone={confirmRequest.tone}
          loading={confirmRequest.loading}
          onConfirm={runConfirm}
          onCancel={closeConfirm}
        />
      )}

      {shortcutsOpen && (
        <KeyboardShortcutsHelp
          items={[
            {
              keys: ["shift", "/"],
              description: "打开或关闭此弹窗",
            },
            {
              keys: ["Escape"],
              description: "关闭最上层的弹窗或菜单",
            },
          ]}
          onClose={() => setShortcutsOpen(false)}
        />
      )}
    </div>
  );
}

function App() {
  const [language, setLanguage] = useState<Language>(() => {
    return localStorage.getItem("admin-language") === "en" ? "en" : "zh";
  });
  const [theme, setTheme] = useState<Theme>(() => {
    return localStorage.getItem("admin-theme") === "light" ? "light" : "dark";
  });
  const [session, setSession] = useState<
    { username: string } | null | undefined
  >(() => (getAuthToken() ? undefined : null));
  const [authNotice, setAuthNotice] = useState("");
  const t = translations[language];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("admin-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("admin-language", language);
  }, [language]);

  useEffect(() => {
    if (session !== undefined || !getAuthToken()) return undefined;
    let cancelled = false;
    fetchAdminIdentity()
      .then((identity) => {
        if (!cancelled) setSession(identity);
      })
      .catch(() => {
        if (!cancelled) {
          clearAuthToken();
          setSession(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setAuthNotice(t.sessionExpired);
      setSession(null);
    };
    window.addEventListener("admin:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("admin:unauthorized", handleUnauthorized);
  }, [t.sessionExpired]);

  const login = (username: string) => {
    setAuthNotice("");
    setSession({ username });
  };

  const logout = () => {
    clearAuthToken();
    setAuthNotice("");
    setSession(null);
  };

  if (session === undefined) {
    return (
      <div className="login-page">
        <div className="auth-loading" role="status" aria-live="polite">
          <span className="login-brand-mark" aria-hidden="true">
            <Icon name="agents" size={24} />
          </span>
          <span>{t.checkingSession}</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <LoginScreen
        language={language}
        theme={theme}
        t={t}
        notice={authNotice}
        onLanguageChange={setLanguage}
        onThemeChange={setTheme}
        onAuthenticated={login}
      />
    );
  }

  return <AdminApp username={session.username} onLogout={logout} />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
