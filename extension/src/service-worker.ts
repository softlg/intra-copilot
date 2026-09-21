import { bootstrapAuth, type AuthedFetch } from "./auth";
import {
  claimBrowserRuntimeLease,
  executeRuntimeCommand,
  originAllowed,
  reportBrowserRuntimePresence,
  type RuntimeLease,
} from "./lib/browser-runtime";
import { originPattern } from "./lib/url";

const SIDE_PANEL_PATH = "sidepanel.html";
const SIDE_PANEL_ALL_TABS_KEY = "sidePanelAllTabs";
const DISMISSED_BALL_TAB_IDS_KEY = "dismissedBallTabIds";
const BROWSER_RUNTIME_INSTANCE_KEY = "browserRuntime.instanceId";
const BROWSER_RUNTIME_LEASE_KEY = "browserRuntime.lease";
const BROWSER_RUNTIME_ALARM = "intra-copilot-browser-runtime";
const API_BASE = (
  import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8080/api/v1"
)
  .replace(/\/api\/v1\/?$/, "")
  .replace(/\/$/, "");
let sidePanelAllTabs = false;
let runtimePollInFlight = false;
let runtimePollTimer: ReturnType<typeof setTimeout> | undefined;
let authedFetchPromise: Promise<AuthedFetch> | null = null;

function runtimeAuthedFetch(): Promise<AuthedFetch> {
  if (!authedFetchPromise) {
    authedFetchPromise = bootstrapAuth(API_BASE)
      .then((value) => value.authedFetch)
      .catch((error) => {
        authedFetchPromise = null;
        throw error;
      });
  }
  return authedFetchPromise;
}

async function browserRuntimeInstanceId() {
  const stored = await chrome.storage.local.get(BROWSER_RUNTIME_INSTANCE_KEY);
  if (typeof stored[BROWSER_RUNTIME_INSTANCE_KEY] === "string") {
    return stored[BROWSER_RUNTIME_INSTANCE_KEY] as string;
  }
  const instanceId = `extension-${crypto.randomUUID()}`;
  await chrome.storage.local.set({
    [BROWSER_RUNTIME_INSTANCE_KEY]: instanceId,
  });
  return instanceId;
}

async function currentRuntimeUrl() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.url ?? "";
}

async function storedRuntimeLease(): Promise<
  { taskId: string; leaseToken: string } | undefined
> {
  const session = await chrome.storage.session.get(BROWSER_RUNTIME_LEASE_KEY);
  const value = session[BROWSER_RUNTIME_LEASE_KEY] as
    { taskId?: unknown; leaseToken?: unknown } | undefined;
  if (
    !value ||
    typeof value.taskId !== "string" ||
    typeof value.leaseToken !== "string"
  ) {
    return undefined;
  }
  return { taskId: value.taskId, leaseToken: value.leaseToken };
}

async function saveRuntimeLease(lease?: RuntimeLease) {
  if (!lease) {
    await chrome.storage.session.remove(BROWSER_RUNTIME_LEASE_KEY);
    return;
  }
  await chrome.storage.session.set({
    [BROWSER_RUNTIME_LEASE_KEY]: {
      taskId: lease.taskId,
      leaseToken: lease.leaseToken,
    },
  });
}

function scheduleRuntimePoll(delayMs: number) {
  if (runtimePollTimer) clearTimeout(runtimePollTimer);
  runtimePollTimer = setTimeout(
    () => {
      runtimePollTimer = undefined;
      void pollBrowserRuntime();
    },
    Math.max(250, delayMs),
  );
}

