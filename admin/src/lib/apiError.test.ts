import { describe, expect, it } from "vitest";
import { buildApiError, isUnauthorized } from "./apiError";

describe("buildApiError", () => {
  it("prefers the backend error message", () => {
    const response = new Response(null, { status: 400 });
    const error = buildApiError(
      response,
      JSON.stringify({ error: "字段无效" }),
    );

    expect(error.message).toBe("字段无效");
    expect(error.status).toBe(400);
  });

  it("identifies unauthorized responses", () => {
    const error = buildApiError(new Response(null, { status: 401 }), "");

    expect(isUnauthorized(error)).toBe(true);
  });
});
