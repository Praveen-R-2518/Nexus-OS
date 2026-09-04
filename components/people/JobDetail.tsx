"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { ArrowLeft, Briefcase, Upload, UserPlus } from "lucide-react";
import { ConfirmDialog } from "@/components/people/ConfirmDialog";
import { CandidateCsvImport } from "@/components/people/CandidateCsvImport";
import { CandidateGithubImport } from "@/components/people/CandidateGithubImport";
import { JobCandidatesRank } from "@/components/people/JobCandidatesRank";
import { JobForm } from "@/components/people/JobForm";
import { JobStatusPill } from "@/components/people/JobStatusPill";
import { useTenantScope } from "@/components/tenant/TenantScope";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import {
  jobQuery,
  updateJobMutation,
  type JobWriteBody,
} from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";

export function JobDetail({ jobId }: { jobId: string }) {
  const queryClient = useQueryClient();
  const tenant = useTenantScope();
  const teamId = tenant.teamId;
  const queriesEnabled = tenant.ready && teamId !== null && Boolean(jobId);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);

  const {
    data: job,
    isPending,
    error,
  } = useQuery({
    queryKey: queryKeys.job(teamId, jobId),
    queryFn: () => jobQuery(jobId),
    enabled: queriesEnabled,
    staleTime: 15_000,
  });

  const syncCaches = useCallback(
    async (next: typeof job) => {
      if (!next) return;
      queryClient.setQueryData(queryKeys.job(teamId, next.id), next);
      await queryClient.invalidateQueries({
        queryKey: [...queryKeys.root(teamId), "jobs"],
      });
    },
    [queryClient, teamId],
  );

  async function handleSubmit(body: JobWriteBody) {
    if (!job) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const updated = await updateJobMutation(job.id, body);
      await syncCaches(updated);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save job");
    } finally {
      setSubmitting(false);
    }
  }

  async function patchArchived(archived: boolean) {
    if (!job) return;
    setArchiveBusy(true);
    setArchiveError(null);
    try {
      const updated = await updateJobMutation(job.id, { archived });
      await syncCaches(updated);
      setArchiveOpen(false);
    } catch (err) {
      setArchiveError(
        err instanceof Error ? err.message : "Could not update archive state",
      );
    } finally {
      setArchiveBusy(false);
    }
  }

  if (tenant.loading || (queriesEnabled && isPending && !job)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted">
        <Spinner className="h-8 w-8" label="Loading job" />
        <p className="text-sm">Loading job…</p>
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

  const errorMsg = error instanceof Error ? error.message : null;
  if (errorMsg && !job) {
    return (
      <div className="space-y-4">
        <Link
          href="/people/jobs"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-nexus-intake transition-colors hover:text-atmospheric-grey"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to jobs
        </Link>
        <EmptyState
          title="Job not found"
          description={errorMsg}
          icon={<Briefcase />}
          className="min-h-[40vh]"
        />
      </div>
    );
  }

  if (!job) return null;

  const archived = Boolean(job.archived_at);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="hairline-b pb-6">
        <Link
          href="/people/jobs"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-nexus-intake transition-colors hover:text-atmospheric-grey"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to jobs
        </Link>
        <p className="mt-4 nexus-meta text-nexus-approval">People</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="nexus-app-title text-balance text-atmospheric-grey">
            {job.title}
          </h1>
          <JobStatusPill status={job.status} />
          {archived ? (
            <span className="inline-flex min-h-[1.5rem] items-center rounded-full border border-border-strong bg-surface-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted">
              Archived
            </span>
          ) : null}
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Review ranked candidates, edit role details and scoring weights, or
          import more applicants from CSV or a GitHub profile you picked.
        </p>
        {!archived ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" aria-hidden />
              Import candidates
            </Button>
            <Button variant="secondary" onClick={() => setGithubOpen(true)}>
              <UserPlus className="h-4 w-4" aria-hidden />
              Add from GitHub
            </Button>
          </div>
        ) : null}
      </header>

      {archived ? (
        <div className="rounded-xl border border-border-strong bg-surface-muted px-4 py-3 text-sm text-muted">
          This job is archived and hidden from the default list.
        </div>
      ) : (
        <JobCandidatesRank jobId={job.id} />
      )}

      <section className="app-glass-card mx-auto max-w-3xl rounded-xl p-5 sm:p-6">
        <JobForm
          key={job.id + job.updated_at}
          job={job}
          submitting={submitting}
          error={formError}
          onSubmit={handleSubmit}
        />
      </section>

      <section className="app-glass-card mx-auto max-w-3xl rounded-xl p-5 sm:p-6">
        <h2 className="nexus-section-title text-atmospheric-grey">Archive</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Archiving hides the role from the default jobs list. It does not
          change status or contact anyone.
        </p>
        {archiveError ? (
          <p
            role="alert"
            className="mt-3 border border-status-critical-border bg-status-critical-surface px-3 py-2 font-mono text-xs text-status-critical"
          >
            {archiveError}
          </p>
        ) : null}
        <div className="mt-4">
          {archived ? (
            <Button
              variant="secondary"
              disabled={archiveBusy}
              onClick={() => void patchArchived(false)}
            >
              {archiveBusy ? (
                <Spinner className="h-4 w-4" label="Restoring" />
              ) : null}
              Restore to list
            </Button>
          ) : (
            <Button
              variant="destructive"
              disabled={archiveBusy}
              onClick={() => setArchiveOpen(true)}
            >
              Archive job
            </Button>
          )}
        </div>
      </section>

      {archiveOpen ? (
        <ConfirmDialog
          title="Archive this job?"
          description={
            <p>
              {job.title} will be hidden from the default jobs list. You can
              restore it later. This does not change status or send email.
            </p>
          }
          confirmLabel="Archive"
          variant="destructive"
          busy={archiveBusy}
          onCancel={() => setArchiveOpen(false)}
          onConfirm={() => void patchArchived(true)}
        />
      ) : null}

      {!archived ? (
        <>
          <CandidateCsvImport
            open={importOpen}
            onClose={() => setImportOpen(false)}
            jobId={job.id}
            jobTitle={job.title}
          />
          <CandidateGithubImport
            open={githubOpen}
            onClose={() => setGithubOpen(false)}
            jobId={job.id}
            jobTitle={job.title}
          />
        </>
      ) : null}
    </div>
  );
}
