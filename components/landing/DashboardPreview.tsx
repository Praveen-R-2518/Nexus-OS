"use client";

import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  FileText,
  Inbox,
  LayoutGrid,
  Search,
  Settings,
  TrendingUp,
} from "lucide-react";

const metrics = [
  { label: "Revenue at Risk", value: "$48,200", delta: "+$6.4K", good: false, spark: [30, 26, 34, 31, 40, 38, 47, 52], color: "#f87171" },
  { label: "Hot Leads", value: "12", delta: "+3", good: true, spark: [4, 6, 5, 8, 7, 9, 11, 12], color: "#5ea0ff" },
  { label: "Churn Risks", value: "5", delta: "−2", good: true, spark: [9, 8, 9, 7, 8, 6, 6, 5], color: "#fbbf24" },
  { label: "Hours Saved", value: "14.2h", delta: "+2.1h", good: true, spark: [6, 7, 9, 8, 11, 12, 13, 14], color: "#34d399" },
] as const;

const feed = [
  { name: "Sarah Chen", initials: "SC", gradient: "linear-gradient(135deg, hsl(214,72%,56%), hsl(262,64%,46%))", preview: "We need to upgrade before Q3 — can you send pricing?", urgency: "Critical", value: "$24,000" },
  { name: "Marcus Webb", initials: "MW", gradient: "linear-gradient(135deg, hsl(24,72%,56%), hsl(4,64%,46%))", preview: "Invoice discrepancy on last month's subscription", urgency: "High", value: "$8,400" },
  { name: "Priya Nair", initials: "PN", gradient: "linear-gradient(135deg, hsl(158,72%,46%), hsl(190,64%,42%))", preview: "Love the onboarding — team wants to expand seats", urgency: "High", value: "$12,500" },
  { name: "Emma Rodriguez", initials: "ER", gradient: "linear-gradient(135deg, hsl(286,60%,56%), hsl(320,64%,50%))", preview: "Customer left a five-star WhatsApp review", urgency: "Positive", value: "$4,900" },
] as const;

const urgencyStyles: Record<string, string> = {
  Critical: "bg-red-500/15 text-red-300",
  High: "bg-amber-500/15 text-amber-300",
  Medium: "bg-blue-400/15 text-blue-300",
  Positive: "bg-emerald-400/15 text-emerald-300",
};

type NavItem = {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  badge?: string;
};

const nav: NavItem[] = [
  { label: "Dashboard", icon: LayoutGrid, active: true },
  { label: "Inbox", icon: Inbox, badge: "24" },
  { label: "Approvals", icon: CheckCircle2, badge: "6" },
  { label: "Leads", icon: TrendingUp },
  { label: "Reports", icon: FileText },
  { label: "Settings", icon: Settings },
];

const chartPoints = [12, 16, 14, 22, 19, 26, 31, 29, 38, 42, 40, 48];

function Sparkline({ points, color }: { points: readonly number[]; color: string }) {
  const min = Math.min(...points);
  const range = Math.max(...points) - min || 1;
  const d = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * 100;
      const y = 24 - ((v - min) / range) * 22;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 26" className="h-4 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RevenueChart() {
  const max = 60;
  const pt = (v: number, i: number) => ({
    x: (i / (chartPoints.length - 1)) * 100,
    y: 40 - (v / max) * 38,
  });
  const line = chartPoints
    .map((v, i) => {
      const { x, y } = pt(v, i);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = pt(chartPoints[chartPoints.length - 1], chartPoints.length - 1);

  return (
    <svg viewBox="0 0 100 42" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="dp-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1274f9" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#1274f9" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[10, 20, 30].map((y) => (
        <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
      ))}
      <path d={`${line} L100,40 L0,40 Z`} fill="url(#dp-area)" stroke="none" />
      <path d={line} fill="none" stroke="#4f8ef7" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="2.4" fill="rgba(79,142,247,0.35)" />
      <circle cx={last.x} cy={last.y} r="1.2" fill="#ffffff" />
    </svg>
  );
}

