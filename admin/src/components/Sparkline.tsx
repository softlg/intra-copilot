export interface SparklinePoint {
  /** x-axis label (e.g. "9/03" or "Mon"). Shown in the tooltip only. */
  label: string;
  /** Numeric value to render. Negative values are clamped at zero. */
  value: number;
}

export interface SparklineProps {
  points: SparklinePoint[];
  /** Total width in pixels; height is fixed to 32. */
  width?: number;
  height?: number;
  /** Optional fixed upper bound; otherwise auto-scales to max(point.value). */
  maxValue?: number;
  /** Stroke colour; defaults to the brand token. */
  stroke?: string;
  /** Fill colour under the line; defaults to a translucent brand. */
  fill?: string;
  /** Accessible label. */
  ariaLabel?: string;
}

/**
 * Tiny inline SVG line+area chart. Designed to live next to a single
 * metric (e.g. "rating count over the last 7 days") without pulling
 * in a charting library. Pure SVG so it renders crisp on every
 * density and responds to the active theme through CSS variables.
 */
export function Sparkline({
  points,
  width = 120,
  height = 32,
  maxValue,
  stroke = "var(--brand)",
  fill = "var(--brand-fill, rgba(79, 128, 232, 0.18))",
  ariaLabel,
}: SparklineProps) {
  if (points.length === 0) {
    return (
      <div
        className="sparkline sparkline-empty"
        style={{ width, height }}
        aria-label={ariaLabel ?? "no data"}
        role="img"
      />
    );
  }

  const max = Math.max(
    1,
    maxValue ?? Math.max(...points.map((point) => Math.max(0, point.value))),
  );
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const padY = 4;
  const usable = height - padY * 2;

  const coords = points.map((point, index) => {
    const safe = Math.max(0, point.value);
    const x = points.length === 1 ? width / 2 : index * stepX;
    const y = padY + (1 - safe / max) * usable;
    return { x, y };
  });

  const linePath = coords
    .map((coord, index) =>
      `${index === 0 ? "M" : "L"}${coord.x.toFixed(2)},${coord.y.toFixed(2)}`,
    )
    .join(" ");
  const areaPath = `${linePath} L${(width).toFixed(2)},${(height - padY).toFixed(2)} L0,${(height - padY).toFixed(2)} Z`;

  return (
    <svg
      className="sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={
        ariaLabel ??
        points
          .map((point) => `${point.label}: ${point.value}`)
          .join(", ")
      }
    >
      <path d={areaPath} fill={fill} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {coords.map((coord, index) => (
        <circle
          key={index}
          cx={coord.x}
          cy={coord.y}
          r={1.5}
          fill={stroke}
        />
      ))}
    </svg>
  );
}
