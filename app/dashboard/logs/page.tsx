"use client";

import { ListTree } from "lucide-react";

import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";
import { formatDateTime } from "@/lib/dashboardData";

export default function LogsPage() {
  const { logs, loading } = useDashboardData();

  return (
    <section className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex items-center gap-2">
        <ListTree className="size-5 text-cyan-300" aria-hidden />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Workflow Logs</h1>
          <p className="mt-1 text-sm text-zinc-400">n8n audit trail for intake, classification, drafts, and reports.</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
          Loading workflow logs...
        </div>
      ) : null}

      <div className="rounded-lg border border-zinc-800 bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              <tr className="border-b border-zinc-800">
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Workflow</th>
                <th className="px-4 py-3">Step</th>
                <th className="px-4 py-3">Result</th>
                <th className="px-4 py-3">Payload</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-zinc-900 last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-400">{formatDateTime(log.timestamp)}</td>
                  <td className="px-4 py-3 text-zinc-200">{log.workflow_name}</td>
                  <td className="px-4 py-3 text-zinc-300">{log.step}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-200">
                      {log.result}
                    </span>
                  </td>
                  <td className="max-w-md px-4 py-3">
                    <code className="block max-h-24 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-900 p-2 text-xs text-zinc-400">
                      {JSON.stringify(log.error ? { error: log.error, payload: log.payload } : log.payload, null, 2)}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
