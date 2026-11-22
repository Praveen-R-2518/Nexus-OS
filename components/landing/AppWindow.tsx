"use client";

import { useState } from "react";
import { InboxSortSelect } from "@/components/inbox/InboxSortSelect";
import { sortInbox, type InboxSort } from "@/lib/inbox-sort";
import { formatCurrency } from "@/lib/utils";
import {
  CheckCircle2,
  FileText,
  Inbox,
  LayoutGrid,
  Settings,
  Users,
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
  { label: "Inbox", icon: Inbox, badge: "4" },
  { label: "Approvals", icon: CheckCircle2 },
  { label: "People", icon: Users },
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
    </div>
  );
}

function Rail({ active }: { active: string }) {
  return (
    <div className="hidden w-[168px] shrink-0 border-r border-[color:var(--apple-hairline)] bg-[#fbfbfd] p-2.5 sm:block">
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
    </div>
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
  estimated_value: number;
  risk_score: number;
  created_at: string;
}[] = [
  { name: "Sarah Chen", channel: "Gmail", preview: "We need to upgrade before Q3. Can you send pricing?", priority: "Critical", accent: "rescue", estimated_value: 24000, risk_score: 95, created_at: "2026-04-02T09:00:00Z" },
  { name: "Marcus Webb", channel: "WhatsApp", preview: "Invoice discrepancy on last month's subscription", priority: "High", accent: "execution", estimated_value: 8400, risk_score: 85, created_at: "2026-04-02T09:20:00Z" },
  { name: "Priya Nair", channel: "Instagram", preview: "Love the onboarding. Team wants to expand seats", priority: "High", accent: "discovery", estimated_value: 12500, risk_score: 60, created_at: "2026-04-02T09:30:00Z" },
  { name: "Emma Rodriguez", channel: "Messenger", preview: "Five-star review, asked about the referral program", priority: "New lead", accent: "growth", estimated_value: 4900, risk_score: 20, created_at: "2026-04-02T10:00:00Z" },
];

function InboxPanel() {
  const [sort, setSort] = useState<InboxSort>("risk_score");
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3">
        <PanelHead eyebrow="Unified inbox" title="Priority conversations" />
        <InboxSortSelect value={sort} onChange={setSort} />
      </div>
      <ul className="divide-y divide-[color:var(--apple-hairline)] overflow-hidden rounded-xl border border-[color:var(--apple-hairline)]">
        {sortInbox(inboxRows, sort).map((row) => (
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
                  {row.channel} · {row.created_at.slice(11, 16)}
                </span>
              </p>
              <p className="truncate text-[11.5px] text-[#6e6e73]">{row.preview}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[12px] font-semibold tabular-nums text-[#1d1d1f]">
                {formatCurrency(row.estimated_value)}
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

const sampleReply =
  "Hi Sarah, I can put together a quote for your board meeting on Thursday. How many seats should I include?";

function ApprovalPanel() {
  const [reply, setReply] = useState(sampleReply);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  return (
    <>
      <PanelHead eyebrow="Approval queue" title="Review a sample draft" />
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
          <label htmlFor="sample-draft" className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#6e6e73]">
            Drafted reply
          </label>
          <textarea
            id="sample-draft"
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            readOnly={decision !== null}
            rows={3}
            className="mt-2 block w-full resize-y rounded-lg border border-[color:var(--apple-hairline)] bg-[#fbfbfd] p-3 text-sm leading-relaxed text-[#1d1d1f]"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {decision === null ? (
              <>
                <button type="button" onClick={() => setDecision("approved")} disabled={!reply.trim()}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[color:var(--nexus-approval)] px-4 text-xs font-medium text-white disabled:opacity-50">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  Approve draft
                </button>
                <button type="button" onClick={() => setDecision("rejected")}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[color:var(--apple-hairline)] px-4 text-xs font-medium">
                  <X className="h-3.5 w-3.5" aria-hidden />
                  Reject
                </button>
              </>
            ) : (
              <button type="button" className="min-h-11 rounded-full border border-[color:var(--apple-hairline)] px-4 text-xs font-medium"
                onClick={() => { setReply(sampleReply); setDecision(null); }}>
                Reset sample
              </button>
            )}
            <span role="status" className="text-xs text-[#6e6e73]">
              {decision && `Sample draft ${decision}.`}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

const reportStats = [
  { label: "Messages processed", value: "24", accent: "discovery" },
  { label: "Revenue recovered", value: "$4,900", accent: "growth" },
  { label: "Drafts approved", value: "3", accent: "approval" },
] as const;

function ReportPanel() {
  return (
    <>
      <PanelHead eyebrow="Buy-back report" title="Today’s conversation summary" />
      <div className="grid grid-cols-3 gap-2.5">
        {reportStats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-[color:var(--apple-hairline)] bg-white p-3"
          >
            <p className="text-[11px] text-[#86868b]">{s.label}</p>
            <p
              className="mt-1 text-[15px] font-semibold tabular-nums leading-none sm:text-[20px]"
              style={{ color: ACCENT_VAR[s.accent] }}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-2.5 rounded-xl border border-[color:var(--apple-hairline)] bg-white p-3.5">
        <p className="text-[12px] font-semibold text-[#1d1d1f]">Executive summary</p>
        <p className="mt-2 text-[12px] leading-relaxed text-[#6e6e73]">
          The team approved three drafts today. The largest open conversation is a
          $24,000 upgrade request waiting for a reply before Thursday.
        </p>
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
      <Chrome title="Nexus OS · Sample workspace" />
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
