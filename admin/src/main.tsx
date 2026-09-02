import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const API = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8080/api/v1";
type Agent = { id: string; displayName: string; description?: string; enabled: boolean; systemPrompt: string };
type Base = { id: string; name: string; description?: string; enabled: boolean };

async function request<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, ...init }); if (!response.ok) throw new Error(await response.text()); return response.status === 204 ? (undefined as T) : response.json(); }

function App() {
  const [agents, setAgents] = useState<Agent[]>([]); const [bases, setBases] = useState<Base[]>([]); const [tab, setTab] = useState("agents"); const [message, setMessage] = useState(""); const [route, setRoute] = useState<any>();
  const load = () => { request<Agent[]>("/admin/agents").then(setAgents).catch(() => setAgents([])); request<Base[]>("/admin/knowledge-bases").then(setBases).catch(() => setBases([])); };
  useEffect(load, []);
  const addAgent = async () => { const id = prompt("Agent ID（小写）", "custom-agent"); if (!id) return; const name = prompt("显示名称", "自定义 Agent") || id; await request("/admin/agents", { method: "POST", body: JSON.stringify({ id, displayName: name, description: "", systemPrompt: "你是一个页面助手子 Agent。", enabled: true, priority: 100, supportsBrowserActions: false }) }); load(); };
  const toggle = async (a: Agent) => { await request(`/admin/agents/${a.id}/enabled`, { method: "PATCH", body: JSON.stringify({ enabled: !a.enabled }) }); load(); };
  const addBase = async () => { const name = prompt("知识库名称"); if (!name) return; await request("/admin/knowledge-bases", { method: "POST", body: JSON.stringify({ name, description: "", enabled: true }) }); load(); };
  const testRoute = async () => { if (!message.trim()) return; setRoute(await request("/admin/router/test", { method: "POST", body: JSON.stringify({ message, pageContext: "", tmsAuthorized: false }) })); };
  return <div className="shell"><aside><h1>页面助手</h1><p className="muted">管理控制台</p>{[["agents", "Agent"], ["knowledge", "知识库"], ["router", "路由测试"]].map(([key, label]) => <button className={tab === key ? "nav active" : "nav"} onClick={() => setTab(key)} key={key}>{label}</button>)}</aside><main><header><h2>{tab === "agents" ? "Agent 配置" : tab === "knowledge" ? "知识库" : "主 Agent 路由测试"}</h2><span className="badge">本机模式</span></header>{tab === "agents" && <section><button onClick={addAgent}>+ 新建 Agent</button><div className="grid">{agents.map(a => <article key={a.id}><div className="row"><strong>{a.displayName}</strong><span className={a.enabled ? "ok" : "off"}>{a.enabled ? "已启用" : "已停用"}</span></div><code>{a.id}</code><p>{a.description || "暂无描述"}</p><button onClick={() => toggle(a)}>{a.enabled ? "停用" : "启用"}</button></article>)}</div></section>}{tab === "knowledge" && <section><button onClick={addBase}>+ 新建知识库</button><div className="grid">{bases.map(b => <article key={b.id}><strong>{b.name}</strong><p>{b.description || "支持 Markdown、TXT、PDF 文档"}</p><code>{b.id}</code></article>)}</div></section>}{tab === "router" && <section><textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="输入一条消息测试路由"/><button onClick={testRoute}>测试路由</button>{route && <pre>{JSON.stringify(route, null, 2)}</pre>}</section>}</main></div>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
