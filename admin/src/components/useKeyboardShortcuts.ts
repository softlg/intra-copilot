import { useEffect } from "react";

export interface ShortcutBinding {
  /** Key combo without modifier prefix, e.g. "k", "Escape". */
  key: string;
  /** "ctrl" matches Ctrl (Win/Linux) or Cmd (Mac); "shift" matches Shift. */
  modifiers?: Array<"ctrl" | "shift" | "alt">;
  /** Description for screen readers / hint text. */
  description: string;
  /** Called when the combo is detected; return false to keep the event alive. */
  handler: (event: KeyboardEvent) => void | boolean;
}

function matches(event: KeyboardEvent, binding: ShortcutBinding): boolean {
  if (event.key.toLowerCase() !== binding.key.toLowerCase()) return false;
  const required = new Set(binding.modifiers ?? []);
  const ctrl =
    event.ctrlKey || event.metaKey
      ? required.has("ctrl")
      : !required.has("ctrl");
  const shift = required.has("shift") ? event.shiftKey : !event.shiftKey;
  const alt = required.has("alt") ? event.altKey : !event.altKey;
  return ctrl && shift && alt;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export interface UseKeyboardShortcutsOptions {
  /** Bindings evaluated in order; first match wins. */
  bindings: ShortcutBinding[];
  /**
   * When true, skip handling if the user is typing into an input /
   * textarea / contentEditable. Defaults to true. Modal-scoped
   * shortcuts can opt out.
   */
  skipInInputs?: boolean;
}

/**
 * Global keyboard shortcuts hook. Listens at the document level so the
 * shortcuts fire regardless of which section of the admin is mounted.
 */
export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions) {
  const { bindings, skipInInputs = true } = options;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (skipInInputs && isTypingTarget(event.target)) return;
      for (const binding of bindings) {
        if (matches(event, binding)) {
          const result = binding.handler(event);
          if (result === false) return;
          event.preventDefault();
          return;
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [bindings, skipInInputs]);
}

export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

export function shortcutHint(modifiers: Array<"ctrl" | "shift">): string {
  const parts: string[] = [];
  for (const mod of modifiers) {
    if (mod === "ctrl") parts.push(isMac ? "⌘" : "Ctrl");
    if (mod === "shift") parts.push(isMac ? "⇧" : "Shift");
  }
  return parts.join(" + ");
}
