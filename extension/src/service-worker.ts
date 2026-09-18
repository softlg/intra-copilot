import { originPattern } from "./lib/url";

const SIDE_PANEL_PATH = "sidepanel.html";
const SIDE_PANEL_ALL_TABS_KEY = "sidePanelAllTabs";
const DISMISSED_BALL_TAB_IDS_KEY = "dismissedBallTabIds";
let sidePanelAllTabs = false;

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
