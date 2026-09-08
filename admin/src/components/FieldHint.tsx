import type { ReactNode } from "react";
import "./FieldHint.css";

export interface FieldHintProps {
  children: ReactNode;
  tone?: "info" | "warning" | "error";
  id?: string;
}

/**
 * Helper text rendered below a form field. Pair with `aria-describedby` on the
 * input so screen readers announce the hint together with the field value.
 */
export function FieldHint({ children, tone = "info", id }: FieldHintProps) {
  return (
    <p
      id={id}
      className={`field-hint field-hint-${tone}`}
      role={tone === "error" ? "alert" : undefined}
    >
      {children}
    </p>
  );
}
