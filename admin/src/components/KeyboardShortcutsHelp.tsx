import { isMac, shortcutHint } from "./useKeyboardShortcuts";

export interface ShortcutHelpItem {
  keys: string[];
  description: string;
}

export interface KeyboardShortcutsHelpProps {
  items: ShortcutHelpItem[];
  onClose: () => void;
}

function renderKey(key: string): string {
  if (key === "Escape") return "Esc";
  if (key === "ctrl") return isMac ? "⌘" : "Ctrl";
  if (key === "shift") return isMac ? "⇧" : "Shift";
  return key.toUpperCase();
}

export function KeyboardShortcutsHelp({
  items,
  onClose,
}: KeyboardShortcutsHelpProps) {
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kbd-help-title"
      onClick={onClose}
    >
      <div
        className="modal kbd-help-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h3 id="kbd-help-title">键盘快捷键</h3>
          <button
            className="modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <p className="modal-subtitle">
          {isMac ? "macOS" : "Windows/Linux"} · 按{" "}
          <kbd>Esc</kbd> 关闭弹窗
        </p>
        <ul className="kbd-help-list">
          {items.map((item) => (
            <li key={item.keys.join("+")}>
              <span className="kbd-help-desc">{item.description}</span>
              <span className="kbd-help-keys">
                {item.keys.map((key, index) => (
                  <kbd key={`${key}-${index}`}>{renderKey(key)}</kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="muted">
          {shortcutHint(["shift"])} + <kbd>/</kbd> 随时打开此弹窗
        </p>
      </div>
    </div>
  );
}