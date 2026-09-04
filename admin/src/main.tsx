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
  },
} as const;

type Agent = {
  id: string;
  displayName: string;
  description?: string;
  enabled: boolean;
  systemPrompt: string;
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [bases, setBases] = useState<Base[]>([]);
  const [documents, setDocuments] = useState<
    Record<string, KnowledgeDocument[]>
  >({});
  const [uploadingBaseId, setUploadingBaseId] = useState<string>();
  const [uploadError, setUploadError] = useState("");
  const [documentActionId, setDocumentActionId] = useState<string>();
  const [tab, setTab] = useState("agents");
  const [message, setMessage] = useState("");
  const [route, setRoute] = useState<Record<string, unknown>>();
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [agentId, setAgentId] = useState("custom-agent");
  const [agentDisplayName, setAgentDisplayName] = useState("自定义 Agent");
  const [agentDescription, setAgentDescription] = useState("");
  const [agentSystemPrompt, setAgentSystemPrompt] =
    useState("你是一个页面助手子 Agent。");
  const [agentBrowserActions, setAgentBrowserActions] = useState(false);
  const [agentSubmitting, setAgentSubmitting] = useState(false);
  const [agentError, setAgentError] = useState("");
  const [agentActionId, setAgentActionId] = useState<string>();
  const [baseDialogOpen, setBaseDialogOpen] = useState(false);
  const [baseName, setBaseName] = useState("");
  const [baseDescription, setBaseDescription] = useState("");
  const [baseSubmitting, setBaseSubmitting] = useState(false);
  const [baseError, setBaseError] = useState("");
  const t = translations[language];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("admin-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("admin-language", language);
  }, [language]);

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

  const addAgent = () => {
    setAgentId("custom-agent");
    setAgentDisplayName(language === "zh" ? "自定义 Agent" : "Custom Agent");
    setAgentDescription("");
    setAgentSystemPrompt(
      language === "zh"
        ? "你是一个页面助手子 Agent。"
        : "You are a page-assistant sub-agent.",
    );
    setAgentBrowserActions(false);
    setAgentError("");
    setAgentDialogOpen(true);
  };

  const closeAgentDialog = () => {
    if (!agentSubmitting) setAgentDialogOpen(false);
  };

  const createAgent = async (event: React.FormEvent<HTMLFormElement>) => {
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
      await request("/admin/agents", {
        method: "POST",
        body: JSON.stringify({
          id,
          displayName,
          description: agentDescription.trim(),
          systemPrompt,
          enabled: true,
          priority: 100,
          supportsBrowserActions: agentBrowserActions,
        }),
      });
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

  const uploadDocument = async (
    baseId: string,
    file: File | undefined,
    input: HTMLInputElement,
  ) => {
    input.value = "";
    if (!file) return;
    setUploadingBaseId(baseId);
    setUploadError("");
    try {
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
      const document = (await response.json()) as KnowledgeDocument;
      setDocuments((current) => ({
        ...current,
        [baseId]: [
          document,
          ...(current[baseId] ?? []).filter((item) => item.id !== document.id),
        ],
      }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t.uploadFailed);
    } finally {
      setUploadingBaseId(undefined);
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
      <aside>
        <h1>{t.title}</h1>
        <p className="muted">{t.subtitle}</p>
        {["agents", "knowledge", "router"].map((key) => {
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
              {labels[key]}
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
            <div className="grid">
              {agents.map((agent) => (
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
                      onClick={() => toggle(agent)}
                      disabled={agentActionId === agent.id}
                    >
                      {agent.enabled ? t.stop : t.enable}
                    </button>
                    <button
                      className="agent-delete"
                      onClick={() => deleteAgent(agent)}
                      disabled={agent.enabled || agentActionId === agent.id}
                      title={
                        agent.enabled
                          ? t.deleteAgentDisabledHint
                          : t.deleteAgent
                      }
                    >
                      {t.deleteAgent}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "knowledge" && (
          <section>
            <button onClick={addBase}>{t.newBase}</button>
            {uploadError && <p className="error page-error">{uploadError}</p>}
            <div className="grid">
              {bases.map((base) => (
                <article className="knowledge-card" key={base.id}>
                  <div className="row">
                    <strong>{base.name}</strong>
                    <span className={base.enabled ? "ok" : "off"}>
                      {base.enabled ? t.enabled : t.disabled}
                    </span>
                  </div>
                  <p>{base.description || t.supportedDocs}</p>
                  <code>{base.id}</code>
                  <div className="document-upload">
                    <label className="upload-button">
                      {uploadingBaseId === base.id ? t.processing : t.upload}
                      <input
                        type="file"
                        accept=".md,.markdown,.txt,.pdf,text/markdown,text/plain,application/pdf"
                        disabled={uploadingBaseId === base.id}
                        onChange={(event) =>
                          uploadDocument(
                            base.id,
                            event.target.files?.[0],
                            event.currentTarget,
                          )
                        }
                      />
                    </label>
                    <span className="upload-hint">{t.uploadHint}</span>
                  </div>
                  {(documents[base.id] ?? []).length > 0 && (
                    <div className="document-list">
                      {(documents[base.id] ?? []).map((document) => (
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
                              className="document-action"
                              disabled={documentActionId === document.id}
                              onClick={() => reindexDocument(document)}
                            >
                              {t.reindex}
                            </button>
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
                </article>
              ))}
            </div>
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
                <h3 id="agent-dialog-title">{t.newAgentTitle}</h3>
                <p className="modal-subtitle">{t.newAgentSubtitle}</p>
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
            <form onSubmit={createAgent}>
              <label className="field">
                <span>{t.agentId}</span>
                <input
                  autoFocus
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                  placeholder={t.agentIdPlaceholder}
                  maxLength={128}
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
                  {agentSubmitting ? t.creating : t.createAgent}
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
