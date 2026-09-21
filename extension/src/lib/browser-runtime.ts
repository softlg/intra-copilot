import type { AuthedFetch } from "../auth";
import { collectContextsFromTab, executeEditorAction } from "./browser";

export const BROWSER_RUNTIME_PROTOCOL_VERSION = 1;
export const BROWSER_RUNTIME_KIND = "EXTENSION";
export const BROWSER_RUNTIME_VERSION = chrome.runtime.getManifest().version;
export const BROWSER_RUNTIME_ACTIONS = [
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
  "NAVIGATE",
  "SET_EDITOR",
  "WAIT_FOR",
  "VERIFY",
  "EXTRACT",
  "SNAPSHOT",
] as const;
export const BROWSER_RUNTIME_MODES = [
  "FAST",
  "VISIBLE_VIRTUAL",
  "BROWSER_TRUSTED",
  "SYSTEM_TRUSTED",
] as const;

const NATIVE_HOST = "com.intra_copilot.input";
const READ_ONLY_ACTIONS = new Set([
  "SNAPSHOT",
  "EXTRACT",
  "VERIFY",
  "WAIT_FOR",
]);
const CDP_ACTIONS = new Set([
  "CLICK",
  "FOCUS",
  "TYPE",
  "FILL",
  "CLEAR",
  "CHECK",
  "UNCHECK",
  "HOVER",
  "SCROLL",
  "PRESS_KEY",
  "SET_EDITOR",
]);
const NATIVE_ACTIONS = new Set([
  "CLICK",
  "FOCUS",
  "TYPE",
  "FILL",
  "CLEAR",
  "CHECK",
  "UNCHECK",
  "HOVER",
  "SCROLL",
  "PRESS_KEY",
  "SET_EDITOR",
]);

export type RuntimeAction = {
  type: string;
  target?: string | { snapshotId: string; frameId: number; elementId: string };
  arguments?: Record<string, unknown>;
  postcondition?: Record<string, unknown>;
  reason?: string;
  risk?: "low" | "medium" | "high";
  readOnly?: boolean;
  interactionMode?: string;
};

export type RuntimeLease = {
  taskId: string;
  leaseToken: string;
  leaseExpiresAt: string;
  protocolVersion: number;
  capability: string;
  interactionMode: string;
  goal: string;
  startUrl?: string;
  allowedOrigins: string;
  businessContext: string;
  constraints: string;
  successCriteria: string;
  maxSteps: number;
  command: {
    commandId: string;
    sequenceNo: number;
    actionType: string;
    actionJson: string;
    expiresAt: string;
  } | null;
};

export type RuntimeObservation = {
  snapshotId: string;
  frameId: number;
  url: string;
  title: string;
  visibleText: string;
  domSummary: string;
  frames: unknown[];
};

export async function reportBrowserRuntimePresence(
  authedFetch: AuthedFetch,
  runtimeInstanceId: string,
  currentUrl: string,
) {
  const response = await authedFetch("/browser/runtimes/presence", {
    method: "POST",
    body: JSON.stringify({
      runtimeKind: BROWSER_RUNTIME_KIND,
      runtimeInstanceId,
      protocolVersion: BROWSER_RUNTIME_PROTOCOL_VERSION,
      runtimeVersion: BROWSER_RUNTIME_VERSION,
      supportedActions: BROWSER_RUNTIME_ACTIONS,
      interactionModes: BROWSER_RUNTIME_MODES,
      currentUrl,
    }),
  });
  if (!response.ok) {
    throw new Error(`Browser runtime presence failed: ${response.status}`);
  }
}

export async function claimBrowserRuntimeLease(
  authedFetch: AuthedFetch,
  runtimeInstanceId: string,
  currentUrl: string,
  leaseToken?: string,
): Promise<RuntimeLease | null> {
  const response = await authedFetch("/browser/runtimes/leases", {
    method: "POST",
    body: JSON.stringify({
      runtimeKind: BROWSER_RUNTIME_KIND,
      runtimeInstanceId,
      protocolVersion: BROWSER_RUNTIME_PROTOCOL_VERSION,
      runtimeVersion: BROWSER_RUNTIME_VERSION,
      supportedActions: BROWSER_RUNTIME_ACTIONS,
      interactionModes: BROWSER_RUNTIME_MODES,
      currentUrl,
      leaseToken: leaseToken ?? null,
    }),
  });
  if (response.status === 204) return null;
  if (!response.ok) {
    throw new Error(`Browser runtime lease failed: ${response.status}`);
  }
  return (await response.json()) as RuntimeLease;
}

