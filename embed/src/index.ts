export type InteractionMode =
  "FAST" | "VISIBLE_VIRTUAL" | "BROWSER_TRUSTED" | "SYSTEM_TRUSTED";

export type PermissionMode = "ask" | "delegate" | "full";

export type AttachOptions = {
  baseUrl: string;
  token: string;
  root?: HTMLElement;
  sessionId?: string;
  agentId?: string;
  interactionMode?: InteractionMode;
  permissionMode?: PermissionMode;
  onToken?: (text: string) => void;
  onEvent?: (name: string, payload: Record<string, unknown>) => void;
  onError?: (error: Error) => void;
};

export type SendOptions = {
  message: string;
  pageContext?: string;
  permissions?: Record<string, boolean>;
};

type ActionElement = {
  id: string;
  element: HTMLElement;
};

type Action = {
  actionId: string;
  type: string;
  target?:
    | string
    | {
        snapshotId: string;
        frameId: number;
        elementId: string;
      };
  arguments?: Record<string, unknown>;
  postcondition?: Record<string, unknown>;
  reason?: string;
  risk?: "low" | "medium" | "high";
  readOnly?: boolean;
};

const CURSOR_ID = "intra-copilot-embed-cursor";
const RUNTIME_PROTOCOL_VERSION = 1;
const RUNTIME_INSTANCE_KEY = "intra-copilot.embed.runtime.instance";
const RUNTIME_LEASE_KEY = "intra-copilot.embed.runtime.lease";
const RUNTIME_ACTIONS = [
  "CLICK",
  "FOCUS",
  "TYPE",
  "FILL",
  "CLEAR",
  "SELECT",
  "CHECK",
  "UNCHECK",
  "HOVER",
  "SCROLL",
  "PRESS_KEY",
  "UPLOAD",
  "SET_EDITOR",
  "WAIT_FOR",
  "VERIFY",
  "EXTRACT",
  "SNAPSHOT",
];
const RUNTIME_MODES = ["FAST", "VISIBLE_VIRTUAL"];

type RuntimeLease = {
  taskId: string;
  leaseToken: string;
  protocolVersion: number;
  allowedOrigins: string;
  command: {
    commandId: string;
    actionJson: string;
  } | null;
};

export function attach(options: AttachOptions) {
  return new EmbeddedAgent(options);
}

export class EmbeddedAgent {
  private readonly options: AttachOptions;
  private sessionId?: string;
  private snapshotId = "";
  private elements = new Map<string, HTMLElement>();
  private controller?: AbortController;
  private runtimeTimer?: number;
  private runtimePolling = false;
  private runtimeStopped = false;
  private readonly runtimeInstanceId: string;
  private readonly host: HTMLElement;
  private readonly cursor: HTMLElement;