async function pollBrowserRuntime() {
  if (runtimePollInFlight) return;
  runtimePollInFlight = true;
  try {
    const authedFetch = await runtimeAuthedFetch();
    const instanceId = await browserRuntimeInstanceId();
    const currentUrl = await currentRuntimeUrl();
    await reportBrowserRuntimePresence(authedFetch, instanceId, currentUrl);
    const active = await storedRuntimeLease();
    let lease: RuntimeLease | null;
    try {
      lease = await claimBrowserRuntimeLease(
        authedFetch,
        instanceId,
        currentUrl,
        active?.leaseToken,
      );
    } catch (error) {
      if (!active) throw error;
      await saveRuntimeLease();
      lease = await claimBrowserRuntimeLease(
        authedFetch,
        instanceId,
        currentUrl,
      );
    }
    if (!lease) {
      await saveRuntimeLease();
      scheduleRuntimePoll(30_000);
      return;
    }
    await saveRuntimeLease(lease);
    if (!lease.command) {
      scheduleRuntimePoll(1_200);
      return;
    }
    const tabId = await resolveRuntimeTab(lease);
    if (tabId == null) {
      await reportRuntimeFailure(
        authedFetch,
        lease,
        "没有可用于执行任务的页面标签",
      );
    } else {
      const tab = await chrome.tabs.get(tabId).catch(() => undefined);
      if (!tab?.url || !originAllowed(lease.allowedOrigins, tab.url)) {
        await reportRuntimeFailure(
          authedFetch,
          lease,
          "当前页面不在任务允许的域名范围内",
        );
      } else {
        let execution: Record<string, unknown>;
        try {
          execution = await executeRuntimeCommand(
            tabId,
            lease.command.actionJson,
            lease.interactionMode,
            lease.allowedOrigins,
          );
        } catch (error) {
          execution = {
            ok: false,
            verified: false,
            error: (error as Error).message || String(error),
          };
        }
        await reportRuntimeResult(authedFetch, lease, execution);
      }
    }
    scheduleRuntimePoll(1_200);
  } catch (error) {
    console.warn("browser runtime poll failed", error);
    scheduleRuntimePoll(15_000);
  } finally {
    runtimePollInFlight = false;
  }
}

async function resolveRuntimeTab(lease: RuntimeLease) {
  let businessContext: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(lease.businessContext || "{}");
    if (parsed && typeof parsed === "object") {
      businessContext = parsed as Record<string, unknown>;
    }
  } catch {
    // Older backends may leave business context empty.
  }
  const pageContext = businessContext.pageContext;
  const contexts = Array.isArray(pageContext)
    ? pageContext
    : pageContext && typeof pageContext === "object"
      ? [pageContext]
      : [];
  for (const context of contexts) {
    const tabId = Number((context as Record<string, unknown>)?.tabId);
    if (
      Number.isInteger(tabId) &&
      (await chrome.tabs.get(tabId).catch(() => undefined))
    ) {
      await ensureContentScript(tabId);
      return tabId;
    }
  }
  if (lease.startUrl) {
    const destination = new URL(lease.startUrl);
    const tabs = await chrome.tabs.query({ url: `${destination.origin}/*` });
    const matched = tabs.find((tab) => tab.id != null);
    if (matched?.id != null) {
      await ensureContentScript(matched.id);
      return matched.id;
    }
    const granted = await chrome.permissions.contains({
      origins: [`${destination.origin}/*`],
    });
    if (granted) {
      const created = await chrome.tabs.create({
        url: destination.toString(),
        active: true,
      });
      if (created.id != null) {
        await waitForRuntimeTab(created.id);
        await ensureContentScript(created.id);
        return created.id;
      }
    }
  }
  const active = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = active[0]?.id;
  if (tabId == null) return undefined;
  await ensureContentScript(tabId);
  return tabId;
}

async function waitForRuntimeTab(tabId: number) {
  const current = await chrome.tabs.get(tabId).catch(() => undefined);
  if (current?.status === "complete") return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30_000);
    const listener = (
      updatedTabId: number,
      changeInfo: { status?: string },
    ) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function reportRuntimeResult(
  authedFetch: AuthedFetch,
  lease: RuntimeLease,
  execution: Record<string, unknown>,
) {
  const command = lease.command;
  if (!command) return;
  const ok = execution.ok !== false && execution.rejected !== true;
  const verified = execution.verified !== false && ok;
  await authedFetch(`/browser/runtimes/commands/${command.commandId}/result`, {
    method: "POST",
    body: JSON.stringify({
      runtimeInstanceId: await browserRuntimeInstanceId(),
      leaseToken: lease.leaseToken,
      protocolVersion: lease.protocolVersion,
      ok,
      verified,
      result: JSON.stringify(execution),
      observation:
        execution.observation && typeof execution.observation === "object"
          ? execution.observation
          : {},
      error: ok ? null : String(execution.error || "页面操作未通过验证"),
    }),
  });
}

