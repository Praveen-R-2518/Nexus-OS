"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import {
  fetchWorkflowLogsWithMeta,
  type WorkflowLogsCounts,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type { WorkflowLog } from "@/types";

type ResultFilter = "" | "success" | "failed" | "running";

const FILTER_OPTIONS: { value: ResultFilter; label: string }[] = [
  { value: "", label: "All" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "running", label: "Running" },
];

function resultBadgeClass(result: string): string {
  const r = result.toLowerCase();
  if (r === "success") return "border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/15 text-[#1B6B3A] dark:text-emerald-300";
  if (r === "failed") return "border-red-500/40 bg-red-50 dark:bg-red-500/15 text-[#8B1A1A] dark:text-red-300";
  if (r === "running") return "border-amber-500/40 bg-amber-50 dark:bg-amber-500/15 text-[#7A4200] dark:text-amber-200";
  return "border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400";
}

function CountTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 dark:border-slate-800 surface-card px-4 py-3",
        accent,
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-atmospheric-grey/60">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
        {value}
      </p>
    </div>
  );
}

export default function LogsPage() {
  const [filter, setFilter] = useState<ResultFilter>("");
  const [logs, setLogs] = useState<WorkflowLog[]>([]);
  const [counts, setCounts] = useState<WorkflowLogsCounts | null>(null);
  const [source, setSource] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWorkflowLogsWithMeta(
        filter === "" ? undefined : filter,
      );
      setLogs(data.logs);
      setCounts(data.counts);
      setSource(data.source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load logs");
      setLogs([]);
      setCounts(null);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const headingSubtitle = useMemo(() => {
    if (source === "mock") return "Showing mock data (dev fallback).";
    return "Latest workflow executions from Supabase.";
  }, [source]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-gray-200 dark:border-gray-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1B6B3A]">
            Nexus OS
          </p>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            <Activity className="h-7 w-7 text-[#1B6B3A]" aria-hidden />
            Workflow Logs
          </h1>
          <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">{headingSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex cursor-pointer items-center gap-2 self-start rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition hover:border-emerald-500/40 hover:bg-gray-100 dark:bg-gray-800 disabled:opacity-50"
        >
          <RefreshCw
            className={cn("h-4 w-4", loading && "animate-spin")}
            aria-hidden
          />
          Refresh
        </button>
      </header>

      {error ? (
        <div
          className="flex items-start gap-3 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-[#8B1A1A]"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Could not load logs</p>
            <p className="mt-1 text-[#8B1A1A]">{error}</p>
          </div>
        </div>
      ) : null}

      {counts ? (
        <section
          aria-label="Log counts"
          className="grid gap-3 sm:grid-cols-3"
        >
          <CountTile
            label="Success"
            value={counts.success}
            accent="border-emerald-900/40"
          />
          <CountTile
            label="Failed"
            value={counts.failed}
            accent="border-red-900/40"
          />
          <CountTile
            label="Running"
            value={counts.running}
            accent="border-amber-900/40"
          />
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Filter
        </span>
        {FILTER_OPTIONS.map(({ value, label }) => (
          <button
            key={value || "all"}
            type="button"
            onClick={() => setFilter(value)}
            className={cn(
              "cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition",
              filter === value
                ? "border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/15 text-[#1B6B3A] dark:text-emerald-300"
                : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-700 dark:hover:text-slate-200",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && logs.length === 0 ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 surface-card">
          <Spinner className="h-8 w-8 text-[#1B6B3A] dark:text-emerald-400" />
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          title="No workflow logs"
          description="When n8n workflows write to `workflow_logs`, they will show up here."
          className="border-slate-200 dark:border-slate-800 surface-card"
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 surface-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-surface-card dark:bg-gray-950/80 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Workflow</th>
                  <th className="px-4 py-3 font-medium">Step</th>
                  <th className="px-4 py-3 font-medium">Result</th>
                  <th className="px-4 py-3 font-medium">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800/80">
                {logs.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-100 dark:hover:bg-slate-800/30">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {new Date(row.timestamp).toLocaleString()}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-gray-700 dark:text-gray-200">
                      {row.workflow_name}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-gray-600 dark:text-gray-300">
                      {row.step}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                          resultBadgeClass(row.result),
                        )}
                      >
                        {row.result}
                      </span>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-xs text-[#8B1A1A]">
                      {row.error ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-center text-xs text-gray-600">
        <Link href="/dashboard" className="text-[#1B6B3A] hover:underline">
          ← Command Center
        </Link>
      </p>
    </div>
  );
}