  constructor(options: AttachOptions) {
    if (!options.baseUrl.trim()) throw new Error("baseUrl is required");
    if (!options.token.trim()) throw new Error("token is required");
    this.options = options;
    this.sessionId = options.sessionId;
    this.runtimeInstanceId = runtimeInstanceId();
    this.host = document.createElement("div");
    this.host.id = "intra-copilot-embed-runtime";
    this.host.style.position = "fixed";
    this.host.style.inset = "0";
    this.host.style.pointerEvents = "none";
    this.host.style.zIndex = "2147483647";
    const shadow = this.host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        #${CURSOR_ID}{position:fixed;width:18px;height:18px;border:2px solid #2563eb;border-radius:50%;background:#fff;box-shadow:0 2px 10px #0004;transition:transform 220ms ease,opacity 150ms ease;opacity:0;pointer-events:none}
        .highlight{position:absolute;border:2px solid #2563eb;border-radius:6px;background:#2563eb14;transition:all 180ms ease;pointer-events:none}
        .status{position:fixed;right:18px;bottom:18px;padding:8px 12px;border-radius:8px;background:#111827f2;color:#fff;font:12px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px #0004}
      </style>
      <div id="${CURSOR_ID}"></div>
      <div class="highlight" hidden></div>
      <div class="status" hidden></div>
    `;
    (options.root ?? document.documentElement).appendChild(this.host);
    this.cursor = shadow.getElementById(CURSOR_ID) as HTMLElement;
    void this.pollRuntime();
  }

  async send(options: SendOptions): Promise<string> {
    const sessionId = await this.ensureSession();
    this.controller?.abort();
    this.controller = new AbortController();
    this.scheduleRuntimePoll(0);
    const response = await fetch(`${this.options.baseUrl}/api/v1/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.options.token}`,
      },
      signal: this.controller.signal,
      body: JSON.stringify({
        sessionId,
        message: options.message,
        agentId: this.options.agentId ?? null,
        pageContext: options.pageContext ?? this.collectContextJson(),
        permissions: {
          readPage: true,
          autoApprove: this.options.permissionMode === "delegate",
          fullControl: this.options.permissionMode === "full",
          embeddedRuntime: true,
          ...options.permissions,
        },
        browserRuntime: "EMBEDDED",
        interactionMode: this.options.interactionMode ?? "VISIBLE_VIRTUAL",
      }),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Intra Copilot request failed: ${response.status}`);
    }
    const runtimePulse = window.setInterval(
      () => this.scheduleRuntimePoll(0),
      1_500,
    );
    try {
      return await this.consumeSse(response.body);
    } finally {
      window.clearInterval(runtimePulse);
    }
  }

  cancel(): void {
    this.controller?.abort();
  }

  destroy(): void {
    this.controller?.abort();
    this.runtimeStopped = true;
    if (this.runtimeTimer) window.clearTimeout(this.runtimeTimer);
    this.host.remove();
  }

  private scheduleRuntimePoll(delayMs: number) {
    if (this.runtimeStopped) return;
    if (this.runtimeTimer) window.clearTimeout(this.runtimeTimer);
    this.runtimeTimer = window.setTimeout(() => {
      this.runtimeTimer = undefined;
      void this.pollRuntime();
    }, delayMs);
  }

  private async pollRuntime() {
    if (this.runtimePolling || this.runtimeStopped) return;
    this.runtimePolling = true;
    try {
      const storedLease = readRuntimeLease();
      const presence = await this.runtimeFetch("/browser/runtimes/presence", {
        method: "POST",
        body: JSON.stringify({
          runtimeKind: "EMBEDDED",
          runtimeInstanceId: this.runtimeInstanceId,
          protocolVersion: RUNTIME_PROTOCOL_VERSION,
          runtimeVersion: "0.1.0",
          supportedActions: RUNTIME_ACTIONS,
          interactionModes: RUNTIME_MODES,
          currentUrl: location.href,
        }),
      });
      if (!presence.ok) throw new Error(`presence ${presence.status}`);
      const response = await this.runtimeFetch("/browser/runtimes/leases", {
        method: "POST",
        body: JSON.stringify({
          runtimeKind: "EMBEDDED",
          runtimeInstanceId: this.runtimeInstanceId,
          protocolVersion: RUNTIME_PROTOCOL_VERSION,
          runtimeVersion: "0.1.0",
          supportedActions: RUNTIME_ACTIONS,
          interactionModes: RUNTIME_MODES,
          currentUrl: location.href,
          leaseToken: storedLease?.leaseToken ?? null,
        }),
      });
      if (response.status === 204) {
        clearRuntimeLease();
        this.scheduleRuntimePoll(30_000);
        return;
      }
      if (!response.ok) throw new Error(`lease ${response.status}`);
      const lease = (await response.json()) as RuntimeLease;
      localStorage.setItem(
        RUNTIME_LEASE_KEY,
        JSON.stringify({
          taskId: lease.taskId,
          leaseToken: lease.leaseToken,
        }),
      );
      if (lease.command) await this.executeRuntimeCommand(lease);
      this.scheduleRuntimePoll(lease.command ? 1_200 : 2_000);
    } catch (error) {
      this.options.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
      this.scheduleRuntimePoll(15_000);
    } finally {
      this.runtimePolling = false;
    }
  }

  private async executeRuntimeCommand(lease: RuntimeLease) {
    if (!originAllowed(lease.allowedOrigins, location.href)) {
      await this.reportRuntimeFailure(
        lease,
        "当前页面不在任务允许的域名范围内",
      );
      return;
    }
    let action: Action;
    try {
      action = JSON.parse(lease.command!.actionJson) as Action;
    } catch {
      action = { actionId: lease.command!.commandId, type: "UNKNOWN" };
    }
    const readOnly =
      action.readOnly === true ||
      ["SNAPSHOT", "EXTRACT", "VERIFY", "WAIT_FOR"].includes(action.type);
    const permission = this.options.permissionMode ?? "ask";
    const approved =
      readOnly ||
      permission === "full" ||
      (permission === "delegate" && action.risk !== "high") ||
      window.confirm(
        `${action.reason ?? "需要在当前页面执行操作。"}\n\n风险：${action.risk ?? "medium"}`,
      );
    let execution: Record<string, unknown> = {
      ok: false,
      verified: false,
      error: approved ? "浏览器命令格式无效" : "用户拒绝了页面操作",
    };
    if (approved) {
      try {
        execution = await this.executeAction(action);
        execution.ok = execution.ok !== false;
        execution.verified = execution.verified !== false;
        execution.observation ??= this.collectContext();
      } catch (error) {
        execution = {
          ok: false,
          verified: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    const response = await this.runtimeFetch(
      `/browser/runtimes/commands/${encodeURIComponent(lease.command!.commandId)}/result`,
      {
        method: "POST",
        body: JSON.stringify({
          runtimeInstanceId: this.runtimeInstanceId,
          leaseToken: lease.leaseToken,
          protocolVersion: lease.protocolVersion,
          ok: execution.ok !== false,
          verified: execution.verified !== false && execution.ok !== false,
          result: JSON.stringify(execution),
          observation:
            execution.observation && typeof execution.observation === "object"
              ? execution.observation
              : {},
          error:
            execution.ok === false
              ? String(execution.error || "页面操作未通过验证")
              : null,
        }),
      },
    );
    if (!response.ok) throw new Error(`command result ${response.status}`);
  }

  private runtimeFetch(path: string, init: RequestInit) {
    return fetch(`${this.options.baseUrl}/api/v1${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.options.token}`,
        ...(init.headers ?? {}),
      },
    });
  }

  private async reportRuntimeFailure(lease: RuntimeLease, message: string) {
    if (!lease.command) return;
    const response = await this.runtimeFetch(
      `/browser/runtimes/commands/${encodeURIComponent(lease.command.commandId)}/result`,
      {
        method: "POST",
        body: JSON.stringify({
          runtimeInstanceId: this.runtimeInstanceId,
          leaseToken: lease.leaseToken,
          protocolVersion: lease.protocolVersion,
          ok: false,
          verified: false,
          result: JSON.stringify({ ok: false, error: message }),
          observation: {},
          error: message,
        }),
      },
    );
    if (!response.ok) throw new Error(`command result ${response.status}`);
  }

  private async ensureSession(): Promise<string> {
    if (this.sessionId) return this.sessionId;
    const response = await fetch(`${this.options.baseUrl}/api/v1/sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.options.token}` },
    });
    if (!response.ok)
      throw new Error(`Unable to create session: ${response.status}`);
    const session = await response.json();
    this.sessionId = String(session.id);
    return this.sessionId;
  }

  private async consumeSse(body: ReadableStream<Uint8Array>): Promise<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const event = parseSse(block);
        if (!event.name || !event.data) continue;
        if (event.name === "token") {
          const token = parseJson<{ text?: string }>(event.data);
          const text = token?.text ?? event.data;
          answer += text;
          this.options.onToken?.(text);
        } else if (event.name === "message_completed") {
          const value = parseJson<{ content?: string }>(event.data);
          if (typeof value?.content === "string") answer = value.content;
        } else if (event.name === "action_proposed") {
          const action = parseJson<Action>(event.data);
          if (action) await this.handleAction(action);
        } else {
          this.options.onEvent?.(
            event.name,
            parseJson<Record<string, unknown>>(event.data) ?? {
              raw: event.data,
            },
          );
        }
      }
    }
    return answer;
  }

  private async handleAction(action: Action): Promise<void> {
    const approved =
      action.readOnly === true ||
      this.options.permissionMode === "full" ||
      (this.options.permissionMode === "delegate" && action.risk !== "high") ||
      window.confirm(
        `${action.reason ?? "需要在当前页面执行操作。"}\n\n风险：${action.risk ?? "medium"}`,
      );
    let result: Record<string, unknown> = {
      ok: false,
      error: "REJECTED",
    };
    if (approved) {
      try {
        result = await this.executeAction(action);
      } catch (error) {
        result = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    const response = await fetch(
      `${this.options.baseUrl}/api/v1/actions/${encodeURIComponent(action.actionId)}/result`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.token}`,
        },
        body: JSON.stringify({
          status:
            approved && result.ok !== false
              ? "EXECUTED"
              : approved
                ? "FAILED"
                : "REJECTED",
          result: JSON.stringify(result),
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Unable to report action result: ${response.status}`);
    }
  }

  private async executeAction(
    action: Action,
  ): Promise<Record<string, unknown>> {
    if (action.type === "NAVIGATE") {
      const url = String(action.arguments?.url ?? "");
      if (!/^https?:\/\//i.test(url))
        throw new Error("Only http/https navigation is allowed");
      location.href = url;
      return { ok: true, action: action.type };
    }
    if (action.type === "SNAPSHOT") {
      return {
        ok: true,
        action: action.type,
        observation: this.collectContext(),
      };
    }
    const element = this.resolveElement(action.target);
    if (!element && !["WAIT_FOR", "VERIFY", "EXTRACT"].includes(action.type)) {
      throw new Error("Target element not found");
    }
    if (element) this.showCursor(element, action.reason);
    switch (action.type) {
      case "CLICK":
        this.dispatchClick(element!);
        break;
      case "FOCUS":
        element!.focus();
        break;
      case "TYPE":
      case "FILL":
        this.fill(element!, String(action.arguments?.value ?? ""));
        break;
      case "CLEAR":
        this.fill(element!, "");
        break;
      case "SELECT": {
        const select = element as HTMLSelectElement;
        const values = Array.isArray(action.arguments?.values)
          ? action.arguments.values.map(String)
          : [String(action.arguments?.value ?? "")];
        for (const option of Array.from(select.options)) {
          option.selected = values.includes(option.value);
        }
        select.dispatchEvent(new Event("change", { bubbles: true }));
        break;
      }
      case "CHECK":
      case "UNCHECK": {
        const input = element as HTMLInputElement;
        input.checked = action.type === "CHECK";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        break;
      }
      case "HOVER":
        this.dispatchMouse(element!, "mouseover");
        this.dispatchMouse(element!, "mousemove");
        break;
      case "SCROLL":
        element!.scrollIntoView({ block: "center", inline: "center" });
        break;
      case "PRESS_KEY":
        element!.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: String(action.arguments?.key ?? ""),
            bubbles: true,
          }),
        );
        element!.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: String(action.arguments?.key ?? ""),
            bubbles: true,
          }),
        );
        break;
      case "SET_EDITOR":
        this.setEditor(element!, String(action.arguments?.code ?? ""));
        break;
      case "WAIT_FOR":
        if (!(await this.waitFor(action.arguments?.condition, 5000))) {
          throw new Error("Wait condition timed out");
        }
        break;
      case "VERIFY":
        if (!this.evaluate(action.arguments?.condition))
          throw new Error("Verify failed");
        break;
      case "EXTRACT":
        return {
          ok: true,
          action: action.type,
          extracted: element?.textContent ?? document.body.innerText,
        };
      default:
        throw new Error(`Unsupported action: ${action.type}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 180));
    const verified = this.evaluate(action.postcondition);
    return {
      ok: verified,
      verified,
      action: action.type,
      observation: this.collectContext(),
    };
  }

  private collectContext(): Record<string, unknown> {
    this.elements.clear();
    this.snapshotId = `embed_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const nodes = deepQueryAll(
      document,
      "input,button,select,textarea,a,[role='button'],[contenteditable='true'],.monaco-editor,.cm-editor,[id*='result' i],[class*='result' i]",
    ).filter(
      (value): value is HTMLElement =>
        value instanceof HTMLElement && visible(value),
    );
    const lines = nodes.slice(0, 160).map((element, index) => {
      const elementId = `el_${index + 1}`;
      this.elements.set(elementId, element);
      const name = (
        element.getAttribute("aria-label") ||
        element.textContent ||
        (element as HTMLInputElement).value ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160);
      return `${elementId} <${element.tagName.toLowerCase()}> name="${name.replace(/"/g, '\\"')}"`;
    });
    return {
      snapshotId: this.snapshotId,
      frameId: 0,
      url: location.href,
      title: document.title,
      visibleText: String(document.body.innerText ?? "").slice(0, 12000),
      domSummary: lines.join("\n"),
    };
  }

  private collectContextJson(): string {
    return JSON.stringify([this.collectContext()]);
  }

  private resolveElement(target: Action["target"]): HTMLElement | null {
    if (!target) return null;
    if (
      typeof target === "object" &&
      (target.snapshotId !== this.snapshotId || target.frameId !== 0)
    ) {
      return null;
    }
    const id = typeof target === "string" ? target : target.elementId;
    const element = this.elements.get(id);
    return element?.isConnected && visible(element) ? element : null;
  }

  private fill(element: HTMLElement, value: string): void {
    element.focus();
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      const prototype =
        element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
        element,
        value,
      );
      element.dispatchEvent(
        new InputEvent("input", { bubbles: true, data: value }),
      );
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (element.isContentEditable) {
      element.textContent = value;
      element.dispatchEvent(
        new InputEvent("input", { bubbles: true, data: value }),
      );
      return;
    }
    throw new Error("Target is not a fillable input");
  }

  private setEditor(element: HTMLElement, code: string): void {
    const host = element.closest(".monaco-editor, .cm-editor") ?? element;
    const view = (
      host as unknown as { cmView?: { view?: unknown }; view?: unknown }
    ).cmView?.view;
    const candidate = view ?? (host as unknown as { view?: unknown }).view;
    if (
      candidate &&
      typeof (candidate as { dispatch?: unknown }).dispatch === "function" &&
      (
        candidate as {
          state?: { doc?: { length?: number; toString?: () => string } };
        }
      ).state?.doc
    ) {
      const state = (
        candidate as {
          state: { doc: { length: number; toString(): string } };
          dispatch(value: unknown): void;
        }
      ).state;
      (
        candidate as {
          dispatch(value: unknown): void;
        }
      ).dispatch({ changes: { from: 0, to: state.doc.length, insert: code } });
      return;
    }
    this.fill(
      host.querySelector("[contenteditable='true'], textarea") ?? element,
      code,
    );
  }

  private dispatchClick(element: HTMLElement): void {
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    const options = {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 0,
    };
    element.dispatchEvent(new PointerEvent("pointerdown", options));
    element.dispatchEvent(new MouseEvent("mousedown", options));
    element.dispatchEvent(new PointerEvent("pointerup", options));
    element.dispatchEvent(new MouseEvent("mouseup", options));
    element.click();
  }

  private dispatchMouse(element: HTMLElement, type: string): void {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
    );
  }

  private showCursor(element: HTMLElement, reason?: string): void {
    if ((this.options.interactionMode ?? "VISIBLE_VIRTUAL") === "FAST") return;
    const rect = element.getBoundingClientRect();
    const shadow = this.host.shadowRoot!;
    const highlight = shadow.querySelector(".highlight") as HTMLElement;
    const status = shadow.querySelector(".status") as HTMLElement;
    this.cursor.style.opacity = "1";
    this.cursor.style.transform = `translate(${rect.left + rect.width / 2 - 9}px, ${rect.top + rect.height / 2 - 9}px)`;
    highlight.hidden = false;
    Object.assign(highlight.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    if (reason) {
      status.hidden = false;
      status.textContent = reason;
      window.setTimeout(() => {
        status.hidden = true;
      }, 1800);
    }
  }

  private evaluate(condition: unknown): boolean {
    if (!condition || typeof condition !== "object") return true;
    const value = condition as Record<string, unknown>;
    if (
      typeof value.urlContains === "string" &&
      !location.href.includes(value.urlContains)
    ) {
      return false;
    }
    const text = String(document.body.innerText ?? "").replace(/\s+/g, " ");
    if (
      typeof value.textVisible === "string" &&
      !text.includes(String(value.textVisible).replace(/\s+/g, " ").trim())
    ) {
      return false;
    }
    if (
      typeof value.documentTextContains === "string" &&
      !text.includes(
        String(value.documentTextContains).replace(/\s+/g, " ").trim(),
      )
    ) {
      return false;
    }
    if (value.target) {
      const element = this.resolveElement(value.target as Action["target"]);
      if (!element) return false;
      if (
        value.valueEquals != null &&
        String((element as HTMLInputElement).value ?? "") !==
          String(value.valueEquals)
      ) {
        return false;
      }
      if (
        value.checkedEquals != null &&
        element instanceof HTMLInputElement &&
        element.checked !== Boolean(value.checkedEquals)
      ) {
        return false;
      }
    }
    return true;
  }

  private async waitFor(
    condition: unknown,
    timeoutMs: number,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.evaluate(condition)) return true;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    return this.evaluate(condition);
  }
}

