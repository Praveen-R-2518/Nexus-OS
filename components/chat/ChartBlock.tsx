"use client";

import { useMemo, useState } from "react";
import type {
  NexusChartSeries,
  NexusChartSpec,
} from "@/lib/chat/visuals";
import { cn } from "@/lib/utils";

/**
 * Dependency-free SVG renderer for `nexuschart` blocks the Revenue Analyst emits.
 * Series colors come from the CVD-validated --chart-N slots in globals.css and
 * are assigned in fixed slot order (never cycled/repainted). Text stays in the
 * app's ink tokens — color only ever carries series identity on marks.
 */

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
] as const;

const DONUT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
] as const;

const W = 480;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 34, left: 44 };

function formatValue(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 10_000) return `${Math.round(v / 1000)}k`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
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

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function Legend({ series }: { series: NexusChartSeries[] }) {
  if (series.length < 2) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {series.map((s, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 text-xs text-muted">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
          />
          {s.name || `Series ${i + 1}`}
        </span>
      ))}
    </div>
  );
}

function BarChart({ series }: { series: NexusChartSeries[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const labels = series[0].data.map((d) => d.label);
  const max = niceMax(series.flatMap((s) => s.data.map((d) => d.value)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const groupW = plotW / labels.length;
  const barW = Math.min(28, (groupW - 8) / series.length - 2);
  const showLabels = labels.length * series.length <= 12;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" className="h-auto w-full">
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + plotH * (1 - t)}
            y2={PAD.top + plotH * (1 - t)}
            stroke="var(--chart-grid)"
            strokeWidth={1}
          />
          <text
            x={PAD.left - 6}
            y={PAD.top + plotH * (1 - t) + 3}
            textAnchor="end"
            className="fill-current text-muted"
            fontSize={9}
          >
            {formatValue(max * t)}
          </text>
        </g>
      ))}
      <line
        x1={PAD.left}
        x2={W - PAD.right}
        y1={PAD.top + plotH}
        y2={PAD.top + plotH}
        stroke="var(--chart-grid)"
        strokeWidth={1}
      />
      {labels.map((label, li) => (
        <text
          key={li}
          x={PAD.left + groupW * (li + 0.5)}
          y={H - PAD.bottom + 14}
          textAnchor="middle"
          className="fill-current text-muted"
          fontSize={9}
        >
          {truncate(label, Math.max(6, Math.floor(groupW / 6)))}
        </text>
      ))}
      {series.map((s, si) =>
        s.data.map((d, di) => {
          const h = max > 0 ? Math.max((d.value / max) * plotH, d.value > 0 ? 2 : 0) : 0;
          const x =
            PAD.left +
            groupW * di +
            (groupW - series.length * (barW + 2)) / 2 +
            si * (barW + 2);
          const y = PAD.top + plotH - h;
          const key = `${si}:${di}`;
          return (
            <g
              key={key}
              onMouseEnter={() => setHover(key)}
              onMouseLeave={() => setHover(null)}
            >
              {/* rounded top only: clip a 4px-radius rect at the baseline */}
              <path
                d={`M${x},${y + Math.min(4, h)} q0,-${Math.min(4, h)} 4,-${Math.min(4, h)} h${barW - 8} q4,0 4,${Math.min(4, h)} v${h - Math.min(4, h)} h-${barW} Z`}
                fill={SERIES_COLORS[si % SERIES_COLORS.length]}
                opacity={hover && hover !== key ? 0.55 : 1}
              >
                <title>{`${s.name ? `${s.name} · ` : ""}${d.label}: ${d.value}`}</title>
              </path>
              {(showLabels || hover === key) && (
                <text
                  x={x + barW / 2}
                  y={y - 4}
                  textAnchor="middle"
                  className="fill-current text-atmospheric-grey"
                  fontSize={9}
                >
                  {formatValue(d.value)}
                </text>
              )}
            </g>
          );
        }),
      )}
    </svg>
  );
}

