"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Search,
  Upload,
  UserPlus,
  UserRound,
} from "lucide-react";
import { CandidateConsentPill } from "@/components/people/CandidateConsentPill";
import { CandidateCsvImport } from "@/components/people/CandidateCsvImport";
import { CandidateGithubImport } from "@/components/people/CandidateGithubImport";
import { CONSENT_STATUS_LABELS } from "@/components/people/consent-labels";
import { useTenantScope } from "@/components/tenant/TenantScope";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { Spinner } from "@/components/ui/Spinner";
import { CANDIDATES_PAGE_SIZE, candidatesQuery, exportCandidatesCsv, jobsQuery } from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";
import { cn } from "@/lib/utils";
import { CONSENT_STATUSES, type ConsentStatus } from "@/types";

function roleLine(row: {
  headline: string | null;
  current_role: string | null;
}): string {
  return row.headline || row.current_role || "No role yet";
}

export function CandidatesList() {
  const router = useRouter();
  const tenant = useTenantScope();
  const teamId = tenant.teamId;
  const queriesEnabled = tenant.ready && teamId !== null;

  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [consentFilter, setConsentFilter] = useState<ConsentStatus | "">("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [offset, setOffset] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setOffset(0);
  }, [q, consentFilter, includeArchived]);

  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.candidates(
      teamId,
      q,
      consentFilter,
      includeArchived,
      CANDIDATES_PAGE_SIZE,
      offset,
    ),
    queryFn: () =>
      candidatesQuery({
        q,
        consentStatus: consentFilter || null,
        includeArchived,
        limit: CANDIDATES_PAGE_SIZE,
        offset,
      }),
    enabled: queriesEnabled,
    staleTime: 15_000,
  });

  const { data: jobsData } = useQuery({
    queryKey: queryKeys.jobs(teamId, "", "", false, 100, 0),
    queryFn: () =>
      jobsQuery({
        includeArchived: false,
        limit: 100,
        offset: 0,
      }),
    enabled: queriesEnabled,
    staleTime: 60_000,
  });

  const importJobs = (jobsData?.data ?? []).map((job) => ({
    id: job.id,
    title: job.title,
  }));
  const canImport = importJobs.length > 0;

  const rows = data?.data ?? [];
  const count = data?.count ?? 0;
  const hasNext = offset + CANDIDATES_PAGE_SIZE < count;
  const hasPrev = offset > 0;
  const errorMsg = error instanceof Error ? error.message : null;
  const filtersActive = Boolean(q || consentFilter || includeArchived);

  async function onExport() {
    setExporting(true);
    setExportError(null);
    try {
      await exportCandidatesCsv();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (tenant.loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted">
        <Spinner className="h-8 w-8" label="Loading candidates" />
        <p className="text-sm">Loading candidates…</p>
      </div>
    );
  }

  if (!queriesEnabled && tenant.ready) {
    return (
      <EmptyState
        title="Workspace setup required"
        description="Complete onboarding to manage candidates for your team."
        icon={<UserRound />}
        className="min-h-[50vh]"
      />
    );
  }

  if (errorMsg && rows.length === 0 && !isPending) {
    return (
      <EmptyState
        title="Could not load candidates"
        description={errorMsg}
        icon={<UserRound />}
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
            Candidates
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Founder-owned people you may hire. Sparse records are fine. Import
            from CSV onto a job, add a public GitHub profile you picked, or add
            candidates manually.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setGithubOpen(true)}
          >
            <UserPlus className="h-4 w-4" aria-hidden />
            Add from GitHub
          </Button>
          <Button
            variant="secondary"
            onClick={() => setImportOpen(true)}
            disabled={!canImport}
            title={
              canImport
                ? undefined
                : "Create a job first, then import candidates onto it"
            }
          >
            <Upload className="h-4 w-4" aria-hidden />
            Import CSV
          </Button>
          <Button variant="secondary" onClick={() => void onExport()} disabled={exporting}>
            {exporting ? (
              <Spinner className="h-4 w-4" label="Exporting" />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
            Export CSV
          </Button>
          <Button onClick={() => router.push("/people/candidates/new")}>
            <Plus className="h-4 w-4" aria-hidden />
            Add candidate
          </Button>
        </div>
      </header>

      {exportError ? (
        <p className="rounded-xl border border-status-warning-border bg-status-warning-surface px-3 py-2 font-mono text-xs text-status-warning">
          Could not export candidates: {exportError}
        </p>
      ) : null}

      {errorMsg && rows.length > 0 ? (
        <p className="rounded-xl border border-status-warning-border bg-status-warning-surface px-3 py-2 font-mono text-xs text-status-warning">
          Could not refresh candidates: {errorMsg}
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
            placeholder="Search name, email, headline"
            maxLength={200}
            aria-label="Search candidates by name, email, headline, or role"
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
            active={consentFilter === ""}
            onClick={() => setConsentFilter("")}
          >
            All
          </FilterChip>
          {CONSENT_STATUSES.map((value) => (
            <FilterChip
              key={value}
              active={consentFilter === value}
              onClick={() => setConsentFilter(value)}
            >
              {CONSENT_STATUS_LABELS[value]}
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
            title={filtersActive ? "No matching candidates" : "No candidates yet"}
            description={
              filtersActive
                ? "Try a different search, consent, or archived filter."
                : "Add a candidate by name. Email and skills are optional."
            }
            icon={<UserRound />}
          />
          {!filtersActive ? (
            <div className="flex justify-center">
              <Button onClick={() => router.push("/people/candidates/new")}>
                <Plus className="h-4 w-4" aria-hidden />
                Add candidate
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
                  href={`/people/candidates/${row.id}`}
                  className={cn(
                    "flex min-h-11 flex-col gap-2 px-4 py-3.5",
                    row.archived_at && "opacity-70",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-medium text-atmospheric-grey">
                      {row.full_name}
                      {row.archived_at ? (
                        <span className="ml-2 text-xs font-normal text-muted">
                          Archived
                        </span>
                      ) : null}
                    </p>
                    <CandidateConsentPill status={row.consent_status} />
                  </div>
                  <p className="text-sm text-muted">
                    {roleLine(row)} · {row.location ?? "No location"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="text-muted">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Location</th>
                  <th className="px-5 py-3 font-medium">Consent</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hairline-t cursor-pointer hover:bg-surface-muted/60"
                    onClick={() => router.push(`/people/candidates/${row.id}`)}
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/people/candidates/${row.id}`}
                        className={cn(
                          "font-medium text-atmospheric-grey hover:text-nexus-intake",
                          row.archived_at && "text-muted",
                        )}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {row.full_name}
                        {row.archived_at ? (
                          <span className="ml-2 text-xs font-normal text-muted">
                            Archived
                          </span>
                        ) : null}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted">{roleLine(row)}</td>
                    <td className="px-5 py-3 text-muted">
                      {row.location ?? "—"}
                    </td>
                    <td className="px-5 py-3">
                      <CandidateConsentPill status={row.consent_status} />
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
                : `Showing ${offset + 1}–${Math.min(offset + CANDIDATES_PAGE_SIZE, count)} of ${count}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setOffset((value) => Math.max(0, value - CANDIDATES_PAGE_SIZE))
                }
                disabled={!hasPrev}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-border-strong bg-surface-muted px-2.5 py-1 font-medium text-atmospheric-grey transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                Prev
              </button>
              <button
                type="button"
                onClick={() => setOffset((value) => value + CANDIDATES_PAGE_SIZE)}
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

      <CandidateCsvImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        jobs={importJobs}
      />
      <CandidateGithubImport
        open={githubOpen}
        onClose={() => setGithubOpen(false)}
        jobs={importJobs}
      />
    </div>
  );
}
