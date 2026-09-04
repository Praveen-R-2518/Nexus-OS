"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UserPlus, X } from "lucide-react";
import { CONSENT_STATUS_LABELS } from "@/components/people/consent-labels";
import { PEOPLE_CONTROL_CLASS } from "@/components/people/PeopleField";
import { useTenantScope } from "@/components/tenant/TenantScope";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { importCandidateFromSource } from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";
import {
  GITHUB_IMPORT_CONSENT_STATUSES,
  type Candidate,
  type GithubImportConsentStatus,
} from "@/types";

type JobOption = {
  id: string;
  title: string;
};

export function CandidateGithubImport({
  open,
  onClose,
  jobId: lockedJobId,
  jobTitle,
  jobs = [],
}: {
  open: boolean;
  onClose: () => void;
  jobId?: string;
  jobTitle?: string;
  jobs?: JobOption[];
}) {
  const queryClient = useQueryClient();
  const tenant = useTenantScope();
  const teamId = tenant.teamId;

  const [selectedJobId, setSelectedJobId] = useState("");
  const [ref, setRef] = useState("");
  const [consent, setConsent] = useState<GithubImportConsentStatus>(
    "owner_imported",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    candidate: Candidate;
    created: boolean;
    attached: boolean;
  } | null>(null);

  const effectiveJobId = lockedJobId ?? selectedJobId;
  const jobLocked = Boolean(lockedJobId);

  useEffect(() => {
    if (!open) return;
    setSelectedJobId("");
    setRef("");
    setConsent("owner_imported");
    setBusy(false);
    setError(null);
    setResult(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose, open]);

  function reset() {
    setSelectedJobId("");
    setRef("");
    setConsent("owner_imported");
    setBusy(false);
    setError(null);
    setResult(null);
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  async function onImport() {
    const trimmed = ref.trim();
    if (!trimmed) {
      setError("GitHub username or profile URL is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await importCandidateFromSource({
        source: "github",
        ref: trimmed,
        consent_status: consent,
        ...(effectiveJobId ? { job_id: effectiveJobId } : {}),
      });
      setResult({
        candidate: next.data,
        created: next.created,
        attached: next.attached,
      });
      if (teamId) {
        await queryClient.invalidateQueries({
          queryKey: [...queryKeys.root(teamId), "candidates"],
        });
        if (effectiveJobId) {
          await queryClient.invalidateQueries({
            queryKey: [...queryKeys.root(teamId), "job-candidates", effectiveJobId],
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "GitHub import failed");
    } finally {
      setBusy(false);
    }
  }

  const selectedJobLabel =
    jobTitle ??
    jobs.find((job) => job.id === effectiveJobId)?.title ??
    "Selected job";

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="people-candidate-github-import-title"
      onClick={() => {
        if (!busy) close();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-glass-border bg-glass shadow-2xl backdrop-blur-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-6">
          <div>
            <h2
              id="people-candidate-github-import-title"
              className="text-base font-semibold text-atmospheric-grey"
            >
              Add from GitHub
            </h2>
            <p className="mt-1 text-sm text-muted">
              Paste one public GitHub username or profile URL you picked. This
              does not mean they applied, and it does not search GitHub.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            aria-label="Close"
            className="text-muted transition-colors hover:text-atmospheric-grey disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {jobLocked ? (
            <div className="rounded-xl border border-border-strong bg-surface-muted px-3 py-2 text-sm text-atmospheric-grey">
              Job: <span className="font-medium">{selectedJobLabel}</span>
            </div>
          ) : jobs.length > 0 ? (
            <div className="space-y-2">
              <label
                className="block text-sm font-medium text-atmospheric-grey"
                htmlFor="candidate-github-job"
              >
                Attach to job (optional)
              </label>
              <select
                id="candidate-github-job"
                value={selectedJobId}
                disabled={busy || Boolean(result)}
                onChange={(event) => setSelectedJobId(event.target.value)}
                className={PEOPLE_CONTROL_CLASS}
              >
                <option value="">None — add to candidates only</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="space-y-2">
            <label
              className="block text-sm font-medium text-atmospheric-grey"
              htmlFor="candidate-github-ref"
            >
              GitHub profile
            </label>
            <input
              id="candidate-github-ref"
              type="text"
              value={ref}
              disabled={busy || Boolean(result)}
              onChange={(event) => setRef(event.target.value)}
              placeholder="octocat or https://github.com/octocat"
              maxLength={200}
              autoComplete="off"
              className={PEOPLE_CONTROL_CLASS}
            />
          </div>

          <div className="space-y-2">
            <label
              className="block text-sm font-medium text-atmospheric-grey"
              htmlFor="candidate-github-consent"
            >
              Consent
            </label>
            <select
              id="candidate-github-consent"
              value={consent}
              disabled={busy || Boolean(result)}
              onChange={(event) =>
                setConsent(event.target.value as GithubImportConsentStatus)
              }
              className={PEOPLE_CONTROL_CLASS}
            >
              {GITHUB_IMPORT_CONSENT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {CONSENT_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted">
              You are importing a public profile. Do not mark this as applied
              unless they applied.
            </p>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-status-critical-border bg-status-critical-surface px-3 py-2 font-mono text-xs text-status-critical"
            >
              {error}
            </p>
          ) : null}

          {result ? (
            <div className="rounded-xl border border-status-positive-border bg-status-positive-surface px-3 py-2 text-sm text-status-positive">
              {result.created
                ? `Added ${result.candidate.full_name}.`
                : `${result.candidate.full_name} is already in your list.`}
              {result.attached ? " Attached to the job at stage New." : ""}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4">
          <Button variant="secondary" onClick={close} disabled={busy}>
            {result ? "Done" : "Cancel"}
          </Button>
          {!result ? (
            <Button onClick={() => void onImport()} disabled={busy || !ref.trim()}>
              {busy ? (
                <Spinner className="h-4 w-4" label="Importing" />
              ) : (
                <UserPlus className="h-4 w-4" aria-hidden />
              )}
              Add from GitHub
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
