import { describe, expect, it } from "vitest";
import { consumeSseBuffer, parseSseFrame } from "../../../shared/protocol/sse";

describe("SSE protocol", () => {
  it("preserves data spacing and joins multiple data lines", () => {
    expect(parseSseFrame('event: token\ndata: {"text":"a"}\ndata: b')).toEqual({
      name: "token",
      data: '{"text":"a"}\nb',
    });
  });

  it("consumes frames across partial buffers", () => {
    const received: string[] = [];
    const remaining = consumeSseBuffer(
      "event: token\ndata: one\n\nevent: token\ndata: two",
      (frame) => received.push(frame.data),
    );
    expect(received).toEqual(["one"]);
    expect(remaining).toBe("event: token\ndata: two");
  });
});
