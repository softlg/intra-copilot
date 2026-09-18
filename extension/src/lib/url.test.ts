import { describe, expect, it } from "vitest";
import { originPattern } from "./url";

describe("originPattern", () => {
  it("derives an origin-scoped permission from http pages", () => {
    expect(originPattern("https://example.com/path?q=1")).toBe(
      "https://example.com/*",
    );
  });

  it("rejects non-http pages", () => {
    expect(originPattern("chrome://extensions")).toBeUndefined();
    expect(originPattern("not a url")).toBeUndefined();
  });
});
