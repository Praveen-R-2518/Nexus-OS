"use client";

import { Flame, TrendingDown, AlertTriangle, Clock } from "lucide-react";

const metrics = [
  { label: "Revenue at Risk", value: "$48,200", icon: TrendingDown, tone: "critical" },
  { label: "Hot Leads", value: "12", icon: Flame, tone: "warning" },
  { label: "Churn Risks", value: "5", icon: AlertTriangle, tone: "caution" },
  { label: "Hours Saved", value: "14.2h", icon: Clock, tone: "neutral" },
] as const;

const feed = [
  { name: "Sarah Chen", preview: "We need to upgrade before Q3 — can you send pricing?", urgency: "Critical", value: "$24,000" },
  { name: "Marcus Webb", preview: "Invoice discrepancy on last month's subscription", urgency: "High", value: "$8,400" },
  { name: "Priya Nair", preview: "Love the onboarding — team wants to expand seats", urgency: "High", value: "$12,500" },
];

export function DashboardPreview() {
  return (
    <div className="h-full w-full overflow-hidden bg-[#121212] text-white">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="font-mono text-[8px] font-bold uppercase tracking-[0.28em] text-[#8fbce6]">
          Operations
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
          Command Center
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-2 p-3">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-lg border border-white/10 bg-[#161616] p-2.5"
          >
            <div className="flex items-center gap-1.5 text-[9px] text-white/50">
              <m.icon className="h-3 w-3" aria-hidden />
              {m.label}
            </div>
            <p className="mt-1 text-sm font-semibold tabular-nums text-white">
              {m.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mx-3 overflow-hidden rounded-lg border border-white/10 bg-[#161616]">
        <div className="border-b border-white/10 px-3 py-2 text-[9px] font-semibold uppercase tracking-widest text-white/50">
          Inbox feed
        </div>
        <ul className="divide-y divide-white/5">
          {feed.map((row) => (
            <li key={row.name} className="flex items-start gap-2 px-3 py-2.5">
              <span className="shrink-0 rounded border border-red-500/30 bg-red-500/10 px-1 py-0.5 font-mono text-[7px] font-bold uppercase text-red-300">
                {row.urgency}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-white">
                  {row.name}
                </p>
                <p className="line-clamp-1 text-[9px] text-white/50">
                  {row.preview}
                </p>
              </div>
              <span className="shrink-0 text-[9px] font-bold tabular-nums text-emerald-400">
                {row.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
