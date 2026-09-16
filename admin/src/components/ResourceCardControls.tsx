import { Icon } from "./Icon";

export interface ResourceCardControlsProps {
  enabled: boolean;
  busy: boolean;
  enableLabel: string;
  disableLabel: string;
  deleteLabel: string;
  deleteDisabledHint: string;
  onToggle: () => void;
  onDelete: () => void;
}

export function ResourceCardControls({
  enabled,
  busy,
  enableLabel,
  disableLabel,
  deleteLabel,
  deleteDisabledHint,
  onToggle,
  onDelete,
}: ResourceCardControlsProps) {
  const toggleLabel = enabled ? disableLabel : enableLabel;

  return (
    <div
      className="agent-card-controls"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <label className="switch agent-card-switch" title={toggleLabel}>
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          aria-label={toggleLabel}
          disabled={busy}
          onChange={onToggle}
        />
        <span className="switch-track" aria-hidden="true" />
      </label>
      <button
        type="button"
        className="agent-card-delete"
        aria-label={deleteLabel}
        title={enabled ? deleteDisabledHint : deleteLabel}
        disabled={busy || enabled}
        onClick={onDelete}
      >
        <Icon name="trash" size={16} />
      </button>
    </div>
  );
}
