import type { StatSummary } from "@/lib/stats/calculators";

/** Simple inline-SVG line chart for the per-game trend. */
export function TrendChart({ trend }: { trend: StatSummary["trend"] }) {
  const w = 640;
  const h = 200;
  const pad = 28;
  if (trend.length < 2) {
    return <p style={{ color: "var(--muted)" }}>Not enough games to chart a trend.</p>;
  }

  const values = trend.map((t) => t.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const x = (i: number) => pad + (i / (trend.length - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad);

  const path = trend
    .map((t, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(t.value).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Trend chart">
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="var(--border)" />
      <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="var(--border)" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} />
      {trend.map((t, i) => (
        <circle key={i} cx={x(i)} cy={y(t.value)} r={2.5} fill="var(--accent)" />
      ))}
      <text x={pad} y={pad - 8} fill="var(--muted)" fontSize="11">
        {max.toFixed(1)}
      </text>
      <text x={pad} y={h - pad + 16} fill="var(--muted)" fontSize="11">
        {min.toFixed(1)}
      </text>
    </svg>
  );
}

/** Inline-SVG histogram for the per-game distribution. */
export function DistributionChart({
  distribution,
}: {
  distribution: StatSummary["distribution"];
}) {
  if (distribution.length === 0) return null;
  const maxCount = Math.max(...distribution.map((d) => d.count), 1);
  const barW = 38;
  const gap = 10;
  const h = 160;
  const w = distribution.length * (barW + gap) + gap;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Distribution">
      {distribution.map((d, i) => {
        const barH = (d.count / maxCount) * (h - 40);
        const x = gap + i * (barW + gap);
        return (
          <g key={d.bucket}>
            <rect
              x={x}
              y={h - 24 - barH}
              width={barW}
              height={barH}
              fill="var(--accent)"
              rx={3}
            />
            <text x={x + barW / 2} y={h - 8} textAnchor="middle" fill="var(--muted)" fontSize="11">
              {d.bucket}
            </text>
            <text
              x={x + barW / 2}
              y={h - 30 - barH}
              textAnchor="middle"
              fill="var(--fg)"
              fontSize="11"
            >
              {d.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
