chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
  chrome.storage.local.get(["activationMode", "enabledTabIds"], (value) => {
    const defaults: Record<string, unknown> = {};
    if (
      value.activationMode !== "all_pages" &&
      value.activationMode !== "manual"
    ) {
      defaults.activationMode = "manual";
    }
    if (!Array.isArray(value.enabledTabIds)) defaults.enabledTabIds = [];
    if (Object.keys(defaults).length) chrome.storage.local.set(defaults);
  });
});
function tabIsEnabled(tabId: number, mode: unknown, enabled: unknown) {
  return (
    mode === "all_pages" || (Array.isArray(enabled) && enabled.includes(tabId))
  );
}

chrome.runtime.onMessage.addListener(
  (msg: any, sender: any, sendResponse: any) => {
    if (msg?.type === "OPEN_SIDE_PANEL" && sender.tab?.windowId !== undefined) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {});
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
      const windowId = Number(msg.windowId);
      if (!Number.isInteger(windowId)) {
        sendResponse({ ok: false, error: "INVALID_WINDOW" });
        return true;
      }
      chrome.tabs
        .captureVisibleTab(windowId, { format: "png" })
        .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
        .catch((error: unknown) => {
          const message = String((error as Error)?.message || error || "");
          const restricted = /cannot|not allowed|permission|capture/i.test(
            message,
          );
          sendResponse({
            ok: false,
            error: restricted ? "RESTRICTED_PAGE" : "CAPTURE_FAILED",
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
