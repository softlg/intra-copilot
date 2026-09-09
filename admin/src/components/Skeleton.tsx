import type { CSSProperties } from "react";

export interface SkeletonProps {
  /** Width as a CSS length. Defaults to 100%. */
  width?: string | number;
  /** Height as a CSS length. Defaults to 12px. */
  height?: string | number;
  /** Border radius override. Defaults to 4px. */
  radius?: string | number;
  /** Extra class names. */
  className?: string;
  /** Inline style override. */
  style?: CSSProperties;
}

/**
 * A single shimmering placeholder block. Use the `Skeleton.*`
 * convenience helpers below to compose common shapes.
 */
export function Skeleton({
  width = "100%",
  height = "12px",
  radius = "4px",
  className,
  style,
}: SkeletonProps) {
  return (
    <span
      role="presentation"
      aria-hidden="true"
      className={["skeleton", className].filter(Boolean).join(" ")}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        borderRadius: typeof radius === "number" ? `${radius}px` : radius,
        ...style,
      }}
    />
  );
}

/** A single horizontal text-line placeholder. */
Skeleton.Line = function SkeletonLine({
  width = "100%",
}: Pick<SkeletonProps, "width">) {
  return <Skeleton width={width} className="skeleton-line" />;
};

/** A circular placeholder, useful for avatars / icons. */
Skeleton.Circle = function SkeletonCircle({ size = 28 }: { size?: number }) {
  return (
    <Skeleton
      width={size}
      height={size}
      radius="50%"
      className="skeleton-circle"
    />
  );
};

/** A single resource card placeholder. */
Skeleton.Card = function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <div className="skeleton-card-row">
        <Skeleton.Circle />
        <Skeleton.Line width="40%" />
        <span style={{ marginLeft: "auto" }}>
          <Skeleton width="60px" height="20px" radius="999px" />
        </span>
      </div>
      <Skeleton.Line width="30%" />
      <Skeleton.Line width="90%" />
      <Skeleton.Line width="70%" />
    </div>
  );
};

/** A list of resource card placeholders. */
Skeleton.CardList = function SkeletonCardList({
  count = 6,
}: {
  count?: number;
}) {
  return (
    <div
      className="grid"
      role="presentation"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: count }, (_, i) => (
        <Skeleton.Card key={i} />
      ))}
    </div>
  );
};

/** A table-row placeholder. */
Skeleton.Row = function SkeletonRow({ cells = 4 }: { cells?: number }) {
  return (
    <div
      className="skeleton-card-row"
      role="presentation"
      style={{ padding: "10px 0" }}
    >
      {Array.from({ length: cells }, (_, i) => (
        <Skeleton key={i} width={`${80 - i * 12}%`} height="14px" />
      ))}
    </div>
  );
};
