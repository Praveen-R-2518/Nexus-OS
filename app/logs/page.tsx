"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Activity, AlertCircle, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { workflowLogsWithMetaQuery } from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";
import { cn } from "@/lib/utils";

type ResultFilter = "" | "success" | "failed" | "running";

const FILTER_OPTIONS: { value: ResultFilter; label: string }[] = [
  { value: "", label: "All" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "running", label: "Running" },
];

function resultBadgeClass(result: string): string {
  const r = result.toLowerCase();
  if (r === "success") {
    return "border-status-positive-border bg-status-positive-surface text-status-positive";
  }
  if (r === "failed") {
    return "border-status-critical-border bg-status-critical-surface text-status-critical";
  }
  if (r === "running") {
    return "border-status-warning-border bg-status-warning-surface text-status-warning";
  }
  return "border-border-strong bg-surface-muted text-muted";
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
        "rounded-2xl border border-border surface-card px-5 py-4 shadow-sm",
        accent,
      )}
    >
      <p className="text-xs font-bold uppercase tracking-brand text-muted">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-atmospheric-grey">
        {value}
      </p>
    </div>
  );
}

export default function LogsPage() {
  const [filter, setFilter] = useState<ResultFilter>("");

  const filterKey = filter === "" ? "" : filter;
  const {
    data,
    isPending: loading,
    error: errObj,
    refetch,
  } = useQuery({
    queryKey: queryKeys.workflowLogs(filterKey),
    queryFn: () =>
      workflowLogsWithMetaQuery(filter === "" ? undefined : filter),
  });

  const logs = data?.logs ?? [];
  const counts = data?.counts ?? null;
  const error = errObj instanceof Error ? errObj.message : null;

  const load = useCallback(() => {
    void refetch();
  }, [refetch]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-brand text-status-positive">
            Nexus OS
          </p>
          <h1 className="mt-3 flex items-center gap-3 text-3xl font-bold tracking-tight text-atmospheric-grey">
            <Activity className="h-8 w-8 text-status-positive" aria-hidden />
            Workflow Logs
          </h1>
          <p className="mt-2 max-w-xl text-base text-muted">
            Latest workflow executions from Supabase.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-xl border border-border bg-surface-muted px-5 py-2.5 text-base font-semibold text-atmospheric-grey transition-colors duration-interaction hover:border-status-positive-border hover:bg-status-positive-surface hover:text-status-positive disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            className={cn("h-5 w-5", loading && "animate-spin")}
            aria-hidden
          />
          Refresh
        </button>
      </header>

      {error ? (
        <div
          className="flex items-start gap-4 rounded-2xl border border-status-critical-border bg-status-critical-surface px-5 py-4 text-base text-status-critical"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
          <div>
            <p className="font-bold">Could not load logs</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      ) : null}

      {counts ? (
        <section
          aria-label="Log counts"
          className="grid gap-4 sm:grid-cols-3"
        >
          <CountTile
            label="Success"
            value={counts.success}
            accent="ring-1 ring-status-positive-border/30"
          />
          <CountTile
            label="Failed"
            value={counts.failed}
            accent="ring-1 ring-status-critical-border/30"
          />
          <CountTile
            label="Running"
            value={counts.running}
            accent="ring-1 ring-status-warning-border/30"
          />
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-bold uppercase tracking-brand text-muted">
          Filter
        </span>
        {FILTER_OPTIONS.map(({ value, label }) => (
          <button
            key={value || "all"}
            type="button"
            onClick={() => setFilter(value)}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center rounded-xl border px-5 py-2 text-base font-semibold transition-colors duration-interaction",
              filter === value
                ? "border-status-positive-border bg-status-positive-surface text-status-positive shadow-sm"
                : "border-border bg-surface-card text-muted hover:border-border-strong hover:bg-surface-muted hover:text-atmospheric-grey",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && logs.length === 0 ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-border surface-card">
          <Spinner className="h-10 w-10 text-status-positive" />
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          title="No workflow logs"
          description="When n8n workflows write to `workflow_logs`, they will show up here."
          className="border-border surface-card"
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border surface-card shadow-card-halo-light dark:shadow-card-halo">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-base">
              <thead>
                <tr className="border-b border-border bg-surface-muted/80 text-sm font-bold uppercase tracking-brand text-muted">
                  <th className="px-5 py-4">Time</th>
                  <th className="px-5 py-4">Workflow</th>
                  <th className="px-5 py-4">Step</th>
                  <th className="px-5 py-4">Result</th>
                  <th className="px-5 py-4">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((row) => (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-surface-muted/50"
                  >
                    <td className="whitespace-nowrap px-5 py-4 font-mono text-sm text-muted">
                      {new Date(row.timestamp).toLocaleString()}
                    </td>
                    <td className="max-w-[200px] truncate px-5 py-4 font-medium text-atmospheric-grey">
                      {row.workflow_name}
                    </td>
                    <td className="max-w-[220px] truncate px-5 py-4 text-muted">
                      {row.step}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-3 py-1 text-sm font-semibold",
                          resultBadgeClass(row.result),
                        )}
                      >
                        {row.result}
                      </span>
                    </td>
                    <td className="max-w-xs truncate px-5 py-4 text-sm font-medium text-status-critical">
                      {row.error ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-center text-sm text-muted">
        <Link
          href="/dashboard"
          className="font-semibold text-status-positive underline-offset-4 hover:underline"
        >
          ← Command Center
        </Link>
      </p>
    </div>
  );
}
