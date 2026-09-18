import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("extension manifest permissions", () => {
  it("does not request all-url access at install time", () => {
    const manifest = JSON.parse(
      readFileSync("public/manifest.json", "utf8"),
    ) as {
      host_permissions?: string[];
      optional_host_permissions?: string[];
      content_scripts?: unknown[];
    };

    expect(manifest.host_permissions).not.toContain("<all_urls>");
    expect(manifest.optional_host_permissions).toContain("https://*/*");
    expect(manifest.content_scripts ?? []).toHaveLength(0);
  });
});
