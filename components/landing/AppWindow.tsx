"use client";

import {
  CheckCircle2,
  FileText,
  Inbox,
  LayoutGrid,
  Pencil,
  Search,
  Settings,
  TrendingUp,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ACCENT_VAR, type NexusAccent } from "@/lib/landing/content";

/**
 * A light mock of the real Command Center chrome — same surfaces, hairlines and
 * type scale as the authenticated app, so the landing page is showing the
 * product rather than an idealised drawing of it.
 *
 * Names and figures here are illustrative interface content, the same as any
 * product screenshot. They are not customer results.
 */

const nav: { label: string; icon: LucideIcon; badge?: string }[] = [
  { label: "Dashboard", icon: LayoutGrid },
  { label: "Inbox", icon: Inbox, badge: "24" },
  { label: "Approvals", icon: CheckCircle2, badge: "6" },
  { label: "Leads", icon: TrendingUp },
  { label: "Reports", icon: FileText },
  { label: "Settings", icon: Settings },
];

const NAV_FOR_STOP: Record<string, string> = {
  inbox: "Inbox",
  approval: "Approvals",
  report: "Reports",
};

/* ------------------------------------------------------------------ bits */

function Chrome({ title }: { title: string }) {
  return (
    <div className="flex h-9 items-center border-b border-[color:var(--apple-hairline)] bg-[#fbfbfd] px-3.5">
      <div className="flex items-center gap-1.5" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
      </div>
      <p className="ml-3.5 text-[11px] font-medium text-[#86868b]">{title}</p>
      <span className="ml-auto hidden items-center gap-1.5 rounded-full border border-[color:var(--apple-hairline)] bg-white px-2.5 py-1 text-[10px] text-[#b0b0b5] sm:flex">
        <Search className="h-3 w-3" aria-hidden />
        Search
      </span>
    </div>
  );
}