function parseSse(block: string): { name?: string; data?: string } {
  let name: string | undefined;
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) continue;
    const index = line.indexOf(":");
    if (index < 0) continue;
    const field = line.slice(0, index).trim();
    const value = line.slice(index + 1).replace(/^ /, "");
    if (field === "event") name = value;
    if (field === "data") data.push(value);
  }
  return { name, data: data.length ? data.join("\n") : undefined };
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function visible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0"
  );
}

function deepQueryAll(
  root: Document | ShadowRoot | HTMLElement,
  selector: string,
): Element[] {
  const values = Array.from(root.querySelectorAll(selector));
  for (const element of Array.from(root.querySelectorAll("*"))) {
    if (element.shadowRoot)
      values.push(...deepQueryAll(element.shadowRoot, selector));
  }
  return values;
}

function runtimeInstanceId(): string {
  const existing = localStorage.getItem(RUNTIME_INSTANCE_KEY);
  if (existing) return existing;
  const value = `embed-${crypto.randomUUID()}`;
  localStorage.setItem(RUNTIME_INSTANCE_KEY, value);
  return value;
}

function readRuntimeLease():
  { taskId: string; leaseToken: string } | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(RUNTIME_LEASE_KEY) || "null");
    return value &&
      typeof value.taskId === "string" &&
      typeof value.leaseToken === "string"
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function clearRuntimeLease() {
  localStorage.removeItem(RUNTIME_LEASE_KEY);
}

function originAllowed(allowedOrigins: string, url: string): boolean {
  let values: string[] = [];
  try {
    const parsed = JSON.parse(allowedOrigins || "[]");
    if (Array.isArray(parsed)) values = parsed.map(String);
  } catch {
    return false;
  }
  if (!values.length) return true;
  let origin = "";
  try {
    origin = new URL(url).origin.toLowerCase();
  } catch {
    return false;
  }
  return values.some((value) => {
    const normalized = value.toLowerCase().replace(/\/+$/, "");
    return normalized.startsWith("*.")
      ? origin.endsWith(normalized.slice(1))
      : origin === normalized;
  });
}
