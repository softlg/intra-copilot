import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("originAllowed", () => {
  it("matches exact and wildcard origins", async () => {
    vi.stubGlobal("chrome", {
      runtime: { getManifest: () => ({ version: "test" }) },
    });
    const { originAllowed } = await import("./browser-runtime");

    expect(
      originAllowed('["https://example.com"]', "https://example.com/a"),
    ).toBe(true);
    expect(
      originAllowed('["*.example.com"]', "https://app.example.com/a"),
    ).toBe(true);
    expect(
      originAllowed('["https://example.com"]', "https://evil.example"),
    ).toBe(false);
  });

  it("allows all origins when the allowlist is empty", async () => {
    vi.stubGlobal("chrome", {
      runtime: { getManifest: () => ({ version: "test" }) },
    });
    const { originAllowed } = await import("./browser-runtime");

    expect(originAllowed("[]", "https://any.example/path")).toBe(true);
  });
});