export async function executeRuntimeCommand(
  tabId: number,
  actionJson: string,
  interactionMode: string,
  allowedOrigins = "[]",
): Promise<Record<string, unknown>> {
  const action = parseAction(actionJson);
  if (!action) throw new Error("浏览器命令格式无效");
  action.interactionMode = interactionMode;
  const approved = await approveAction(tabId, action, interactionMode);
  if (!approved)
    return { ok: false, rejected: true, error: "用户拒绝了页面操作" };
  let execution: Record<string, unknown>;
  if (action.type === "NAVIGATE") {
    execution = await executeNavigate(tabId, action, allowedOrigins);
  } else if (
    interactionMode === "BROWSER_TRUSTED" &&
    CDP_ACTIONS.has(action.type)
  ) {
    execution = await executeCdp(tabId, action);
  } else if (
    interactionMode === "SYSTEM_TRUSTED" &&
    NATIVE_ACTIONS.has(action.type)
  ) {
    execution = await executeNative(tabId, action);
  } else {
    execution = await executeDom(tabId, action);
  }
  const observation = await collectRuntimeObservation(tabId);
  return {
    ...execution,
    observation,
  };
}

export async function collectRuntimeObservation(
  tabId: number,
): Promise<RuntimeObservation> {
  const contexts = await collectContextsFromTab(tabId);
  const main =
    contexts.find((context) => context.frameId === 0) ?? contexts[0] ?? null;
  return {
    snapshotId: main?.snapshotId ?? "",
    frameId: main?.frameId ?? 0,
    url: main?.url ?? "",
    title: main?.title ?? "",
    visibleText: main?.visibleText ?? "",
    domSummary: main?.domSummary ?? "",
    frames: contexts,
  };
}

export function originAllowed(allowedOrigins: string, url: string): boolean {
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
    if (normalized.startsWith("*.")) {
      return origin.endsWith(normalized.slice(1));
    }
    return origin === normalized;
  });
}

async function approveAction(
  tabId: number,
  action: RuntimeAction,
  interactionMode: string,
): Promise<boolean> {
  const readOnly =
    action.readOnly === true || READ_ONLY_ACTIONS.has(action.type);
  if (readOnly) return true;
  const stored = await chrome.storage.local.get("actionPermission");
  const permission =
    stored.actionPermission === "full" || stored.actionPermission === "delegate"
      ? stored.actionPermission
      : "ask";
  if (permission === "full") return true;
  if (permission === "delegate" && action.risk !== "high") return true;
  const response = await chrome.tabs
    .sendMessage(
      tabId,
      { type: "REQUEST_ACTION_APPROVAL", action, interactionMode },
      { frameId: 0 },
    )
    .catch(() => undefined);
  return response?.approved === true;
}

async function executeDom(tabId: number, action: RuntimeAction) {
  if (action.type === "SET_EDITOR") {
    return (await executeEditorAction(
      tabId,
      action,
      action.interactionMode,
    )) as Record<string, unknown>;
  }
  const frameId =
    typeof action.target === "object" &&
    Number.isInteger(action.target?.frameId)
      ? action.target.frameId
      : 0;
  const result = await chrome.tabs.sendMessage(
    tabId,
    { type: "EXECUTE_ACTION", action, interactionMode: action.interactionMode },
    { frameId },
  );
  return (result ?? { ok: true }) as Record<string, unknown>;
}

async function executeNavigate(
  tabId: number,
  action: RuntimeAction,
  allowedOrigins: string,
) {
  const url = String(action.arguments?.url ?? "");
  if (!/^https?:\/\//i.test(url)) throw new Error("只允许 http 或 https 导航");
  if (!originAllowed(allowedOrigins, url)) {
    throw new Error("目标地址不在任务允许的域名范围内");
  }
  const destination = new URL(url);
  const granted = await chrome.permissions.contains({
    origins: [`${destination.origin}/*`],
  });
  if (!granted) throw new Error("缺少目标站点的页面访问权限");
  await chrome.tabs.update(tabId, { url });
  await waitForTabComplete(tabId);
  await ensureRuntimeContentScript(tabId);
  return { ok: true, action: action.type };
}

async function executeCdp(tabId: number, action: RuntimeAction) {
  await ensureRuntimeContentScript(tabId);
  await chrome.debugger.attach({ tabId }, "1.3");
  try {
    const rect = await actionRect(tabId, action);
    const args = action.arguments ?? {};
    switch (action.type) {
      case "CLICK":
      case "FOCUS":
      case "CHECK":
      case "UNCHECK":
        await cdpClick(tabId, rect.x, rect.y);
        return { ok: true, action: action.type, method: "cdp" };
      case "HOVER":
        await sendCdp(tabId, "Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: rect.x,
          y: rect.y,
        });
        return { ok: true, action: action.type, method: "cdp" };
      case "TYPE":
      case "FILL":
        await cdpClick(tabId, rect.x, rect.y);
        await cdpSelectAllAndClear(tabId);
        await sendCdp(tabId, "Input.insertText", {
          text: String(args.value ?? ""),
        });
        return { ok: true, action: action.type, method: "cdp" };
      case "CLEAR":
        await cdpClick(tabId, rect.x, rect.y);
        await cdpSelectAllAndClear(tabId);
        return { ok: true, action: action.type, method: "cdp" };
      case "SET_EDITOR":
        await cdpClick(tabId, rect.x, rect.y);
        await cdpSelectAllAndClear(tabId);
        await sendCdp(tabId, "Input.insertText", {
          text: String(args.code ?? ""),
        });
        return { ok: true, action: action.type, method: "cdp" };
      case "PRESS_KEY":
        await cdpPressKey(tabId, String(args.key ?? ""));
        return { ok: true, action: action.type, method: "cdp" };
      case "SCROLL":
        await sendCdp(tabId, "Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x: rect.x,
          y: rect.y,
          deltaX: Number(args.deltaX ?? 0),
          deltaY: Number(args.deltaY ?? 600),
        });
        return { ok: true, action: action.type, method: "cdp" };
      default:
        return executeDom(tabId, action);
    }
  } finally {
    await chrome.debugger.detach({ tabId }).catch(() => {});
  }
}