async function reportRuntimeFailure(
  authedFetch: AuthedFetch,
  lease: RuntimeLease,
  message: string,
) {
  await reportRuntimeResult(authedFetch, lease, {
    ok: false,
    verified: false,
    error: message,
  });
}

async function hasOriginPermission(url: string | undefined): Promise<boolean> {
  const pattern = originPattern(url);
  if (!pattern) return false;
  return chrome.permissions.contains({ origins: [pattern] });
}

async function ensureContentScript(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!tab?.url || !(await hasOriginPermission(tab.url))) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
    return;
  } catch {
    // The script is not present after install, navigation, or extension reload.
  }
  await chrome.scripting
    .executeScript({
      target: { tabId, allFrames: true },
      files: ["content.js"],
    })
    .catch(() => {});
}

async function ensureEnabledTabContent(tabId: number): Promise<void> {
  const local = await chrome.storage.local.get([
    "activationMode",
    "enabledTabIds",
  ]);
  const session = await chrome.storage.session.get([
    DISMISSED_BALL_TAB_IDS_KEY,
  ]);
  if (
    tabIsEnabled(
      tabId,
      local.activationMode ?? "manual",
      local.enabledTabIds,
      session[DISMISSED_BALL_TAB_IDS_KEY],
    )
  ) {
    await ensureContentScript(tabId);
  }
}

async function configureTabSidePanel(tabId: number) {
  await chrome.sidePanel
    .setOptions({
      tabId,
      path: SIDE_PANEL_PATH,
      enabled: true,
    })
    .catch(() => {});
}

async function configureOpenTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.flatMap((tab) =>
      tab.id == null ? [] : [configureTabSidePanel(tab.id)],
    ),
  );
}

async function applySidePanelMode(allTabs: boolean) {
  sidePanelAllTabs = allTabs;
  await chrome.sidePanel
    .setOptions({
      path: SIDE_PANEL_PATH,
      enabled: allTabs,
    })
    .catch(() => {});
  if (!allTabs) await configureOpenTabs();
}

async function loadSidePanelMode() {
  const value = await chrome.storage.local.get(SIDE_PANEL_ALL_TABS_KEY);
  const requested = value[SIDE_PANEL_ALL_TABS_KEY] === true;
  const granted =
    !requested ||
    (await chrome.permissions.contains({
      origins: ["http://*/*", "https://*/*"],
    }));
  await applySidePanelMode(requested && granted);
}

function openSidePanelForTab(tabId: number, windowId: number) {
  if (sidePanelAllTabs) {
    void chrome.sidePanel.open({ windowId }).catch(() => {});
    return;
  }

  void configureTabSidePanel(tabId);
  void chrome.sidePanel.open({ tabId }).catch(() => {});
}

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch(() => {});
void loadSidePanelMode();
void chrome.alarms.create(BROWSER_RUNTIME_ALARM, { periodInMinutes: 0.5 });
void pollBrowserRuntime();

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch(() => {});
  chrome.storage.local.get(
    ["activationMode", "enabledTabIds", SIDE_PANEL_ALL_TABS_KEY],
    (value) => {
      const defaults: Record<string, unknown> = {};
      if (
        value.activationMode !== "all_pages" &&
        value.activationMode !== "manual"
      ) {
        defaults.activationMode = "manual";
        defaults.enabledTabIds = [];
      }
      if (!Array.isArray(value.enabledTabIds)) defaults.enabledTabIds = [];
      if (typeof value[SIDE_PANEL_ALL_TABS_KEY] !== "boolean") {
        defaults[SIDE_PANEL_ALL_TABS_KEY] = false;
      }
      if (Object.keys(defaults).length) {
        chrome.storage.local.set(defaults, () => void loadSidePanelMode());
      } else {
        void loadSidePanelMode();
      }
    },
  );
  void chrome.alarms.create(BROWSER_RUNTIME_ALARM, { periodInMinutes: 0.5 });
  void pollBrowserRuntime();
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.alarms.create(BROWSER_RUNTIME_ALARM, { periodInMinutes: 0.5 });
  void pollBrowserRuntime();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BROWSER_RUNTIME_ALARM) void pollBrowserRuntime();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[SIDE_PANEL_ALL_TABS_KEY]) {
    void applySidePanelMode(changes[SIDE_PANEL_ALL_TABS_KEY].newValue === true);
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id == null || tab.windowId == null) return;
  openSidePanelForTab(tab.id, tab.windowId);
});

