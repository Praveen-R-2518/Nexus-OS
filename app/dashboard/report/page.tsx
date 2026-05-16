"use client";

import { FileBarChart } from "lucide-react";

import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";
import { formatDateTime, formatMoney, reportSummaryText } from "@/lib/dashboardData";

export default function ReportPage() {
  const { reports, loading } = useDashboardData();
  const latest = reports[0];

  return (
    <section className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex items-center gap-2">
        <FileBarChart className="size-5 text-emerald-300" aria-hidden />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Buy-Back Report</h1>
          <p className="mt-1 text-sm text-zinc-400">Daily revenue rescue metrics from WF5.</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
          Loading report...
        </div>
      ) : null}

      {latest ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Hot Leads</p>
              <p className="mt-3 text-2xl font-semibold text-rose-300">{latest.hot_leads_count || 0}</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Revenue At Risk</p>
              <p className="mt-3 text-2xl font-semibold text-amber-300">
                {formatMoney(latest.revenue_at_risk ?? latest.revenue_rescued ?? 0)}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Replies Drafted</p>
              <p className="mt-3 text-2xl font-semibold text-cyan-300">{latest.replies_drafted || 0}</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Hours Saved</p>
              <p className="mt-3 text-2xl font-semibold text-emerald-300">{latest.hours_saved || 0}</p>
            </div>
          </div>

          <article className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">Executive Briefing</h2>
              <p className="text-xs text-zinc-500">
                {latest.date || latest.report_date || "Today"} - {formatDateTime(latest.created_at)}
              </p>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-300">{reportSummaryText(latest.summary)}</p>
          </article>
        </>
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-400">
          No daily report has been generated yet.
        </div>
      )}
    </section>
  );
}
