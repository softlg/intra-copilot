const SIDE_PANEL_PATH = "sidepanel.html";
const SIDE_PANEL_ALL_TABS_KEY = "sidePanelAllTabs";
let sidePanelAllTabs = false;

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
  await applySidePanelMode(value[SIDE_PANEL_ALL_TABS_KEY] === true);
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
});

function tabIsEnabled(tabId: number, mode: unknown, enabled: unknown) {
  return (
    mode === "all_pages" || (Array.isArray(enabled) && enabled.includes(tabId))
  );
}

chrome.runtime.onMessage.addListener(
  (msg: any, sender: any, sendResponse: any) => {
    if (
      msg?.type === "OPEN_SIDE_PANEL" &&
      sender.tab?.id != null &&
      sender.tab?.windowId != null
    ) {
      openSidePanelForTab(sender.tab.id, sender.tab.windowId);
    }
    if (msg?.type === "CONTENT_READY" && sender.tab?.id != null) {
      chrome.storage.local.get(["activationMode", "enabledTabIds"], (value) => {
        sendResponse({
          enabled: tabIsEnabled(
            sender.tab.id,
            value.activationMode ?? "manual",
            value.enabledTabIds,
          ),
        });
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
        const next =
          msg.type === "ENABLE_CURRENT_TAB"
            ? Array.from(new Set([...ids, tabId]))
            : ids.filter((id: number) => id !== tabId);
        chrome.storage.local.set({ enabledTabIds: next }, () =>
          sendResponse({
            ok: true,
            enabled: msg.type === "ENABLE_CURRENT_TAB",
          }),
        );
      });
      return true;
    }
    if (msg?.type === "GET_TAB_ENABLED") {
      const tabId = Number(msg.tabId);
      chrome.storage.local.get(["activationMode", "enabledTabIds"], (value) => {
        sendResponse({
          enabled: tabIsEnabled(
            tabId,
            value.activationMode ?? "manual",
            value.enabledTabIds,
          ),
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
      !Array.isArray(value.enabledTabIds) ||
      !value.enabledTabIds.includes(tabId)
    ) {
      return;
    }
    chrome.storage.local.set({
      enabledTabIds: value.enabledTabIds.filter((id: unknown) => id !== tabId),
    });
  });
});
