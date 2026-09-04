"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
} from "lucide-react";
import { JOB_STATUS_LABELS } from "@/components/people/job-labels";
import { JobStatusPill } from "@/components/people/JobStatusPill";
import { useTenantScope } from "@/components/tenant/TenantScope";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { Spinner } from "@/components/ui/Spinner";
import { JOBS_PAGE_SIZE, jobsQuery } from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";
import { cn } from "@/lib/utils";
import { JOB_STATUSES, type JobStatus } from "@/types";

export function JobsList() {
  const router = useRouter();
  const tenant = useTenantScope();
  const teamId = tenant.teamId;
  const queriesEnabled = tenant.ready && teamId !== null;

  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<JobStatus | "">("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setOffset(0);
  }, [q, statusFilter, includeArchived]);

  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.jobs(
      teamId,
      q,
      statusFilter,
      includeArchived,
      JOBS_PAGE_SIZE,
      offset,
    ),
    queryFn: () =>
      jobsQuery({
        q,
        status: statusFilter || null,
        includeArchived,
        limit: JOBS_PAGE_SIZE,
        offset,
      }),
    enabled: queriesEnabled,
    staleTime: 15_000,
  });

  const rows = data?.data ?? [];
  const count = data?.count ?? 0;
  const hasNext = offset + JOBS_PAGE_SIZE < count;
  const hasPrev = offset > 0;
  const errorMsg = error instanceof Error ? error.message : null;
  const filtersActive = Boolean(q || statusFilter || includeArchived);

  if (tenant.loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted">
        <Spinner className="h-8 w-8" label="Loading jobs" />
        <p className="text-sm">Loading jobs…</p>
      </div>
    );
  }

  if (!queriesEnabled && tenant.ready) {
    return (
      <EmptyState
        title="Workspace setup required"
        description="Complete onboarding to manage jobs for your team."
        icon={<Briefcase />}
        className="min-h-[50vh]"
      />
    );
  }

  if (errorMsg && rows.length === 0 && !isPending) {
    return (
      <EmptyState
        title="Could not load jobs"
        description={errorMsg}
        icon={<Briefcase />}
        className="min-h-[50vh]"
      />
    );
  }

  return (
    <div className="min-h-0 space-y-8">
      <header className="flex flex-col gap-4 hairline-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="nexus-meta text-nexus-approval">People</p>
          <h1 className="mt-3 nexus-app-title text-balance text-atmospheric-grey">
            Jobs
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Open roles with versioned scoring weights. Open a job to review
            ranked candidates and advisory match summaries.
          </p>
        </div>
        <Button onClick={() => router.push("/people/jobs/new")}>
          <Plus className="h-4 w-4" aria-hidden />
          Add job
        </Button>
      </header>

      {errorMsg && rows.length > 0 ? (
        <p className="rounded-xl border border-status-warning-border bg-status-warning-surface px-3 py-2 font-mono text-xs text-status-warning">
          Could not refresh jobs: {errorMsg}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 max-w-md flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search title"
            maxLength={200}
            aria-label="Search jobs by title"
            className="glass-input h-11 w-full pl-10 pr-3 text-sm text-atmospheric-grey outline-none transition placeholder:text-muted"
          />
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-atmospheric-grey">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => {
              setIncludeArchived(event.target.checked);
            }}
            className="h-4 w-4 accent-nexus-approval"
          />
          Show archived
        </label>
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex w-max gap-2 md:w-full md:flex-wrap">
          <FilterChip
            active={statusFilter === ""}
            onClick={() => setStatusFilter("")}
          >
            All
          </FilterChip>
          {JOB_STATUSES.map((value) => (
            <FilterChip
              key={value}
              active={statusFilter === value}
              onClick={() => setStatusFilter(value)}
            >
              {JOB_STATUS_LABELS[value]}
            </FilterChip>
          ))}
        </div>
      </div>

      {queriesEnabled && isPending && rows.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="glass-skeleton h-14 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            title={filtersActive ? "No matching jobs" : "No jobs yet"}
            description={
              filtersActive
                ? "Try a different search, status, or archived filter."
                : "Add a role with skills and scoring weights."
            }
            icon={<Briefcase />}
          />
          {!filtersActive ? (
            <div className="flex justify-center">
              <Button onClick={() => router.push("/people/jobs/new")}>
                <Plus className="h-4 w-4" aria-hidden />
                Add job
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="app-glass-card overflow-hidden rounded-xl">
          <ul className="divide-y divide-border/60 md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/people/jobs/${row.id}`}
                  className={cn(
                    "flex min-h-11 flex-col gap-2 px-4 py-3.5",
                    row.archived_at && "opacity-70",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-medium text-atmospheric-grey">
                      {row.title}
                      {row.archived_at ? (
                        <span className="ml-2 text-xs font-normal text-muted">
                          Archived
                        </span>
                      ) : null}
                    </p>
                    <JobStatusPill status={row.status} />
                  </div>
                  <p className="text-sm text-muted">
                    {row.location ?? "No location"} · weights v
                    {row.scoring_weights_version}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="text-muted">
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Location</th>
                  <th className="px-5 py-3 font-medium">Weights</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hairline-t cursor-pointer hover:bg-surface-muted/60"
                    onClick={() => router.push(`/people/jobs/${row.id}`)}
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/people/jobs/${row.id}`}
                        className={cn(
                          "font-medium text-atmospheric-grey hover:text-nexus-intake",
                          row.archived_at && "text-muted",
                        )}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {row.title}
                        {row.archived_at ? (
                          <span className="ml-2 text-xs font-normal text-muted">
                            Archived
                          </span>
                        ) : null}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <JobStatusPill status={row.status} />
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {row.location ?? "—"}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-muted">
                      v{row.scoring_weights_version}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 hairline-t px-4 py-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
            <span>
              {count === 0
                ? "No results"
                : `Showing ${offset + 1}–${Math.min(offset + JOBS_PAGE_SIZE, count)} of ${count}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setOffset((value) => Math.max(0, value - JOBS_PAGE_SIZE))
                }
                disabled={!hasPrev}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-border-strong bg-surface-muted px-2.5 py-1 font-medium text-atmospheric-grey transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                Prev
              </button>
              <button
                type="button"
                onClick={() => setOffset((value) => value + JOBS_PAGE_SIZE)}
                disabled={!hasNext}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-border-strong bg-surface-muted px-2.5 py-1 font-medium text-atmospheric-grey transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
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
