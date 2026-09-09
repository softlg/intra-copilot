import { Icon } from "./Icon";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import "./Toast.css";

export type ToastKind = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  /** milliseconds, default 4000 */
  duration?: number;
  /**
   * Optional inline action button (e.g. "撤销" / "查看"). Clicking
   * the action dismisses the toast and runs the handler.
   */
  action?: { label: string; onAction: () => void };
}

const DEFAULTS: Record<ToastKind, number> = {
  success: 3000,
  info: 3500,
  warning: 5000,
  error: 6000,
};

const MAX_VISIBLE = 3;

type Listener = (items: ToastItem[]) => void;

class ToastBus {
  private items: ToastItem[] = [];
  private listeners = new Set<Listener>();

  getSnapshot = (): ToastItem[] => this.items;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  push(
    kind: ToastKind,
    message: string,
    options?: {
      duration?: number;
      action?: ToastItem["action"];
    },
  ): string {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const item: ToastItem = {
      id,
      kind,
      message,
      duration: options?.duration ?? DEFAULTS[kind],
      action: options?.action,
    };
    this.items = [...this.items, item].slice(-MAX_VISIBLE);
    this.emit();
    return id;
  }

  dismiss(id: string): void {
    this.items = this.items.filter((item) => item.id !== id);
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.items));
  }
}

const bus = new ToastBus();

/** Imperative API used by event handlers and async flows. */
export const toast = {
  success: (
    message: string,
    options?: {
      duration?: number;
      action?: ToastItem["action"];
    },
  ) => bus.push("success", message, options),
  error: (
    message: string,
    options?: {
      duration?: number;
      action?: ToastItem["action"];
    },
  ) => bus.push("error", message, options),
  warning: (
    message: string,
    options?: {
      duration?: number;
      action?: ToastItem["action"];
    },
  ) => bus.push("warning", message, options),
  info: (
    message: string,
    options?: {
      duration?: number;
      action?: ToastItem["action"];
    },
  ) => bus.push("info", message, options),
  dismiss: (id: string) => bus.dismiss(id),
};

/** React hook used inside the root component to subscribe to the toast bus. */
export function useToastItems(): ToastItem[] {
  return useSyncExternalStore(bus.subscribe, bus.getSnapshot, bus.getSnapshot);
}

function ToastView({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: () => void;
}) {
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const duration = item.duration ?? DEFAULTS[item.kind];
    if (duration <= 0) return;
    timerRef.current = window.setTimeout(onDismiss, duration);
    return () => {
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [item.duration, item.kind, onDismiss]);

  return (
    <div
      className={`toast toast-${item.kind}`}
      role={item.kind === "error" ? "alert" : "status"}
    >
      <span className="toast-icon" aria-hidden="true">
        <Icon
          name={
            item.kind === "success"
              ? "check"
              : item.kind === "info"
                ? "info"
                : item.kind === "warning"
                  ? "warn"
                  : "alert"
          }
          size={14}
        />
      </span>
      <span className="toast-message">{item.message}</span>
      {item.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            item.action?.onAction();
            onDismiss();
          }}
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        className="toast-close"
        aria-label="关闭"
        onClick={onDismiss}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const items = useToastItems();
  const [, force] = useState(0);
  // Trigger a re-render only when items actually change.
  useEffect(() => {
    force((n) => n + 1);
  }, [items]);
  const handleDismiss = useCallback((id: string) => bus.dismiss(id), []);

  if (items.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite" aria-atomic="false">
      {items.map((item) => (
        <ToastView
          key={item.id}
          item={item}
          onDismiss={() => handleDismiss(item.id)}
        />
      ))}
    </div>
  );
}
