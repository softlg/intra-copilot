import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
const API = "http://localhost:8080/api/v1";
type Agent = { id: string; displayName: string; description: string };
type Msg = { role: string; content: string; agentId?: string };
function App() {
  const [agents, setAgents] = useState<Agent[]>([]),
    [agent, setAgent] = useState(""),
    [sessions, setSessions] = useState<any[]>([]),
    [session, setSession] = useState<any>(),
    [msgs, setMsgs] = useState<Msg[]>([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);
  async function load() {
    try {
      const [a, s] = await Promise.all([
        fetch(API + "/agents").then((r) => r.json()),
        fetch(API + "/sessions").then((r) => r.json()),
      ]);
      setAgents(a);
      setSessions(s);
      if (s[0]) select(s[0]);
      else await create();
    } catch (e) {
      setError("无法连接后端，请确认 Spring Boot 已启动。");
    }
  }
  async function create() {
    const c = await fetch(API + "/sessions", { method: "POST" }).then((r) =>
      r.json(),
    );
    setSessions((x) => [c, ...x]);
    setSession(c);
    setMsgs([]);
  }
  async function select(c: any) {
    setSession(c);
    setMsgs(
      await fetch(API + `/sessions/${c.id}/messages`).then((r) => r.json()),
    );
  }
  async function send() {
    if (!input.trim() || busy || !session) return;
    const text = input.trim();
    setInput("");
    setBusy(true);
    setError("");
    setMsgs((x) => [
      ...x,
      { role: "user", content: text },
      { role: "assistant", content: "", agentId: agent || "router" },
    ]);
    let ctx = "";
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs[0]?.id) {
        ctx = JSON.stringify(
          await chrome.tabs.sendMessage(tabs[0].id, {
            type: "COLLECT_CONTEXT",
          }),
        );
      }
    } catch {}
    try {
      const res = await fetch(API + "/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          message: text,
          agentId: agent || null,
          pageContext: ctx,
        }),
      });
      if (!res.ok || !res.body) throw Error("请求失败");
      const reader = res.body.getReader(),
        dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const part of parts) {
          const name = (part.match(/^event: ?(.+)$/m) || [])[1],
            data = (part.match(/^data: ?(.+)$/m) || [])[1];
          if (name === "token" && data)
            setMsgs((x) => {
              const a = [...x],
                i = a.length - 1;
              a[i] = { ...a[i], content: a[i].content + data };
              return a;
            });
          if (name === "action_proposed" && data) {
            try {
              const action = JSON.parse(data);
              const ok = window.confirm(
                `助手请求执行 ${action.type} 操作。\n原因：${action.reason || ""}\n风险：${action.risk || ""}\n\n是否执行？`,
              );
              let result = {
                status: ok ? "EXECUTED" : "REJECTED",
                result: ok ? "" : "用户拒绝",
              };
              if (ok) {
                const tabs = await chrome.tabs.query({
                  active: true,
                  currentWindow: true,
                });
                if (tabs[0]?.id)
                  result = await chrome.tabs.sendMessage(tabs[0].id, {
                    type: "EXECUTE_ACTION",
                    action,
                  });
              }
              await fetch(API + `/actions/${action.actionId}/result`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(result),
              });
            } catch {
              setError("操作提案格式无效");
            }
          }
          if (name === "error") setError(data);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app">
      <header>
        <div>
          <h1>Intra Copilot</h1>
        </div>
        <button onClick={create}>＋</button>
      </header>
      <div className="toolbar">
        <select value={agent} onChange={(e) => setAgent(e.target.value)}>
          <option value="">自动分发</option>
          {agents
            .filter((a) => a.id !== "router")
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName}
              </option>
            ))}
        </select>
        <select
          value={session?.id || ""}
          onChange={(e) =>
            select(sessions.find((s) => s.id === e.target.value))
          }
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>
      <main>
        {msgs.length === 0 && (
          <div className="empty">
            你好！我可以帮你诊断当前页面，或回答 TMS 操作问题。
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={"msg " + m.role}>
            <div className="role">{m.role === "user" ? "你" : "助手"}</div>
            <div className="bubble">{m.content || "思考中…"}</div>
          </div>
        ))}
        <div ref={end} />
      </main>
      {error && <div className="error">{error}</div>}
      <footer>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="描述问题或询问…"
        />
        <button disabled={busy} onClick={send}>
          {busy ? "…" : "发送"}
        </button>
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
