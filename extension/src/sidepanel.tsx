import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const API = "http://localhost:8080/api/v1";
type Theme = "system" | "light" | "dark";
type Msg = { role: string; content: string };

function App() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [session, setSession] = useState<any>();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<Theme>("system");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  useEffect(() => {
    chrome.storage.local.get(["theme"], (value: { theme?: Theme }) => {
      if (value.theme === "light" || value.theme === "dark") {
        setTheme(value.theme);
      }
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    chrome.storage.local.set({ theme });
  }, [theme]);

  async function load() {
    try {
      const sessions = await fetch(API + "/sessions").then((r) => r.json());
      setSessions(sessions);
      if (sessions[0]) await select(sessions[0]);
      else await create();
    } catch {
      setError("无法连接后端，请确认 Spring Boot 已启动。");
    }
  }

  async function create() {
    try {
      const response = await fetch(API + "/sessions", { method: "POST" });
      if (!response.ok) throw Error("创建会话失败");
      const conversation = await response.json();
      setSessions((items) => [conversation, ...items]);
      setSession(conversation);
      setMsgs([]);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function select(conversation: any) {
    setSession(conversation);
    setMsgs(
      await fetch(API + `/sessions/${conversation.id}/messages`).then((r) =>
        r.json(),
      ),
    );
  }

  async function send() {
    if (!input.trim() || busy || !session) return;
    const text = input.trim();
    setInput("");
    setBusy(true);
    setError("");
    setMsgs((items) => [
      ...items,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);

    let pageContext = "";
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs[0]?.id) {
        pageContext = JSON.stringify(
          await chrome.tabs.sendMessage(tabs[0].id, {
            type: "COLLECT_CONTEXT",
          }),
        );
      }
    } catch {
      // The active tab may not allow content scripts (for example chrome:// pages).
    }

    try {
      const response = await fetch(API + "/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          message: text,
          agentId: null,
          pageContext,
        }),
      });
      if (!response.ok || !response.body) throw Error("请求失败");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
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
            setMsgs((items) => {
              const next = [...items];
              const index = next.length - 1;
              next[index] = {
                ...next[index],
                content: next[index].content + data,
              };
              return next;
            });
          }
          if (name === "action_proposed" && data) {
            try {
              const action = JSON.parse(data);
              const approved = window.confirm(
                `助手请求执行 ${action.type} 操作。\n原因：${action.reason || ""}\n风险：${action.risk || ""}\n\n是否执行？`,
              );
              let result = {
                status: approved ? "EXECUTED" : "REJECTED",
                result: approved ? "" : "用户拒绝",
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
          <small>浏览器智能助手</small>
        </div>
        <div className="header-actions">
          <button className="icon-button" onClick={create} title="新建会话">
            ＋
          </button>
          <button
            className="icon-button settings-button"
            onClick={() => setSettingsOpen((open) => !open)}
            title="设置"
            aria-label="设置"
          >
            ⚙
          </button>
          {settingsOpen && (
            <div className="settings-popover">
              <div className="settings-title">外观</div>
              <label>
                <input
                  type="radio"
                  name="theme"
                  checked={theme === "system"}
                  onChange={() => setTheme("system")}
                />
                跟随系统
              </label>
              <label>
                <input
                  type="radio"
                  name="theme"
                  checked={theme === "light"}
                  onChange={() => setTheme("light")}
                />
                浅色
              </label>
              <label>
                <input
                  type="radio"
                  name="theme"
                  checked={theme === "dark"}
                  onChange={() => setTheme("dark")}
                />
                深色
              </label>
            </div>
          )}
        </div>
      </header>
      <nav className="session-tabs" aria-label="聊天窗口">
        {sessions.map((conversation, index) => (
          <button
            key={conversation.id}
            className={
              "session-tab " + (conversation.id === session?.id ? "active" : "")
            }
            onClick={() => select(conversation)}
            title="切换聊天窗口"
          >
            {conversation.title && conversation.title !== "新会话"
              ? conversation.title
              : `新会话 ${sessions.length - index}`}
          </button>
        ))}
      </nav>
      <main>
        {msgs.length === 0 && (
          <div className="empty">
            你好！我可以帮你诊断当前页面，或协助处理你的问题。
          </div>
        )}
        {msgs.map((message, index) => (
          <div key={index} className={"msg " + message.role}>
            <div className="role">
              {message.role === "user" ? "你" : "助手"}
            </div>
            <div className="bubble">{message.content || "思考中…"}</div>
          </div>
        ))}
        <div ref={end} />
      </main>
      {error && <div className="error">{error}</div>}
      <footer>
        <div className="composer">
          <div className="composer-row">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder="描述问题或输入你的需求…"
              aria-label="聊天输入框"
            />
            <button className="send-button" disabled={busy} onClick={send}>
              {busy ? "…" : "发送"}
            </button>
          </div>
          <div className="composer-tools">
            <button
              className="tool-button"
              onClick={() => setToolsOpen((open) => !open)}
              title="添加插件或附件"
              aria-label="添加插件或附件"
            >
              ＋
            </button>
            <button
              className="tool-button permission-button"
              onClick={() => setPermissionOpen((open) => !open)}
              title="权限"
              aria-label="权限"
            >
              ◉ 权限
            </button>
            {toolsOpen && (
              <div className="tool-popover">
                插件、附件等扩展能力将在后续版本接入。
              </div>
            )}
            {permissionOpen && (
              <div className="permission-popover">
                <strong>页面权限</strong>
                <span>仅在发送消息时按需读取当前页面上下文。</span>
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
