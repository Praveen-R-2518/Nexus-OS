"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Activity, AlertCircle, RefreshCw } from "lucide-react";
import { useTenantScope } from "@/components/tenant/TenantScope";
import { ExecutiveEmptyState } from "@/components/ui/ExecutiveEmptyState";
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

const ZERO_LOG_COUNTS = { success: 0, failed: 0, running: 0 };

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
        "rounded-xl border border-selectable-edge bg-white px-4 py-4 dark:bg-surface-card",
        accent,
      )}
    >
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-atmospheric-grey">
        {value}
      </p>
    </div>
  );
}

export default function LogsPage() {
  const tenant = useTenantScope();
  const teamId = tenant.teamId;
  const queriesEnabled = tenant.ready && teamId !== null;

  const [filter, setFilter] = useState<ResultFilter>("");

  const filterKey = filter === "" ? "" : filter;
  const {
    data,
    isPending: loading,
    error: errObj,
    refetch,
  } = useQuery({
    queryKey: queryKeys.workflowLogs(teamId, filterKey),
    queryFn: () =>
      workflowLogsWithMetaQuery(filter === "" ? undefined : filter),
    enabled: queriesEnabled,
  });

  const logs = data?.logs ?? [];
  const counts = data?.counts ?? ZERO_LOG_COUNTS;
  const error = errObj instanceof Error ? errObj.message : null;

  const load = useCallback(() => {
    void refetch();
  }, [refetch]);

  if (tenant.loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 font-mono text-xs uppercase tracking-widest text-muted">
        <Spinner className="h-8 w-8" label="Loading logs" />
        <p>Loading workflow logs…</p>
      </div>
    );
  }

  if (!queriesEnabled && tenant.ready) {
    return (
      <ExecutiveEmptyState
        title="Workspace setup required"
        description="Complete onboarding to view workflow executions for your team."
        icon={<Activity className="shrink-0" aria-hidden />}
        className="min-h-[50vh] surface-card"
      />
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 hairline-b pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ref-cta dark:text-muted">
            Nexus OS
          </p>
          <h1 className="mt-3 flex items-center gap-3 font-sans text-2xl font-black uppercase tracking-tight text-atmospheric-grey sm:text-3xl">
            <Activity className="h-8 w-8 text-status-positive" aria-hidden />
            Workflow Logs
          </h1>
          <p className="mt-2 max-w-xl font-mono text-sm text-muted">
            Latest workflow executions from Supabase.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-xl border border-border bg-white px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-atmospheric-grey transition-colors duration-interaction hover:bg-ref-mint disabled:cursor-not-allowed disabled:opacity-50 dark:border-border/60 dark:bg-surface-card dark:hover:bg-surface-elevated"
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
          className="flex items-start gap-4 rounded-xl border border-status-critical-border bg-status-critical-surface px-4 py-3 font-mono text-sm text-status-critical"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
          <div>
            <p className="font-bold">Could not load logs</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      ) : null}

      <section
        aria-label="Log counts"
        className="grid gap-4 sm:grid-cols-3"
      >
        <CountTile
          label="Success"
          value={counts.success}
          accent="border border-status-positive-border/50 bg-status-positive-surface/25"
        />
        <CountTile
          label="Failed"
          value={counts.failed}
          accent="border border-status-critical-border/50 bg-status-critical-surface/25"
        />
        <CountTile
          label="Running"
          value={counts.running}
          accent="border border-status-warning-border/50 bg-status-warning-surface/25"
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted">
          Filter
        </span>
        {FILTER_OPTIONS.map(({ value, label }) => (
          <button
            key={value || "all"}
            type="button"
            onClick={() => setFilter(value)}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center rounded-xl border px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-wide transition-colors duration-interaction",
              filter === value
                ? "border border-selectable-edge-selected bg-ref-mint text-ref-cta dark:bg-surface-muted dark:text-muted"
                : "border border-selectable-edge bg-white text-muted hover:border-selectable-edge-hover hover:text-atmospheric-grey dark:bg-surface-card",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && logs.length === 0 ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-selectable-edge bg-white dark:bg-surface-card">
          <Spinner className="h-10 w-10 text-status-positive" />
        </div>
      ) : logs.length === 0 ? (
        <ExecutiveEmptyState
          title="No executions detected. Core pipelines standing by."
          description="When n8n workflows write to workflow_logs, they will show up here."
          icon={<Activity className="shrink-0" aria-hidden />}
          className="border-border surface-card"
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-selectable-edge bg-white dark:bg-surface-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-base">
              <thead>
                <tr className="hairline-b bg-surface-muted/80 text-sm font-bold uppercase tracking-brand text-muted">
                  <th className="px-5 py-4">Time</th>
                  <th className="px-5 py-4">Workflow</th>
                  <th className="px-5 py-4">Step</th>
                  <th className="px-5 py-4">Result</th>
                  <th className="px-5 py-4">Error</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => (
                  <tr
                    key={row.id}
                    className="hairline-b transition-colors last:border-b-0 hover:bg-surface-muted/50"
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
                          "inline-flex rounded-md border px-2 py-1 font-mono text-xs font-semibold uppercase",
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
