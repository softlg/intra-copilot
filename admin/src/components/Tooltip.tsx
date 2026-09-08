import { useEffect, useRef, useState, type ReactNode } from "react";
import "./Tooltip.css";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  /** Where to place the tooltip relative to the trigger. */
  placement?: "top" | "bottom";
  /** Optional className for the trigger wrapper. */
  className?: string;
  /** Optional max width override. */
  maxWidth?: number;
}

/**
 * Lightweight, keyboard-accessible tooltip. The tooltip becomes visible on
 * focus or mouseenter and hides on blur / mouseleave / Escape. The trigger
 * must be a focusable element (button, anchor, or [tabindex]).
 */
export function Tooltip({
  content,
  children,
  placement = "top",
  className,
  maxWidth = 280,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (closeTimer.current !== undefined) {
        window.clearTimeout(closeTimer.current);
      }
    };
  }, []);

  const show = () => {
    if (closeTimer.current !== undefined) {
      window.clearTimeout(closeTimer.current);
    }
    setOpen(true);
  };

  const scheduleHide = () => {
    if (closeTimer.current !== undefined) {
      window.clearTimeout(closeTimer.current);
    }
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  return (
    <span
      ref={ref}
      className={`tooltip-anchor${className ? ` ${className}` : ""}`}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onFocus={show}
      onBlur={scheduleHide}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={`tooltip-bubble tooltip-${placement}`}
          style={{ maxWidth }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
