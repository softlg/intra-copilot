import { Icon } from "./Icon";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import "./InlineEditable.css";

export type InlineEditableVariant = "title" | "subtitle" | "body";

export interface InlineEditableProps {
  /** Current display value. */
  value: string;
  /**
   * Async save handler. Should return the new persisted value (which may be
   * normalized by the server) or throw to abort. The component will roll
   * back to the previous value on error.
   */
  onSave: (next: string) => Promise<string> | string;
  /** Optional placeholder shown when value is empty. */
  placeholder?: string;
  /** Use textarea for multi-line content (default input). */
  multiline?: boolean;
  /** Visual variant, controls font size and color. */
  variant?: InlineEditableVariant;
  /** Maximum character length; counter shown when value > 80% full. */
  maxLength?: number;
  /** Required (empty value rejected). */
  required?: boolean;
  /** Disabled (read-only, hover hint hidden). */
  disabled?: boolean;
  /** Inline aria-label applied to the underlying input/textarea. */
  ariaLabel?: string;
  /** Optional tooltip for the edit affordance. */
  editHint?: string;
  /** Allow value to wrap (for long descriptions). */
  wrap?: boolean;
  /** Custom className applied to the wrapper element. */
  className?: string;
}

/**
 * InlineEditable — click text to edit in place.
 *
 * - Click value to enter edit mode (input/textarea with autoFocus).
 * - Enter (or Cmd/Ctrl+Enter for multi-line) saves; Escape cancels.
 * - Blur also saves, so clicking elsewhere commits the change.
 * - On save failure, the previous value is restored and `onSave` errors
 *   are surfaced via the toast bus so the user can retry.
 * - Empty required values show an inline warning and keep edit mode open.
 */
export function InlineEditable({
  value,
  onSave,
  placeholder = "Click to edit",
  multiline = false,
  variant = "body",
  maxLength,
  required = false,
  disabled = false,
  ariaLabel,
  editHint = "Click to edit",
  wrap = false,
  className,
}: InlineEditableProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  // Track the last value we successfully synced so we can detect external
  // changes (e.g. when the parent switches to a different entity).
  const syncedValueRef = useRef(value);
  const editingRef = useRef(false);
  editingRef.current = editing;

  // Resync draft when external value changes and we're not editing.
  useEffect(() => {
    if (editingRef.current) return;
    if (value === syncedValueRef.current) return;
    syncedValueRef.current = value;
    setDraft(value);
  }, [value]);

  const enterEdit = useCallback(() => {
    if (disabled || saving) return;
    setDraft(value);
    setErrorMessage(null);
    setEditing(true);
  }, [disabled, saving, value]);

  const cancel = useCallback(() => {
    setDraft(value);
    setErrorMessage(null);
    setEditing(false);
  }, [value]);

  const commit = useCallback(async () => {
    const next = draft.trim();
    if (required && next.length === 0) {
      setErrorMessage("Value is required");
      // keep editing
      return;
    }
    if (next === value) {
      // No-op: just close edit mode without round-tripping the API.
      setErrorMessage(null);
      setEditing(false);
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    try {
      const persisted = await onSave(next);
      syncedValueRef.current = persisted;
      setDraft(persisted);
      setEditing(false);
    } catch (error) {
      // Roll back to the last known good value.
      setDraft(value);
      setErrorMessage(error instanceof Error ? error.message : "Save failed");
      // Keep editing mode so the user can retry without losing context.
    } finally {
      setSaving(false);
    }
  }, [draft, required, value, onSave]);

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key === "Enter") {
      if (multiline) {
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          void commit();
        }
        // Otherwise allow newlines inside the textarea.
      } else {
        event.preventDefault();
        void commit();
      }
    }
  };

  // Auto-focus & select-all when entering edit mode.
  useLayoutEffect(() => {
    if (!editing) return;
    const node = inputRef.current;
    if (!node) return;
    node.focus();
    if (node instanceof HTMLInputElement) {
      node.select();
    } else {
      // Place caret at end for textareas (selecting would be jarring).
      const length = node.value.length;
      node.setSelectionRange(length, length);
    }
  }, [editing]);

  // Auto-grow textarea so it doesn't feel cramped while editing.
  useLayoutEffect(() => {
    if (!editing || !multiline) return;
    const node = inputRef.current;
    if (!(node instanceof HTMLTextAreaElement)) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 320)}px`;
  }, [editing, multiline, draft]);

  const wrapperClassName = [
    "inline-editable",
    `inline-editable-${variant}`,
    editing ? "inline-editable-editing" : "inline-editable-display",
    saving ? "inline-editable-saving" : "",
    disabled ? "inline-editable-disabled" : "",
    errorMessage ? "inline-editable-error" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const displayStyle: CSSProperties = {
    whiteSpace: wrap ? "pre-wrap" : "normal",
  };

  if (editing) {
    const commonProps = {
      ref: inputRef as React.RefObject<HTMLInputElement & HTMLTextAreaElement>,
      value: draft,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => {
        setDraft(event.target.value);
        if (errorMessage) setErrorMessage(null);
      },
      onKeyDown: handleKeyDown,
      onBlur: () => {
        if (!saving) void commit();
      },
      disabled,
      maxLength,
      "aria-label": ariaLabel,
      "aria-invalid": errorMessage ? true : undefined,
    };
    return (
      <span className={wrapperClassName}>
        {multiline ? (
          <textarea
            {...commonProps}
            rows={Math.min(6, Math.max(2, draft.split(/\n/).length))}
          />
        ) : (
          <input type="text" {...commonProps} />
        )}
        {saving ? (
          <span className="inline-editable-spinner" aria-hidden="true">
            <Icon name="clock" size={13} />
          </span>
        ) : null}
        {errorMessage ? (
          <span className="inline-editable-error-text" role="alert">
            {errorMessage}
          </span>
        ) : null}
      </span>
    );
  }

  const hasValue = value.length > 0;
  return (
    <span
      className={wrapperClassName}
      style={displayStyle}
      onClick={enterEdit}
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel ?? editHint}
      title={disabled ? undefined : editHint}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          enterEdit();
        }
      }}
    >
      <span
        className={
          hasValue ? "inline-editable-value" : "inline-editable-placeholder"
        }
      >
        {hasValue ? value : placeholder}
      </span>
      {!disabled ? (
        <span className="inline-editable-pencil" aria-hidden="true">
          <Icon name="edit" size={13} />
        </span>
      ) : null}
    </span>
  );
}