async function executeNative(tabId: number, action: RuntimeAction) {
  await ensureRuntimeContentScript(tabId);
  const rect = await actionRect(tabId, action);
  const response = await chrome.runtime.sendNativeMessage(NATIVE_HOST, {
    version: 1,
    action: action.type,
    arguments: action.arguments ?? {},
    rect,
  });
  if (!response?.ok) {
    throw new Error(String(response?.error || "系统输入助手未安装或执行失败"));
  }
  return { ok: true, action: action.type, method: "native" };
}

async function actionRect(tabId: number, action: RuntimeAction) {
  const frameId =
    typeof action.target === "object" &&
    Number.isInteger(action.target?.frameId)
      ? action.target.frameId
      : 0;
  const response = await chrome.tabs.sendMessage(
    tabId,
    { type: "GET_ACTION_RECT", target: action.target },
    { frameId },
  );
  if (!response?.ok || !response.rect) {
    throw new Error("找不到目标元素或元素已失效");
  }
  return response.rect as {
    x: number;
    y: number;
    screenX: number;
    screenY: number;
  };
}

async function ensureRuntimeContentScript(tabId: number) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" }, { frameId: 0 });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["content.js"],
    });
  }
}

async function sendCdp(
  tabId: number,
  method: string,
  params: { [key: string]: unknown },
) {
  await chrome.debugger.sendCommand({ tabId }, method, params);
}

async function cdpClick(tabId: number, x: number, y: number) {
  await sendCdp(tabId, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
  });
  await sendCdp(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await sendCdp(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
}

async function cdpSelectAllAndClear(tabId: number) {
  for (const type of ["keyDown", "keyUp"] as const) {
    await sendCdp(tabId, "Input.dispatchKeyEvent", {
      type,
      key: "a",
      code: "KeyA",
      windowsVirtualKeyCode: 65,
      nativeVirtualKeyCode: 65,
      modifiers: 2,
    });
  }
  for (const type of ["keyDown", "keyUp"] as const) {
    await sendCdp(tabId, "Input.dispatchKeyEvent", {
      type,
      key: "Backspace",
      code: "Backspace",
      windowsVirtualKeyCode: 8,
      nativeVirtualKeyCode: 8,
    });
  }
}

async function cdpPressKey(tabId: number, value: string) {
  const parts = value.split("+").map((part) => part.trim());
  const key = parts.pop() || "Enter";
  let modifiers = 0;
  if (parts.some((part) => /alt/i.test(part))) modifiers |= 1;
  if (parts.some((part) => /ctrl|control/i.test(part))) modifiers |= 2;
  if (parts.some((part) => /meta|cmd|command/i.test(part))) modifiers |= 4;
  if (parts.some((part) => /shift/i.test(part))) modifiers |= 8;
  for (const type of ["keyDown", "keyUp"] as const) {
    await sendCdp(tabId, "Input.dispatchKeyEvent", {
      type,
      key,
      code: key,
      modifiers,
    });
  }
}

async function waitForTabComplete(tabId: number) {
  const current = await chrome.tabs.get(tabId).catch(() => undefined);
  if (current?.status === "complete") return;
  await new Promise<void>((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("等待页面加载超时"));
    }, 30000);
    const listener = (
      updatedTabId: number,
      changeInfo: { status?: string; url?: string },
    ) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      globalThis.clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function parseAction(actionJson: string): RuntimeAction | null {
  try {
    const value = JSON.parse(actionJson) as RuntimeAction;
    return value && typeof value.type === "string" ? value : null;
  } catch {
    return null;
  }
}
