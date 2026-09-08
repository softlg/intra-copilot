import { useEffect, useRef, type ReactNode } from "react";
import "./ConfirmDialog.css";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
  /** Disable confirm button while a request is in flight. */
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "primary",
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    // Focus the cancel button by default for destructive actions.
    cancelRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previousFocus.current?.focus?.();
    };
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="confirm-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !loading) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? "confirm-dialog-desc" : undefined}
      >
        <h3 id="confirm-dialog-title" className="confirm-title">
          {title}
        </h3>
        {description && (
          <div id="confirm-dialog-desc" className="confirm-description">
            {description}
          </div>
        )}
        <div className="confirm-actions">
          <button
            ref={cancelRef}
            type="button"
            className="secondary"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === "danger" ? "confirm-danger" : ""}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