function Rail({ active }: { active: string }) {
  return (
    <nav className="hidden w-[168px] shrink-0 border-r border-[color:var(--apple-hairline)] bg-[#fbfbfd] p-2.5 sm:block">
      <ul className="space-y-0.5">
        {nav.map((item) => {
          const on = item.label === active;
          return (
            <li key={item.label}>
              <span
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] transition-colors duration-200 ${
                  on
                    ? "bg-[color:var(--nexus-approval-soft)] font-semibold text-[color:var(--nexus-approval)]"
                    : "font-medium text-[#6e6e73]"
                }`}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {item.label}
                {item.badge ? (
                  <span className="ml-auto rounded-full bg-black/[0.05] px-1.5 text-[9px] font-semibold text-[#6e6e73]">
                    {item.badge}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function PanelHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#86868b]">
        {eyebrow}
      </p>
      <h3 className="mt-1 text-[17px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">
        {title}
      </h3>
    </div>
  );
}

/* ---------------------------------------------------------------- panels */

const inboxRows: {
  name: string;
  channel: string;
  preview: string;
  priority: string;
  accent: NexusAccent;
  value: string;
}[] = [
  { name: "Sarah Chen", channel: "Gmail", preview: "We need to upgrade before Q3. Can you send pricing?", priority: "Critical", accent: "rescue", value: "$24,000" },
  { name: "Marcus Webb", channel: "WhatsApp", preview: "Invoice discrepancy on last month's subscription", priority: "High", accent: "execution", value: "$8,400" },
  { name: "Priya Nair", channel: "Instagram", preview: "Love the onboarding. Team wants to expand seats", priority: "High", accent: "discovery", value: "$12,500" },
  { name: "Emma Rodriguez", channel: "Messenger", preview: "Five-star review, asked about the referral program", priority: "New lead", accent: "growth", value: "$4,900" },
];

function InboxPanel() {
  return (
    <>
      <PanelHead eyebrow="Unified inbox" title="24 conversations, sorted by what they are worth" />
      <ul className="divide-y divide-[color:var(--apple-hairline)] overflow-hidden rounded-xl border border-[color:var(--apple-hairline)]">
        {inboxRows.map((row) => (
          <li key={row.name} className="flex items-center gap-3 bg-white px-3.5 py-3">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: ACCENT_VAR[row.accent] }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2 text-[12.5px] font-semibold text-[#1d1d1f]">
                {row.name}
                <span className="font-mono text-[9px] font-normal text-[#86868b]">
                  {row.channel}
                </span>
              </p>
              <p className="truncate text-[11.5px] text-[#6e6e73]">{row.preview}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[12px] font-semibold tabular-nums text-[#1d1d1f]">
                {row.value}
              </p>
              <p
                className="font-mono text-[9px] font-semibold uppercase"
                style={{ color: ACCENT_VAR[row.accent] }}
              >
                {row.priority}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function ApprovalPanel() {
  return (
    <>
      <PanelHead eyebrow="Approval queue" title="6 drafts waiting on you" />
      <div className="overflow-hidden rounded-xl border border-[color:var(--apple-hairline)] bg-white">
        <div className="border-b border-[color:var(--apple-hairline)] bg-[#fbfbfd] px-4 py-3">
          <p className="flex items-center gap-2 text-[12px] font-semibold text-[#1d1d1f]">
            Sarah Chen
            <span className="font-mono text-[9px] font-normal text-[#86868b]">
              Gmail · 9 min ago
            </span>
            <span
              className="ml-auto rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold uppercase"
              style={{
                color: ACCENT_VAR.rescue,
                background: "var(--nexus-rescue-soft)",
              }}
            >
              Critical · $24,000
            </span>
          </p>
          <p className="mt-1.5 text-[11.5px] leading-[1.5] text-[#6e6e73]">
            “We need to upgrade before Q3 but the current plan caps us at five
            seats. Can you send pricing today? Our board meets Thursday.”
          </p>
        </div>

        <div className="px-4 py-3.5">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#86868b]">
            Drafted reply
          </p>
          <p className="mt-2 rounded-lg border border-dashed border-[color:var(--apple-hairline)] bg-[#fbfbfd] p-3 text-[11.5px] leading-[1.6] text-[#1d1d1f]">
            Hi Sarah — congratulations on outgrowing five seats. Professional
            lifts you to 5,000 messages a month and unlocks Instagram DMs. I have
            attached pricing for a 12-seat plan and can hold the annual rate
            until Thursday so it is ready for your board.
          </p>

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--nexus-approval)] px-3 py-1.5 text-[11px] font-medium text-white">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              Approve &amp; send
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--apple-hairline)] px-3 py-1.5 text-[11px] font-medium text-[#1d1d1f]">
              <Pencil className="h-3 w-3" aria-hidden />
              Edit
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--apple-hairline)] px-3 py-1.5 text-[11px] font-medium text-[#6e6e73]">
              <X className="h-3 w-3" aria-hidden />
              Reject
            </span>
            <span className="ml-auto font-mono text-[9px] text-[#86868b]">
              Hard-gated by policy: value &gt; $10k
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

const reportStats = [
  { label: "Replies drafted", value: "148", accent: "discovery" as NexusAccent },
  { label: "Noise filtered", value: "1,204", accent: "intake" as NexusAccent },
  { label: "Waiting on you", value: "6", accent: "approval" as NexusAccent },
];

const trend = [12, 16, 14, 22, 19, 26, 31, 29, 38, 42, 40, 48];

function TrendChart() {
  const max = 56;
  const pt = (v: number, i: number) => ({
    x: (i / (trend.length - 1)) * 100,
    y: 40 - (v / max) * 37,
  });
  const line = trend
    .map((v, i) => {
      const { x, y } = pt(v, i);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = pt(trend[trend.length - 1], trend.length - 1);

  return (
    <svg viewBox="0 0 100 42" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="aw-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--nexus-approval)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--nexus-approval)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[10, 20, 30].map((y) => (
        <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="rgba(0,0,0,0.06)" strokeWidth="0.5" />
      ))}
      <path d={`${line} L100,40 L0,40 Z`} fill="url(#aw-area)" stroke="none" />
      <path
        d={line}
        fill="none"
        stroke="var(--nexus-approval)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last.x} cy={last.y} r="1.6" fill="var(--nexus-approval)" />
    </svg>
  );
}

function ReportPanel() {
  return (
    <>
      <PanelHead eyebrow="Buy-back report" title="What the queue handled this month" />
      <div className="grid grid-cols-3 gap-2.5">
        {reportStats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-[color:var(--apple-hairline)] bg-white p-3"
          >
            <p className="text-[11px] text-[#86868b]">{s.label}</p>
            <p
              className="mt-1 text-[20px] font-semibold tabular-nums leading-none"
              style={{ color: ACCENT_VAR[s.accent] }}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-2.5 rounded-xl border border-[color:var(--apple-hairline)] bg-white p-3.5">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold text-[#1d1d1f]">
            Conversations resolved
          </p>
          <div className="flex gap-1">
            {["7D", "30D", "90D"].map((p) => (
              <span
                key={p}
                className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-medium ${
                  p === "30D"
                    ? "bg-[color:var(--nexus-approval-soft)] text-[color:var(--nexus-approval)]"
                    : "text-[#86868b]"
                }`}
              >
                {p}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-3 h-[92px]">
          <TrendChart />
        </div>
      </div>
    </>
  );
}

const PANELS: Record<string, () => JSX.Element> = {
  inbox: InboxPanel,
  approval: ApprovalPanel,
  report: ReportPanel,
};

export function AppWindowFrame({
  stopId,
  children,
}: {
  stopId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--apple-hairline)] bg-white landing-elev-3">
      <Chrome title="Nexus OS — Command Center" />
      <div className="flex min-h-[404px]">
        <Rail active={NAV_FOR_STOP[stopId] ?? "Inbox"} />
        <div className="min-w-0 flex-1 bg-[#fdfdfe] p-4 md:p-5">{children}</div>
      </div>
    </div>
  );
}

export function AppPanel({ stopId }: { stopId: string }) {
  const Panel = PANELS[stopId] ?? InboxPanel;
  return <Panel />;
}