export function DashboardPreview() {
  return (
    <div className="h-full w-full overflow-hidden bg-[#101012] text-white">
      {/* Window chrome */}
      <div className="relative flex h-8 items-center border-b border-white/[0.08] px-3">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
          <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
          <span className="h-2 w-2 rounded-full bg-[#28c840]" />
        </div>
        <p className="ml-3 text-[10px] font-medium text-white/55">
          Nexus OS — Command Center
        </p>
        <div className="relative ml-auto hidden items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] text-white/30 sm:flex">
          <Search className="h-2.5 w-2.5" aria-hidden />
          Search
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <nav className="shrink-0 border-r border-white/[0.05] bg-[#121214] py-2 pl-1.5 pr-1.5 sm:w-32">
          <ul className="space-y-0.5">
            {nav.map((item) => (
              <li key={item.label}>
                <span
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] ${
                    item.active
                      ? "bg-[#1274f9]/15 font-semibold text-[#dbe8ff]"
                      : "font-medium text-white/50"
                  }`}
                >
                  <item.icon
                    className={`h-3 w-3 shrink-0 ${item.active ? "text-[#5ea0ff]" : "text-white/40"}`}
                    aria-hidden
                  />
                  <span className="hidden sm:inline">{item.label}</span>
                  {"badge" in item && item.badge ? (
                    <span className="ml-auto hidden rounded-full bg-white/[0.08] px-1.5 text-[8px] font-semibold text-white/55 sm:inline">
                      {item.badge}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <div className="min-w-0 flex-1 p-3.5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[0.2em] text-[#5ea0ff]">
                Operations
              </p>
              <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-[#f5f5f7]">
                Command Center
              </h2>
              <p className="text-[10px] text-white/45">
                Live revenue rescue across every customer channel.
              </p>
            </div>
            <p className="hidden text-[9px] text-white/35 sm:block">Today · Wed 9 Jul</p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {metrics.map((m) => (
              <div
                key={m.label}
                className="rounded-xl border border-white/[0.08] bg-gradient-to-b from-[#1a1a1d] to-[#151517] p-2.5"
              >
                <p className="text-[9px] font-medium text-white/45">{m.label}</p>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <p className="text-sm font-semibold tabular-nums text-[#f5f5f7]">{m.value}</p>
                  <span
                    className={`rounded-full px-1.5 py-px text-[8px] font-medium ${
                      m.good ? "bg-emerald-400/10 text-emerald-300" : "bg-red-500/10 text-red-300"
                    }`}
                  >
                    {m.delta}
                  </span>
                </div>
                <div className="mt-1.5">
                  <Sparkline points={m.spark} color={m.color} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 grid gap-2 lg:grid-cols-5">
            <div className="rounded-xl border border-white/[0.08] bg-gradient-to-b from-[#1a1a1d] to-[#151517] p-2.5 lg:col-span-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold text-[#f5f5f7]">Revenue rescued</p>
                <div className="flex gap-1">
                  {["7D", "30D", "90D"].map((p) => (
                    <span
                      key={p}
                      className={`rounded-full px-1.5 py-px text-[8px] font-medium ${
                        p === "30D" ? "bg-[#1274f9]/20 text-[#5ea0ff]" : "bg-white/[0.05] text-white/40"
                      }`}
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-2 h-20">
                <RevenueChart />
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-gradient-to-b from-[#1a1a1d] to-[#151517] p-2.5 lg:col-span-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold text-[#f5f5f7]">Inbox feed</p>
                <span className="flex items-center gap-1 text-[8px] font-semibold tracking-widest text-white/45">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" aria-hidden />
                  LIVE
                </span>
              </div>
              <ul className="mt-1.5 divide-y divide-white/[0.05]">
                {feed.map((row) => (
                  <li key={row.name} className="flex items-center gap-2 py-1.5">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[7px] font-semibold text-white"
                      style={{ background: row.gradient }}
                      aria-hidden
                    >
                      {row.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-semibold text-white/90">{row.name}</p>
                      <p className="truncate text-[9px] text-white/40">{row.preview}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="text-[9px] font-semibold tabular-nums text-white/90">
                        {row.value}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-px text-[7px] font-medium uppercase ${urgencyStyles[row.urgency]}`}
                      >
                        {row.urgency}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
