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
  const [tab, setTab] = useState("agents");
  const [message, setMessage] = useState("");
  const [route, setRoute] = useState<Record<string, unknown>>();
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
      .then(setBases)
      .catch(() => setBases([]));
  };

  useEffect(load, []);

  useEffect(() => {
    if (!baseDialogOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !baseSubmitting) {
        setBaseDialogOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [baseDialogOpen, baseSubmitting]);

  const addAgent = async () => {
    const id = prompt("Agent ID（小写）", "custom-agent");
    if (!id) return;
    const name = prompt("显示名称", "自定义 Agent") || id;
    await request("/admin/agents", {
      method: "POST",
      body: JSON.stringify({
        id,
        displayName: name,
        description: "",
        systemPrompt: "你是一个页面助手子 Agent。",
        enabled: true,
        priority: 100,
        supportsBrowserActions: false,
      }),
    });
    load();
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
      setBaseError(error instanceof Error ? error.message : "创建知识库失败，请稍后重试");
    } finally {
      setBaseSubmitting(false);
    }
  };

  const testRoute = async () => {
    if (!message.trim()) return;
    setRoute(
      await request<Record<string, unknown>>("/admin/router/test", {
        method: "POST",
        body: JSON.stringify({ message, pageContext: "", tmsAuthorized: false }),
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
            <div className="grid">
              {bases.map((base) => (
                <article key={base.id}>
                  <strong>{base.name}</strong>
                  <p>{base.description || "支持 Markdown、TXT、PDF 文档"}</p>
                  <code>{base.id}</code>
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

      {baseDialogOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeBaseDialog();
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="base-dialog-title">
            <div className="modal-header">
              <div>
                <h3 id="base-dialog-title">新建知识库</h3>
                <p className="modal-subtitle">创建后即可上传文档并用于页面助手检索。</p>
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
