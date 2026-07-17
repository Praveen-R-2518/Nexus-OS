"use client";

import { useMemo, useState } from "react";
import type { MetricsTimeseriesPoint } from "@/types";
import { cn, formatCurrency } from "@/lib/utils";

const W = 640;
const H = 240;
const PAD = { top: 20, right: 20, bottom: 40, left: 52 };

const SERIES = [
  {
    key: "revenue_at_risk" as const,
    name: "Revenue at risk",
    color: "var(--chart-1)",
    dash: undefined,
    format: (v: number) => formatCurrency(v),
  },
  {
    key: "hot_leads" as const,
    name: "Hot leads",
    color: "var(--chart-2)",
    dash: "6 4",
    format: (v: number) => String(Math.round(v)),
  },
  {
    key: "churn_risks" as const,
    name: "Churn risks",
    color: "var(--chart-3)",
    dash: "2 4",
    format: (v: number) => String(Math.round(v)),
  },
];

function formatAxisValue(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 10_000) return `${Math.round(v / 1000)}k`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return Number.isInteger(v) ? String(v) : v.toFixed(0);
}

function niceMax(values: number[]): number {
  const max = Math.max(...values, 0);
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (max <= m * pow) return m * pow;
  }
  return 10 * pow;
}

function formatDateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function MetricsTrendChartSkeleton() {
  return (
    <div className="glass-skeleton h-[320px] animate-pulse rounded-xl" aria-hidden />
  );
}

export function MetricsTrendChart({
  points,
  className,
}: {
  points: MetricsTimeseriesPoint[];
  className?: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const hasData = useMemo(
    () =>
      points.some(
        (p) => p.revenue_at_risk > 0 || p.hot_leads > 0 || p.churn_risks > 0,
      ),
    [points],
  );

  const plot = useMemo(() => {
    const labels = points.map((p) => p.date);
    const allValues = points.flatMap((p) => [
      p.revenue_at_risk,
      p.hot_leads,
      p.churn_risks,
    ]);
    const max = niceMax(allValues);
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const n = Math.max(labels.length, 1);
    const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
    const labelEvery = Math.max(1, Math.ceil(labels.length / 7));
    return { labels, max, plotW, plotH, n, x, y, labelEvery };
  }, [points]);

  if (points.length === 0) {
    return (
      <div
        className={cn(
          "app-glass-card flex min-h-[240px] items-center justify-center rounded-xl p-6 text-center",
          className,
        )}
      >
        <p className="text-sm text-muted">No trend data for this range yet.</p>
      </div>
    );
  }

  return (
    <div className={cn("app-glass-card rounded-xl p-4 sm:p-5", className)}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span
              aria-hidden
              className="inline-block h-0.5 w-5 rounded-full"
              style={{
                background: s.color,
                ...(s.dash ? { background: "transparent", borderTop: `2px dashed ${s.color}` } : {}),
              }}
            />
            <span className="text-atmospheric-grey">{s.name}</span>
          </span>
        ))}
      </div>

      {!hasData ? (
        <p className="mb-3 text-xs text-muted">
          Conversations will appear here as intake ramps up.
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Daily trends for revenue at risk, hot leads, and churn risks"
          className="h-auto min-w-[320px] w-full"
          onMouseLeave={() => setHoverIndex(null)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={plot.y(plot.max * t)}
                y2={plot.y(plot.max * t)}
                stroke="var(--chart-grid)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={plot.y(plot.max * t) + 3}
                textAnchor="end"
                className="fill-current text-muted"
                fontSize={9}
              >
                {formatAxisValue(plot.max * t)}
              </text>
            </g>
          ))}

          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + plot.plotH}
            y2={PAD.top + plot.plotH}
            stroke="var(--chart-grid)"
            strokeWidth={1}
          />

          {plot.labels.map((label, i) =>
            i % plot.labelEvery === 0 ? (
              <text
                key={label}
                x={plot.x(i)}
                y={H - PAD.bottom + 16}
                textAnchor="middle"
                className="fill-current text-muted"
                fontSize={9}
              >
                {formatDateLabel(label)}
              </text>
            ) : null,
          )}

          {SERIES.map((s) => (
            <polyline
              key={s.key}
              points={points
                .map((p, i) => `${plot.x(i)},${plot.y(p[s.key])}`)
                .join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dash}
            />
          ))}

          {points.map((p, i) => (
            <g key={p.date}>
              <rect
                x={plot.x(i) - (plot.plotW / plot.n) * 0.4}
                y={PAD.top}
                width={(plot.plotW / plot.n) * 0.8}
                height={plot.plotH}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(i)}
              />
              {SERIES.map((s) => (
                <circle
                  key={s.key}
                  cx={plot.x(i)}
                  cy={plot.y(p[s.key])}
                  r={hoverIndex === i ? 5 : 3}
                  fill={s.color}
                  stroke="var(--background, #fff)"
                  strokeWidth={2}
                />
              ))}
            </g>
          ))}

          {hoverIndex !== null ? (
            <line
              x1={plot.x(hoverIndex)}
              x2={plot.x(hoverIndex)}
              y1={PAD.top}
              y2={PAD.top + plot.plotH}
              stroke="var(--chart-grid)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ) : null}
        </svg>
      </div>

      {hoverIndex !== null ? (
        <div className="mt-3 rounded-lg border border-glass-border bg-glass/80 px-3 py-2 text-xs">
          <p className="font-medium text-atmospheric-grey">
            {formatDateLabel(points[hoverIndex].date)}
          </p>
          <ul className="mt-1 space-y-0.5 text-muted">
            {SERIES.map((s) => (
              <li key={s.key} className="flex justify-between gap-4">
                <span>{s.name}</span>
                <span className="tabular-nums text-atmospheric-grey">
                  {s.format(points[hoverIndex][s.key])}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
