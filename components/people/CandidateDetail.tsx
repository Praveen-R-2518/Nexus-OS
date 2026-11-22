"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { ArrowLeft, UserRound } from "lucide-react";
import { CandidateConsentPill } from "@/components/people/CandidateConsentPill";
import { CandidateForm } from "@/components/people/CandidateForm";
import { ConfirmDialog } from "@/components/people/ConfirmDialog";
import { useTenantScope } from "@/components/tenant/TenantScope";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import {
  candidateQuery,
  updateCandidateMutation,
  type CandidateWriteBody,
} from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";

export function CandidateDetail({ candidateId }: { candidateId: string }) {
  const queryClient = useQueryClient();
  const tenant = useTenantScope();
  const teamId = tenant.teamId;
  const queriesEnabled = tenant.ready && teamId !== null && Boolean(candidateId);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const {
    data: candidate,
    isPending,
    error,
  } = useQuery({
    queryKey: queryKeys.candidate(teamId, candidateId),
    queryFn: () => candidateQuery(candidateId),
    enabled: queriesEnabled,
    staleTime: 15_000,
  });

  const syncCaches = useCallback(
    async (next: typeof candidate) => {
      if (!next) return;
      queryClient.setQueryData(queryKeys.candidate(teamId, next.id), next);
      await queryClient.invalidateQueries({
        queryKey: [...queryKeys.root(teamId), "candidates"],
      });
    },
    [queryClient, teamId],
  );

  async function handleSubmit(body: CandidateWriteBody) {
    if (!candidate) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const updated = await updateCandidateMutation(candidate.id, body);
      await syncCaches(updated);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Could not save candidate",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function patchArchived(archived: boolean) {
    if (!candidate) return;
    setArchiveBusy(true);
    setArchiveError(null);
    try {
      const updated = await updateCandidateMutation(candidate.id, { archived });
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

  if (tenant.loading || (queriesEnabled && isPending && !candidate)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted">
        <Spinner className="h-8 w-8" label="Loading candidate" />
        <p className="text-sm">Loading candidate…</p>
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

  const errorMsg = error instanceof Error ? error.message : null;
  if (errorMsg && !candidate) {
    return (
      <div className="space-y-4">
        <Link
          href="/people/candidates"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-nexus-intake transition-colors hover:text-atmospheric-grey"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to candidates
        </Link>
        <EmptyState
          title="Candidate not found"
          description={errorMsg}
          icon={<UserRound />}
          className="min-h-[40vh]"
        />
      </div>
    );
  }

  if (!candidate) return null;

  const archived = Boolean(candidate.archived_at);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="hairline-b pb-6">
        <Link
          href="/people/candidates"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-nexus-intake transition-colors hover:text-atmospheric-grey"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to candidates
        </Link>
        <p className="mt-4 nexus-meta text-nexus-approval">People</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="nexus-app-title text-balance text-atmospheric-grey">
            {candidate.full_name}
          </h1>
          <CandidateConsentPill status={candidate.consent_status} />
          {archived ? (
            <span className="inline-flex min-h-[1.5rem] items-center rounded-full border border-border-strong bg-surface-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted">
              Archived
            </span>
          ) : null}
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Edit identity and provenance. Archive hides the candidate from the
          default list without deleting them. This does not rank or send email.
        </p>
        {candidate.email ? (
          <div className="mt-4">
            <Link
              href={`/people/email?type=candidate&id=${encodeURIComponent(candidate.id)}`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-strong bg-surface-muted px-5 py-2.5 text-sm font-medium text-atmospheric-grey transition-colors duration-interaction hover:bg-surface-elevated"
            >
              Compose email
            </Link>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">
            Add an email address to compose a letter from People.
          </p>
        )}
      </header>

      {archived ? (
        <div className="rounded-xl border border-border-strong bg-surface-muted px-4 py-3 text-sm text-muted">
          This candidate is archived and hidden from the default list.
        </div>
      ) : null}

      <section className="app-glass-card rounded-xl p-5 sm:p-6">
        <CandidateForm
          key={candidate.id + candidate.updated_at}
          candidate={candidate}
          submitting={submitting}
          error={formError}
          onSubmit={handleSubmit}
        />
      </section>

      <section className="app-glass-card rounded-xl p-5 sm:p-6">
        <h2 className="nexus-section-title text-atmospheric-grey">Archive</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Archiving hides the candidate from the default list. It does not
          change consent or contact anyone.
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
              Archive candidate
            </Button>
          )}
        </div>
      </section>

      {archiveOpen ? (
        <ConfirmDialog
          title="Archive this candidate?"
          description={
            <p>
              {candidate.full_name} will be hidden from the default candidates
              list. You can restore them later. This does not send email.
            </p>
          }
          confirmLabel="Archive"
          variant="destructive"
          busy={archiveBusy}
          onCancel={() => setArchiveOpen(false)}
          onConfirm={() => void patchArchived(true)}
        />
      ) : null}
    </div>
  );
}