function LineChart({ series }: { series: NexusChartSeries[] }) {
  const labels = series[0].data.map((d) => d.label);
  const max = niceMax(series.flatMap((s) => s.data.map((d) => d.value)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (labels.length === 1 ? plotW / 2 : (plotW * i) / (labels.length - 1));
  const y = (v: number) => PAD.top + plotH * (1 - (max > 0 ? v / max : 0));
  const labelEvery = Math.max(1, Math.ceil(labels.length / 6));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" className="h-auto w-full">
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + plotH * (1 - t)}
            y2={PAD.top + plotH * (1 - t)}
            stroke="var(--chart-grid)"
            strokeWidth={1}
          />
          <text
            x={PAD.left - 6}
            y={PAD.top + plotH * (1 - t) + 3}
            textAnchor="end"
            className="fill-current text-muted"
            fontSize={9}
          >
            {formatValue(max * t)}
          </text>
        </g>
      ))}
      <line
        x1={PAD.left}
        x2={W - PAD.right}
        y1={PAD.top + plotH}
        y2={PAD.top + plotH}
        stroke="var(--chart-grid)"
        strokeWidth={1}
      />
      {labels.map((label, i) =>
        i % labelEvery === 0 ? (
          <text
            key={i}
            x={x(i)}
            y={H - PAD.bottom + 14}
            textAnchor="middle"
            className="fill-current text-muted"
            fontSize={9}
          >
            {truncate(label, 10)}
          </text>
        ) : null,
      )}
      {series.map((s, si) => (
        <g key={si}>
          <polyline
            points={s.data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ")}
            fill="none"
            stroke={SERIES_COLORS[si % SERIES_COLORS.length]}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {s.data.map((d, i) => (
            <circle
              key={i}
              cx={x(i)}
              cy={y(d.value)}
              r={4}
              fill={SERIES_COLORS[si % SERIES_COLORS.length]}
              stroke="var(--background, #fff)"
              strokeWidth={2}
            >
              <title>{`${s.name ? `${s.name} · ` : ""}${d.label}: ${d.value}`}</title>
            </circle>
          ))}
        </g>
      ))}
    </svg>
  );
}

function DonutChart({ series }: { series: NexusChartSeries[] }) {
  const data = series[0].data.filter((d) => d.value > 0);
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total <= 0) return null;
  const cx = 110;
  const cy = H / 2;
  const r = 72;
  const stroke = 26;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox={`0 0 220 ${H}`} role="img" className="h-auto w-full max-w-[220px]">
        {data.map((d, i) => {
          const frac = d.value / total;
          const dash = Math.max(frac * c - 2, 0.5); // 2px surface gap between segments
          const el = (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            >
              <title>{`${d.label}: ${d.value} (${Math.round(frac * 100)}%)`}</title>
            </circle>
          );
          offset += frac * c;
          return el;
        })}
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          className="fill-current text-atmospheric-grey"
          fontSize={16}
          fontWeight={600}
        >
          {formatValue(total)}
        </text>
      </svg>
      <ul className="min-w-[140px] flex-1 space-y-1">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2 text-xs text-muted">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
            />
            <span className="truncate text-atmospheric-grey">{d.label}</span>
            <span className="ml-auto tabular-nums">
              {formatValue(d.value)} · {Math.round((d.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TableBlock({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th
                key={i}
                className="border-b border-glass-border px-2 py-1.5 text-left font-semibold text-atmospheric-grey"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={cn(
                    "border-b border-glass-border/50 px-2 py-1.5 text-muted",
                    typeof cell === "number" && "text-right tabular-nums",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartBlock({ spec }: { spec: NexusChartSpec }) {
  const body = useMemo(() => {
    if (spec.type === "table") {
      return <TableBlock columns={spec.columns} rows={spec.rows} />;
    }
    if (spec.series.length === 0 || spec.series[0].data.length === 0) return null;
    if (spec.type === "bar") return <BarChart series={spec.series} />;
    if (spec.type === "line") return <LineChart series={spec.series} />;
    return <DonutChart series={spec.series} />;
  }, [spec]);

  if (!body) return null;

  return (
    <figure className="my-3 rounded-lg border border-glass-border bg-glass/40 p-3">
      {spec.title ? (
        <figcaption className="mb-2 text-xs font-semibold text-atmospheric-grey">
          {spec.title}
        </figcaption>
      ) : null}
      {body}
      {spec.type !== "table" ? <Legend series={spec.series} /> : null}
    </figure>
  );
}
