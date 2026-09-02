import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const API = "http://localhost:8080/api/v1";
type Theme = "system" | "light" | "dark";
type Language = "zh" | "en";
type Msg = { role: string; content: string };

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
    language: "语言",
    chinese: "中文",
    english: "English",
    chatWindows: "聊天窗口",
    empty: "你好！我可以帮你诊断当前页面，或协助处理你的问题。",
    you: "你",
    assistant: "助手",
    thinking: "思考中…",
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
    deleteConfirm: (names: string) => `确定删除${names}吗？聊天记录将一并移除。`,
    thisSession: "此会话",
    sessions: (count: number) => `${count} 个会话`,
    nameRequired: "会话名称不能为空",
    renameFailed: "修改会话名称失败",
    deleteFailed: "删除会话失败",
    createFailed: "创建会话失败",
    backendError: "无法连接后端，请确认 Spring Boot 已启动。",
    requestFailed: "请求失败",
    invalidAction: "操作提案格式无效",
    rejected: "用户拒绝",
    inputPlaceholder: "描述问题或输入你的需求…",
    chatInput: "聊天输入框",
    send: "发送",
    addTools: "添加插件或附件",
    permission: "权限",
    toolsUnavailable: "插件、附件等扩展能力将在后续版本接入。",
    pagePermission: "页面权限",
    readPage: "允许读取当前页面上下文",
    delegateTms: "授权业务子 Agent 处理专属问题",
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
    language: "Language",
    chinese: "中文",
    english: "English",
    chatWindows: "Chat windows",
    empty: "Hello! I can help diagnose the current page or assist with your questions.",
    you: "You",
    assistant: "Assistant",
    thinking: "Thinking…",
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
    backendError: "Unable to connect to the backend. Please make sure Spring Boot is running.",
    requestFailed: "Request failed",
    invalidAction: "Invalid action proposal",
    rejected: "Rejected by user",
    inputPlaceholder: "Describe the problem or enter your request…",
    chatInput: "Chat input",
    send: "Send",
    addTools: "Add plugin or attachment",
    permission: "Permissions",
    toolsUnavailable: "Plugins and attachments will be available in a future version.",
    pagePermission: "Page permissions",
    readPage: "Allow reading the current page context",
    delegateTms: "Authorize the business sub-agent for specialized requests",
    permissionNote: "Write actions on the page will still ask for confirmation one by one.",
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
  const [readPageEnabled, setReadPageEnabled] = useState(true);
  const [tmsAuthorized, setTmsAuthorized] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [editingSessionId, setEditingSessionId] = useState<string>();
  const [editingTitle, setEditingTitle] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  useEffect(() => {
    chrome.storage.local.get(
      ["theme", "readPageEnabled", "tmsAuthorized"],
      (value: {
        theme?: Theme;
        readPageEnabled?: boolean;
        tmsAuthorized?: boolean;
      }) => {
        if (value.theme === "light" || value.theme === "dark") {
          setTheme(value.theme);
        }
        if (typeof value.readPageEnabled === "boolean") {
          setReadPageEnabled(value.readPageEnabled);
        }
        if (typeof value.tmsAuthorized === "boolean") {
          setTmsAuthorized(value.tmsAuthorized);
        }
      },
    );
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

  function beginRename(conversation: any) {
    setEditingSessionId(conversation.id);
    setEditingTitle(conversation.title || "新会话");
  }

  function cancelRename() {
    setEditingSessionId(undefined);
    setEditingTitle("");
  }

  async function saveRename(conversation: any) {
    const title = editingTitle.trim();
    if (!title) {
      setError("会话名称不能为空");
      return;
    }
    try {
      const response = await fetch(API + `/sessions/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw Error(body.error || "修改会话名称失败");
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
    const names = ids.length === 1 ? "此会话" : `${ids.length} 个会话`;
    if (!window.confirm(`确定删除${names}吗？聊天记录将一并移除。`)) return;
    try {
      const responses = await Promise.all(
        ids.map((id) => fetch(API + `/sessions/${id}`, { method: "DELETE" })),
      );
      const failed = responses.find((response) => !response.ok);
      if (failed) throw Error("删除会话失败");
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
      if (readPageEnabled && tabs[0]?.id) {
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
          permissions: {
            readPage: readPageEnabled,
            delegateTms: tmsAuthorized,
          },
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
            className="icon-button history-button"
            onClick={() => setHistoryOpen(true)}
            title="历史"
            aria-label="历史"
          >
            历史
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
      {historyOpen && (
        <div className="history-overlay" onClick={() => setHistoryOpen(false)}>
          <aside
            className="history-drawer"
            onClick={(event) => event.stopPropagation()}
            aria-label="历史会话"
          >
            <div className="history-header">
              <div>
                <h2>历史</h2>
                <small>{sessions.length} 个会话</small>
              </div>
              <button
                className="close-button"
                onClick={() => setHistoryOpen(false)}
                aria-label="关闭历史"
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
              全选
            </label>
            <div className="history-list">
              {sessions.length === 0 && (
                <div className="history-empty">暂无历史会话</div>
              )}
              {sessions.map((conversation, index) => {
                const editing = editingSessionId === conversation.id;
                return (
                  <div
                    key={conversation.id}
                    className={
                      "history-item " +
                      (conversation.id === session?.id ? "active" : "")
                    }
                    onClick={() => {
                      if (!editing) {
                        select(conversation);
                        setHistoryOpen(false);
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSessions.includes(conversation.id)}
                      onChange={() => toggleSession(conversation.id)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`选择 ${conversation.title || `新会话 ${sessions.length - index}`}`}
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
                        {conversation.title && conversation.title !== "新会话"
                          ? conversation.title
                          : `新会话 ${sessions.length - index}`}
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
                            title="保存名称"
                          >
                            保存
                          </button>
                          <button
                            className="mini-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              cancelRename();
                            }}
                            title="取消修改"
                          >
                            取消
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
                            title="修改名称"
                          >
                            编辑
                          </button>
                          <button
                            className="mini-button danger-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeSessions([conversation.id]);
                            }}
                            title="删除会话"
                          >
                            删除
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
                删除已选
                {selectedSessions.length
                  ? `（${selectedSessions.length}）`
                  : ""}
              </button>
            </div>
          </aside>
        </div>
      )}
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
                  允许读取当前页面上下文
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={tmsAuthorized}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      setTmsAuthorized(enabled);
                      chrome.storage.local.set({ tmsAuthorized: enabled });
                    }}
                  />
                  授权业务子 Agent 处理专属问题
                </label>
                <span>写入页面的操作仍会逐项请求确认。</span>
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
