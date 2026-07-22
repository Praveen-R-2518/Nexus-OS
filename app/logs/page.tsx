"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardList, RotateCw } from "lucide-react";
import { ExecutiveEmptyState } from "@/components/ui/ExecutiveEmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { useTenantScope } from "@/components/tenant/TenantScope";
import { workflowLogsQuery } from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

const RESULT_FILTERS = [
  { value: "", label: "All results" },
  { value: "success", label: "Success" },
  { value: "error", label: "Error" },
  { value: "skipped", label: "Skipped" },
  { value: "retry", label: "Retry" },
] as const;

function resultTone(result: string): string {
  switch (result) {
    case "success":
      return "border-status-positive-border bg-status-positive-surface text-status-positive";
    case "error":
      return "border-status-critical-border bg-status-critical-surface text-status-critical";
    case "retry":
      return "border-status-warning-border bg-status-warning-surface text-status-warning";
    default:
      return "border-border-strong bg-surface-muted text-muted";
  }
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export default function LogsPage() {
  const tenant = useTenantScope();
  const teamId = tenant.teamId;
  const queriesEnabled = tenant.ready && teamId !== null;

  const [resultFilter, setResultFilter] = useState("");
  const [offset, setOffset] = useState(0);

  const {
    data,
    isPending,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.workflowLogs(teamId, resultFilter, offset),
    queryFn: () => workflowLogsQuery(resultFilter, offset, PAGE_SIZE),
    enabled: queriesEnabled,
    staleTime: 10_000,
  });

  const errorMsg = error instanceof Error ? error.message : null;
  const rows = data?.data ?? [];
  const count = data?.count ?? 0;
  const hasNext = offset + PAGE_SIZE < count;
  const hasPrev = offset > 0;

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
        description="Complete onboarding to view workflow logs for your team."
        icon={<ClipboardList className="shrink-0" aria-hidden />}
        className="min-h-[50vh] app-glass-card"
      />
    );
  }

  return (
    <div className="min-h-0 space-y-8">
      <header className="flex flex-col gap-4 hairline-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="nexus-meta text-nexus-execution">Observability</p>
          <h1 className="mt-3 nexus-app-title text-atmospheric-grey">Workflow Logs</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Read-only trace of n8n pipeline steps for your team — intake, classification,
            drafting, sending, and reporting.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-border-strong bg-surface-muted px-4 py-2 text-sm font-medium text-atmospheric-grey transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RotateCw className={cn("h-4 w-4", isFetching && "animate-spin")} aria-hidden />
          Refresh
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {RESULT_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => {
              setResultFilter(f.value);
              setOffset(0);
            }}
            className={cn(
              "inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
              resultFilter === f.value
                ? "border-nexus-approval-border bg-nexus-approval-soft text-nexus-approval"
                : "border-border-strong bg-surface-muted text-muted hover:bg-surface-elevated",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {errorMsg ? (
        <div className="border border-status-critical-border bg-status-critical-surface px-4 py-3 font-mono text-sm text-status-critical">
          {errorMsg}
        </div>
      ) : null}

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-skeleton h-12 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <ExecutiveEmptyState
          title="No workflow logs yet."
          description="Logs appear here as n8n workflows run for your team."
          icon={<AlertTriangle className="shrink-0" aria-hidden />}
          className="app-glass-card"
        />
      ) : (
        <div className="app-glass-card overflow-hidden rounded-xl">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-glass/60">
                <tr className="hairline-b">
                  <th scope="col" className="px-4 py-3 text-left font-mono text-[10px] font-bold uppercase tracking-widest text-muted">
                    Time
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-mono text-[10px] font-bold uppercase tracking-widest text-muted">
                    Workflow
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-mono text-[10px] font-bold uppercase tracking-widest text-muted">
                    Step
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-mono text-[10px] font-bold uppercase tracking-widest text-muted">
                    Result
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-mono text-[10px] font-bold uppercase tracking-widest text-muted">
                    Error
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hairline-b last:border-b-0">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">
                      {formatTimestamp(row.timestamp)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-atmospheric-grey">
                      {row.workflow_name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-atmospheric-grey">
                      {row.step}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex min-h-[1.5rem] items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                          resultTone(row.result),
                        )}
                      >
                        {row.result}
                      </span>
                    </td>
                    <td className="max-w-[320px] truncate px-4 py-3 text-xs text-muted" title={row.error ?? undefined}>
                      {row.error ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 hairline-t px-4 py-3 text-xs text-muted">
            <span>
              {count === 0
                ? "No results"
                : `Showing ${offset + 1}–${Math.min(offset + PAGE_SIZE, count)} of ${count}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                disabled={!hasPrev}
                className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg border border-border-strong bg-surface-muted px-2.5 py-1 font-medium text-atmospheric-grey transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                Prev
              </button>
              <button
                type="button"
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                disabled={!hasNext}
                className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg border border-border-strong bg-surface-muted px-2.5 py-1 font-medium text-atmospheric-grey transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
