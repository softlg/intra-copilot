import { afterEach, describe, expect, it, vi } from "vitest";
import { collectContextsFromTab, ensureActionContentScript } from "./browser";

const fallbackContext = {
  url: "https://example.com/orders",
  title: "Orders",
  selection: "",
  visibleText: "Order list",
  domSummary: "ref_1 <table>",
  timestamp: "2026-09-20T00:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("collectContextsFromTab", () => {
  it("normalizes main-world fallback context when content scripts are unavailable", async () => {
    vi.stubGlobal("chrome", {
      webNavigation: {
        getAllFrames: vi.fn().mockResolvedValue([{ frameId: 0 }]),
      },
      tabs: {
        sendMessage: vi.fn().mockRejectedValue(new Error("No receiver")),
      },
      scripting: {
        executeScript: vi
          .fn()
          .mockResolvedValue([{ frameId: 0, result: fallbackContext }]),
      },
    });

    await expect(collectContextsFromTab(12)).resolves.toEqual([
      {
        ...fallbackContext,
        frameId: 0,
        snapshotId: "",
      },
    ]);
  });

  it("keeps accessible frame context when another frame cannot be injected", async () => {
    vi.stubGlobal("chrome", {
      webNavigation: {
        getAllFrames: vi
          .fn()
          .mockResolvedValue([{ frameId: 0 }, { frameId: 7 }]),
      },
      tabs: {
        sendMessage: vi.fn().mockRejectedValue(new Error("No receiver")),
      },
      scripting: {
        executeScript: vi.fn().mockImplementation(async (options: any) => {
          if (options.target.frameIds?.[0] === 7) {
            throw new Error("Restricted frame");
          }
          return [{ frameId: 0, result: fallbackContext }];
        }),
      },
    });

    await expect(collectContextsFromTab(12)).resolves.toEqual([
      {
        ...fallbackContext,
        frameId: 0,
        snapshotId: "",
      },
    ]);
  });
});

describe("ensureActionContentScript", () => {
  it("injects the persistent content script when no receiver exists", async () => {
    const executeScript = vi.fn().mockResolvedValue([]);
    vi.stubGlobal("chrome", {
      tabs: {
        sendMessage: vi
          .fn()
          .mockRejectedValue(new Error("Could not establish connection")),
      },
      scripting: { executeScript },
    });

    await ensureActionContentScript(12);

    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 12, allFrames: true },
      files: ["content.js"],
    });
  });

  it("does not inject when the content script already responds", async () => {
    const executeScript = vi.fn();
    vi.stubGlobal("chrome", {
      tabs: {
        sendMessage: vi.fn().mockResolvedValue({ ok: true }),
      },
      scripting: { executeScript },
    });

    await ensureActionContentScript(12);

    expect(executeScript).not.toHaveBeenCalled();
  });
});
