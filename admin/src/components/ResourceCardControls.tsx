import { Icon } from "./Icon";

export interface ResourceCardControlsProps {
  enabled: boolean;
  busy: boolean;
  enableLabel: string;
  disableLabel: string;
  deleteLabel: string;
  deleteDisabledHint: string;
  toggleDisabled?: boolean;
  toggleDisabledHint?: string;
  deleteDisabled?: boolean;
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
  toggleDisabled = false,
  toggleDisabledHint,
  deleteDisabled = false,
  onToggle,
  onDelete,
}: ResourceCardControlsProps) {
  const toggleLabel = enabled ? disableLabel : enableLabel;
  const toggleUnavailable = busy || toggleDisabled;
  const deleteUnavailable = busy || enabled || deleteDisabled;

  return (
    <div
      className="agent-card-controls"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <label
        className="switch agent-card-switch"
        title={
          toggleDisabled ? (toggleDisabledHint ?? toggleLabel) : toggleLabel
        }
      >
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          aria-label={
            toggleDisabled ? (toggleDisabledHint ?? toggleLabel) : toggleLabel
          }
          disabled={toggleUnavailable}
          onChange={onToggle}
        />
        <span className="switch-track" aria-hidden="true" />
      </label>
      <button
        type="button"
        className="agent-card-delete"
        aria-label={deleteLabel}
        title={enabled || deleteDisabled ? deleteDisabledHint : deleteLabel}
        disabled={deleteUnavailable}
        onClick={onDelete}
      >
        <Icon name="trash" size={16} />
      </button>
    </div>
  );
}
