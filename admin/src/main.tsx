import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const API = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8080/api/v1";

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
  const [baseDialogOpen, setBaseDialogOpen] = useState(false);
  const [baseName, setBaseName] = useState("");
  const [baseDescription, setBaseDescription] = useState("");
  const [baseSubmitting, setBaseSubmitting] = useState(false);
  const [baseError, setBaseError] = useState("");

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
    setAgentDisplayName("自定义 Agent");
    setAgentDescription("");
    setAgentSystemPrompt("你是一个页面助手子 Agent。");
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
      setAgentError("Agent ID 只能使用 2-128 位小写字母、数字和连字符");
      return;
    }
    if (!displayName) {
      setAgentError("Agent 名称不能为空");
      return;
    }
    if (!systemPrompt) {
      setAgentError("系统提示词不能为空");
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
        error instanceof Error ? error.message : "创建 Agent 失败，请稍后重试",
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
      setBaseError("请输入知识库名称");
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
      setBaseError(
        error instanceof Error ? error.message : "创建知识库失败，请稍后重试",
      );
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
      setUploadError(
        error instanceof Error ? error.message : "上传文档失败，请稍后重试",
      );
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
      setUploadError(
        error instanceof Error ? error.message : "重新解析文档失败，请稍后重试",
      );
    } finally {
      setDocumentActionId(undefined);
    }
  };

  const deleteDocument = async (document: KnowledgeDocument) => {
    if (!window.confirm(`确定删除文档“${document.filename}”吗？`)) return;
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
      setUploadError(
        error instanceof Error ? error.message : "删除文档失败，请稍后重试",
      );
    } finally {
      setDocumentActionId(undefined);
    }
  };

  const documentStatus = (status: KnowledgeDocument["status"]) => {
    if (status === "READY") return "已解析";
    if (status === "INDEXING") return "解析中";
    if (status === "ERROR") return "解析失败";
    return "等待处理";
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
        <h1>页面助手</h1>
        <p className="muted">管理控制台</p>
        {["agents", "knowledge", "router"].map((key) => {
          const labels: Record<string, string> = {
            agents: "Agent",
            knowledge: "知识库",
            router: "路由测试",
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
              ? "Agent 配置"
              : tab === "knowledge"
                ? "知识库"
                : "主 Agent 路由测试"}
          </h2>
          <span className="badge">本机模式</span>
        </header>

        {tab === "agents" && (
          <section>
            <button onClick={addAgent}>+ 新建 Agent</button>
            <div className="grid">
              {agents.map((agent) => (
                <article key={agent.id}>
                  <div className="row">
                    <strong>{agent.displayName}</strong>
                    <span className={agent.enabled ? "ok" : "off"}>
                      {agent.enabled ? "已启用" : "已停用"}
                    </span>
                  </div>
                  <code>{agent.id}</code>
                  <p>{agent.description || "暂无描述"}</p>
                  <button onClick={() => toggle(agent)}>
                    {agent.enabled ? "停用" : "启用"}
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "knowledge" && (
          <section>
            <button onClick={addBase}>+ 新建知识库</button>
            {uploadError && <p className="error page-error">{uploadError}</p>}
            <div className="grid">
              {bases.map((base) => (
                <article className="knowledge-card" key={base.id}>
                  <div className="row">
                    <strong>{base.name}</strong>
                    <span className={base.enabled ? "ok" : "off"}>
                      {base.enabled ? "已启用" : "已停用"}
                    </span>
                  </div>
                  <p>{base.description || "支持 Markdown、TXT、PDF 文档"}</p>
                  <code>{base.id}</code>
                  <div className="document-upload">
                    <label className="upload-button">
                      {uploadingBaseId === base.id ? "解析中…" : "上传文档"}
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
                    <span className="upload-hint">
                      Markdown、TXT、PDF，最大 10 MB
                    </span>
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
                              {documentStatus(document.status)}
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
                              重新解析
                            </button>
                            <button
                              className="document-action danger"
                              disabled={documentActionId === document.id}
                              onClick={() => deleteDocument(document)}
                            >
                              删除
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
              placeholder="输入一条消息测试路由"
            />
            <button onClick={testRoute}>测试路由</button>
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
                <h3 id="agent-dialog-title">新建 Agent</h3>
                <p className="modal-subtitle">
                  配置一个可供主 Agent 调度的页面助手子 Agent。
                </p>
              </div>
              <button
                className="icon-button"
                onClick={closeAgentDialog}
                disabled={agentSubmitting}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <form onSubmit={createAgent}>
              <label className="field">
                <span>Agent ID</span>
                <input
                  autoFocus
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                  placeholder="例如：release-helper"
                  maxLength={128}
                />
                <small className="field-hint">
                  使用 2-128 位小写字母、数字和连字符。
                </small>
              </label>
              <label className="field">
                <span>显示名称</span>
                <input
                  value={agentDisplayName}
                  onChange={(event) => setAgentDisplayName(event.target.value)}
                  placeholder="例如：发布助手"
                  maxLength={100}
                />
              </label>
              <label className="field">
                <span>描述（可选）</span>
                <textarea
                  value={agentDescription}
                  onChange={(event) => setAgentDescription(event.target.value)}
                  placeholder="简要说明这个 Agent 负责处理什么问题"
                  rows={2}
                  maxLength={500}
                />
              </label>
              <label className="field">
                <span>系统提示词</span>
                <textarea
                  value={agentSystemPrompt}
                  onChange={(event) => setAgentSystemPrompt(event.target.value)}
                  placeholder="定义 Agent 的角色、边界和回答方式"
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
                <span>允许使用浏览器操作提案（执行前仍需用户确认）</span>
              </label>
              {agentError && <p className="error">{agentError}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeAgentDialog}
                  disabled={agentSubmitting}
                >
                  取消
                </button>
                <button type="submit" disabled={agentSubmitting}>
                  {agentSubmitting ? "创建中…" : "创建 Agent"}
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
                <h3 id="base-dialog-title">新建知识库</h3>
                <p className="modal-subtitle">
                  创建后即可上传文档并用于页面助手检索。
                </p>
              </div>
              <button
                className="icon-button"
                onClick={closeBaseDialog}
                disabled={baseSubmitting}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <form onSubmit={createBase}>
              <label className="field">
                <span>名称</span>
                <input
                  autoFocus
                  value={baseName}
                  onChange={(event) => setBaseName(event.target.value)}
                  placeholder="例如：产品操作手册"
                  maxLength={100}
                />
              </label>
              <label className="field">
                <span>描述（可选）</span>
                <textarea
                  value={baseDescription}
                  onChange={(event) => setBaseDescription(event.target.value)}
                  placeholder="简要说明这个知识库的内容"
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
                  取消
                </button>
                <button type="submit" disabled={baseSubmitting}>
                  {baseSubmitting ? "创建中…" : "创建知识库"}
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
