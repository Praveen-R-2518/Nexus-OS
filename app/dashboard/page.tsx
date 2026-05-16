"use client";

import { AlertTriangle, Clock, Inbox, MessageSquareText, TrendingUp } from "lucide-react";

import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";
import { displayConversationSource, formatDateTime, formatMoney } from "@/lib/dashboardData";

function metric(label: string, value: string | number, tone: string) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className={`mt-3 text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { conversations, leads, drafts, followups, errors, loading } = useDashboardData();
  const hotLeads = leads.filter((lead) => lead.urgency === "high");
  const openDrafts = drafts.filter((draft) => (draft.approval_status || draft.status || "").includes("pending"));
  const pendingFollowups = followups.filter((followup) => followup.status === "pending" || followup.status === "scheduled");
  const pipelineValue = leads.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);

  return (
    <section className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-[0.28em] text-cyan-400">Nexus OS</p>
        <h1 className="text-3xl font-semibold tracking-tight">Revenue Command Center</h1>
      </div>

      {errors.length ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <AlertTriangle className="size-4" aria-hidden />
          {errors.join(" | ")}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
          Loading live revenue data...
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metric("Pipeline", formatMoney(pipelineValue), "text-emerald-300")}
        {metric("Hot Leads", hotLeads.length, "text-rose-300")}
        {metric("Drafts Waiting", openDrafts.length, "text-cyan-300")}
        {metric("Follow-ups", pendingFollowups.length, "text-amber-300")}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <TrendingUp className="size-4 text-emerald-300" aria-hidden />
            <h2 className="font-medium">Active Revenue Signals</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                <tr className="border-b border-zinc-900">
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Intent</th>
                  <th className="px-4 py-3">Urgency</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Next</th>
                </tr>
              </thead>
              <tbody>
                {leads.slice(0, 8).map((lead) => (
                  <tr key={lead.id} className="border-b border-zinc-900 last:border-b-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-100">{lead.customer_name || "Unknown"}</p>
                      <p className="text-xs text-zinc-500">{lead.customer_email}</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{lead.intent}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-200">
                        {lead.urgency}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-200">{formatMoney(lead.estimated_value)}</td>
                    <td className="px-4 py-3 text-zinc-400">{lead.next_action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <Inbox className="size-4 text-cyan-300" aria-hidden />
            <h2 className="font-medium">Latest Intake</h2>
          </div>
          <div className="divide-y divide-zinc-900">
            {conversations.slice(0, 6).map((conversation) => (
              <article key={conversation.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-zinc-100">{conversation.customer_name || "Unknown"}</p>
                    <p className="text-xs text-zinc-500">
                      {displayConversationSource(conversation)} - {conversation.customer_email}
                    </p>
                  </div>
                  <p className="flex shrink-0 items-center gap-1 text-xs text-zinc-500">
                    <Clock className="size-3" aria-hidden />
                    {formatDateTime(conversation.created_at)}
                  </p>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-zinc-300">{conversation.message}</p>
              </article>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex items-center gap-2">
          <MessageSquareText className="size-4 text-amber-300" aria-hidden />
          <h2 className="font-medium">Demo Fallback Status</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          Legacy webhook intake remains active for backup demos while Gmail becomes the primary channel.
        </p>
      </div>
    </section>
  );
}
