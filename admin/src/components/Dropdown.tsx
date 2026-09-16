import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>();

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (
        !containerRef.current?.contains(event.target as Node) &&
        !menuRef.current?.contains(event.target as Node)
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

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(undefined);
      return undefined;
    }

    const updatePosition = () => {
      const triggerElement = triggerRef.current;
      const menuElement = menuRef.current;
      if (!triggerElement || !menuElement) return;

      const zoom =
        Number.parseFloat(
          window.getComputedStyle(document.documentElement).zoom || "1",
        ) || 1;
      const triggerRect = triggerElement.getBoundingClientRect();
      const trigger = {
        top: triggerRect.top / zoom,
        right: triggerRect.right / zoom,
        bottom: triggerRect.bottom / zoom,
        left: triggerRect.left / zoom,
      };
      const menuWidth = menuElement.offsetWidth;
      const menuHeight = menuElement.offsetHeight;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;

      const viewportPadding = 8;
      const gap = 6;
      const fitsBelow =
        trigger.bottom + gap + menuHeight <= viewportHeight - viewportPadding;
      const top = fitsBelow
        ? trigger.bottom + gap
        : Math.max(viewportPadding, trigger.top - gap - menuHeight);
      const preferredLeft =
        align === "right" ? trigger.right - menuWidth : trigger.left;
      const left = Math.min(
        Math.max(viewportPadding, preferredLeft),
        Math.max(viewportPadding, viewportWidth - menuWidth - viewportPadding),
      );

      setMenuStyle({ top, left, visibility: "visible" });
    };

    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [align, open]);

  const menu = open ? (
    <ul
      ref={menuRef}
      className={`dropdown-menu dropdown-${align}`}
      role="menu"
      style={menuStyle}
    >
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
            {item.icon && <span className="dropdown-icon">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <div className="dropdown" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="dropdown-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {menu && createPortal(menu, document.body)}
    </div>
  );
}
