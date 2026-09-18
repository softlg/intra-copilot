export type SseFrame = {
  name: string;
  data: string;
};

/**
 * Parses one complete SSE frame. Multiple data fields are joined with a
 * newline as required by the EventSource wire format.
 */
export function parseSseFrame(frame: string): SseFrame | null {
  let name = "";
  const data: string[] = [];
  for (const rawLine of frame.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(":")) continue;
    const colon = rawLine.indexOf(":");
    if (colon < 0) continue;
    const field = rawLine.slice(0, colon);
    const value = rawLine.slice(colon + 1).replace(/^ /, "");
    if (field === "event") name = value;
    else if (field === "data") data.push(value);
  }
  if (!name || data.length === 0) return null;
  return { name, data: data.join("\n") };
}

export function consumeSseBuffer(
  buffer: string,
  onFrame: (frame: SseFrame) => void,
): string {
  let remaining = buffer;
  while (true) {
    const boundary = remaining.search(/\r?\n\r?\n/);
    if (boundary < 0) return remaining;
    const separator = remaining.slice(boundary).match(/^\r?\n\r?\n/)?.[0] ?? "";
    const parsed = parseSseFrame(remaining.slice(0, boundary));
    if (parsed) onFrame(parsed);
    remaining = remaining.slice(boundary + separator.length);
  }
}