chrome.tabs.onCreated.addListener((tab) => {
  if (!sidePanelAllTabs && tab.id != null) void configureTabSidePanel(tab.id);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (
    !sidePanelAllTabs &&
    (changeInfo.status === "complete" || changeInfo.url)
  ) {
    void configureTabSidePanel(tabId);
  }
  if (changeInfo.status === "complete") {
    void ensureEnabledTabContent(tabId);
  }
});

function tabIsEnabled(
  tabId: number,
  mode: unknown,
  enabled: unknown,
  dismissed: unknown,
) {
  return (
    !(Array.isArray(dismissed) && dismissed.includes(tabId)) &&
    (mode === "all_pages" ||
      (Array.isArray(enabled) && enabled.includes(tabId)))
  );
}

chrome.runtime.onMessage.addListener(
  (msg: any, sender: any, sendResponse: any) => {
    if (
      msg?.type === "SET_SIDE_PANEL_ALL_TABS" &&
      sender.id === chrome.runtime.id
    ) {
      void applySidePanelMode(msg.enabled === true).then(() =>
        sendResponse({ ok: true }),
      );
      return true;
    }
    if (
      msg?.type === "BROWSER_RUNTIME_POLL" &&
      sender.id === chrome.runtime.id
    ) {
      void pollBrowserRuntime();
      sendResponse({ ok: true });
      return true;
    }
    if (
      msg?.type === "OPEN_SIDE_PANEL" &&
      sender.tab?.id != null &&
      sender.tab?.windowId != null
    ) {
      openSidePanelForTab(sender.tab.id, sender.tab.windowId);
    }
    if (msg?.type === "CONTENT_READY" && sender.tab?.id != null) {
      chrome.storage.local.get(["activationMode", "enabledTabIds"], (value) => {
        chrome.storage.session.get([DISMISSED_BALL_TAB_IDS_KEY], (session) => {
          sendResponse({
            enabled: tabIsEnabled(
              sender.tab.id,
              value.activationMode ?? "manual",
              value.enabledTabIds,
              session[DISMISSED_BALL_TAB_IDS_KEY],
            ),
            frameId: sender.frameId ?? 0,
          });
        });
      });
      return true;
    }
    if (msg?.type === "DISMISS_FLOATING_BALL" && sender.tab?.id != null) {
      const tabId = sender.tab.id;
      chrome.storage.session.get([DISMISSED_BALL_TAB_IDS_KEY], (session) => {
        const ids = Array.isArray(session[DISMISSED_BALL_TAB_IDS_KEY])
          ? session[DISMISSED_BALL_TAB_IDS_KEY].filter((id: unknown) =>
              Number.isInteger(id),
            )
          : [];
        chrome.storage.session.set(
          {
            [DISMISSED_BALL_TAB_IDS_KEY]: Array.from(new Set([...ids, tabId])),
          },
          () => {
            void chrome.runtime
              .sendMessage({
                type: "BALL_VISIBILITY_CHANGED",
                tabId,
                enabled: false,
              })
              .catch(() => {});
            sendResponse({ ok: true, enabled: false });
          },
        );
      });
      return true;
    }
    if (
      msg?.type === "ENABLE_CURRENT_TAB" ||
      msg?.type === "DISABLE_CURRENT_TAB"
    ) {
      const tabId = Number(msg.tabId);
      if (!Number.isInteger(tabId)) {
        sendResponse({ ok: false });
        return true;
      }
      chrome.storage.local.get(["enabledTabIds"], (value) => {
        const ids = Array.isArray(value.enabledTabIds)
          ? value.enabledTabIds.filter((id: unknown) => Number.isInteger(id))
          : [];
        const enabling = msg.type === "ENABLE_CURRENT_TAB";
        const next = enabling
          ? Array.from(new Set([...ids, tabId]))
          : ids.filter((id: number) => id !== tabId);
        chrome.storage.session.get([DISMISSED_BALL_TAB_IDS_KEY], (session) => {
          const dismissed = Array.isArray(session[DISMISSED_BALL_TAB_IDS_KEY])
            ? session[DISMISSED_BALL_TAB_IDS_KEY].filter((id: unknown) =>
                Number.isInteger(id),
              )
            : [];
          const nextDismissed = enabling
            ? dismissed.filter((id: number) => id !== tabId)
            : Array.from(new Set([...dismissed, tabId]));
          chrome.storage.local.set({ enabledTabIds: next }, () => {
            chrome.storage.session.set(
              { [DISMISSED_BALL_TAB_IDS_KEY]: nextDismissed },
              () => {
                if (enabling) void ensureContentScript(tabId);
                void chrome.tabs
                  .sendMessage(tabId, { type: "REFRESH_PAGE_ENABLED" })
                  .catch(() => {});
                sendResponse({ ok: true, enabled: enabling });
              },
            );
          });
        });
      });
      return true;
    }
    if (msg?.type === "GET_TAB_ENABLED") {
      const tabId = Number(msg.tabId);
      chrome.storage.local.get(["activationMode", "enabledTabIds"], (value) => {
        chrome.storage.session.get([DISMISSED_BALL_TAB_IDS_KEY], (session) => {
          const enabled = tabIsEnabled(
            tabId,
            value.activationMode ?? "manual",
            value.enabledTabIds,
            session[DISMISSED_BALL_TAB_IDS_KEY],
          );
          sendResponse({
            enabled,
          });
          if (enabled) void ensureContentScript(tabId);
        });
      });
      return true;
    }
    if (msg?.type === "CAPTURE_SCREENSHOT") {
      const tabId = Number(msg.tabId);
      const fallbackWindowId = Number(msg.windowId);
      if (!Number.isInteger(tabId) && !Number.isInteger(fallbackWindowId)) {
        sendResponse({ ok: false, error: "INVALID_TAB" });
        return true;
      }
      const windowIdPromise = Number.isInteger(tabId)
        ? chrome.tabs.get(tabId).then((tab) => tab.windowId)
        : Promise.resolve(fallbackWindowId);
      windowIdPromise
        .then((windowId) => {
          if (!Number.isInteger(windowId)) throw Error("NO_ACTIVE_WINDOW");
          return chrome.tabs.captureVisibleTab(windowId, { format: "png" });
        })
        .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
        .catch((error: unknown) => {
          const message = String((error as Error)?.message || error || "");
          const normalized = message.toLowerCase();
          const rateLimited = /max_capture|quota|too many|rate limit|频繁/.test(
            normalized,
          );
          const restricted =
            /cannot capture|can't capture|not allowed|permission|restricted|chrome:|edge:|extension:/.test(
              normalized,
            );
          sendResponse({
            ok: false,
            error: rateLimited
              ? "RATE_LIMITED"
              : restricted
                ? "RESTRICTED_PAGE"
                : "CAPTURE_FAILED",
            detail: message.slice(0, 240),
          });
        });
      return true;
    }
  },
);

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get(["enabledTabIds"], (value) => {
    if (
      Array.isArray(value.enabledTabIds) &&
      value.enabledTabIds.includes(tabId)
    ) {
      chrome.storage.local.set({
        enabledTabIds: value.enabledTabIds.filter(
          (id: unknown) => id !== tabId,
        ),
      });
    }
  });
  chrome.storage.session.get([DISMISSED_BALL_TAB_IDS_KEY], (value) => {
    if (
      !Array.isArray(value[DISMISSED_BALL_TAB_IDS_KEY]) ||
      !value[DISMISSED_BALL_TAB_IDS_KEY].includes(tabId)
    ) {
      return;
    }
    chrome.storage.session.set({
      [DISMISSED_BALL_TAB_IDS_KEY]: value[DISMISSED_BALL_TAB_IDS_KEY].filter(
        (id: unknown) => id !== tabId,
      ),
    });
  });
});
