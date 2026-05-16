"use client";

import { Inbox } from "lucide-react";

import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";
import { displayConversationSource, formatDateTime } from "@/lib/dashboardData";

export default function InboxPage() {
  const { conversations, loading } = useDashboardData();

  return (
    <section className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex items-center gap-2">
        <Inbox className="size-5 text-cyan-300" aria-hidden />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Conversation Inbox</h1>
          <p className="mt-1 text-sm text-zinc-400">Gmail intake and fallback webhook messages.</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
          Loading inbox...
        </div>
      ) : null}

      <div className="rounded-lg border border-zinc-800 bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              <tr className="border-b border-zinc-800">
                <th className="px-4 py-3">Received</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((conversation) => (
                <tr key={conversation.id} className="border-b border-zinc-900 last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-400">
                    {formatDateTime(conversation.received_at || conversation.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-cyan-200">
                      {displayConversationSource(conversation)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-100">{conversation.customer_name || "Unknown"}</p>
                    <p className="text-xs text-zinc-500">{conversation.customer_email}</p>
                  </td>
                  <td className="max-w-xl px-4 py-3 text-zinc-300">{conversation.message}</td>
                  <td className="px-4 py-3 text-zinc-400">{conversation.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
