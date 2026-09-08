import { useEffect, useRef, useState, type ReactNode } from "react";
import "./Dropdown.css";

export interface DropdownItem {
  key: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  icon?: ReactNode;
}

export interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  ariaLabel: string;
  align?: "left" | "right";
}

/**
 * Simple menu rendered as a button that toggles a list of actions. Used to
 * hide destructive actions (stop, delete) behind a "more" affordance on
 * resource cards.
 */
export function Dropdown({
  trigger,
  items,
  ariaLabel,
  align = "right",
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="dropdown" ref={containerRef}>
      <button
        type="button"
        className="dropdown-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open && (
        <ul className={`dropdown-menu dropdown-${align}`} role="menu">
          {items.map((item) => (
            <li key={item.key} role="none">
              <button
                type="button"
                role="menuitem"
                className={`dropdown-item${item.tone === "danger" ? " dropdown-item-danger" : ""}`}
                onClick={() => {
                  setOpen(false);
                  if (!item.disabled) item.onSelect();
                }}
                disabled={item.disabled}
              >
                {item.icon && (
                  <span className="dropdown-icon">{item.icon}</span>
                )}
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
