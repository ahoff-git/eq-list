"use client";

/**
 * Damage per second across a fight, as a tiny bar chart. A single DPS number can't tell
 * a steady grind from an opening burst that fell off a cliff — the shape can, and it's
 * where you see adds arriving or a nuke landing.
 *
 * Inline SVG on purpose: no chart dependency, scales with the window, and the values are
 * already bucketed per second by the tracker.
 */
export default function Sparkline({
  values,
  height = 28,
  title,
}: {
  values: number[];
  height?: number;
  title?: string;
}) {
  if (values.length < 2) return null;

  const peak = Math.max(...values);
  if (peak <= 0) return null;

  // A 100-wide viewBox with a non-uniform aspect ratio lets the bars stretch to whatever
  // width the panel gives us, while the height stays fixed.
  const width = 100;
  const barWidth = width / values.length;

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      height={height}
      role="img"
      aria-label={title ?? "Damage per second"}
    >
      <title>{title ?? `Damage per second · peak ${peak.toLocaleString()}`}</title>
      {values.map((v, i) => {
        const h = (v / peak) * height;
        return <rect key={i} x={i * barWidth} y={height - h} width={Math.max(barWidth * 0.8, 0.4)} height={h} />;
      })}
    </svg>
  );
}
