"use client";

import { ClipboardCheck } from "lucide-react";

import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";
import { formatDateTime } from "@/lib/dashboardData";

export default function ApprovalsPage() {
  const { drafts, leads, loading } = useDashboardData();
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));

  return (
    <section className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="size-5 text-emerald-300" aria-hidden />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Approval Queue</h1>
          <p className="mt-1 text-sm text-zinc-400">AI replies waiting for founder review.</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
          Loading approval queue...
        </div>
      ) : null}

      <div className="grid gap-4">
        {drafts.length ? drafts.map((draft) => {
          const lead = draft.lead_id ? leadById.get(draft.lead_id) : null;
          return (
            <article key={draft.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-zinc-100">{lead?.customer_name || "Unknown lead"}</p>
                  <p className="text-xs text-zinc-500">
                    {lead?.intent || "pending"} - confidence {Math.round(Number(draft.confidence || 0) * 100)}%
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-amber-200">
                    {draft.approval_status || draft.status}
                  </span>
                  <span className="text-xs text-zinc-500">{formatDateTime(draft.created_at)}</span>
                </div>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{draft.draft_text}</p>
            </article>
          );
        }) : (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-400">
            No reply drafts yet.
          </div>
        )}
      </div>
    </section>
  );
}
