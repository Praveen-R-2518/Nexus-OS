"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/people/ConfirmDialog";
import {
  PEOPLE_CONTROL_CLASS,
  PeopleField,
} from "@/components/people/PeopleField";
import { CANDIDATE_JOB_STAGE_LABELS } from "@/components/people/pipeline-labels";
import { EMPLOYMENT_STATUS_LABELS } from "@/components/people/status-labels";
import { useTenantScope } from "@/components/tenant/TenantScope";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import {
  applyPeopleEmailFollowUp,
  peopleEmailFollowUpQuery,
  type PeopleEmailFollowUpApplyBody,
} from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";
import type {
  PeopleEmailFollowUpApplyResult,
  PeopleEmailFollowUpProposal,
  PeopleMessageDraft,
} from "@/types";

function employmentConfirmCopy(
  proposal: Extract<PeopleEmailFollowUpProposal, { kind: "set_employment_status" }>,
): { title: string; description: string; confirmLabel: string } {
  const next = EMPLOYMENT_STATUS_LABELS[proposal.employment_status];
  switch (proposal.employment_status) {
    case "resignation_pending":
      return {
        title: "Mark resignation pending?",
        description: `This updates the employee roster to ${next.toLowerCase()}. It does not send another email.`,
        confirmLabel: "Confirm status",
      };
    case "offboarded":
      return {
        title: "Mark as offboarded?",
        description: `This updates the employee roster to ${next.toLowerCase()}. It does not send another email.`,
        confirmLabel: "Confirm status",
      };
    default: {
      const _exhaustive: never = proposal.employment_status;
      return {
        title: "Update employment status?",
        description: String(_exhaustive),
        confirmLabel: "Confirm status",
      };
    }
  }
}

function candidateConfirmCopy(
  proposal: Extract<PeopleEmailFollowUpProposal, { kind: "set_candidate_job_stage" }>,
): { title: string; description: string; confirmLabel: string } {
  return {
    title: `Mark as ${CANDIDATE_JOB_STAGE_LABELS[proposal.stage].toLowerCase()}?`,
    description: `This moves the application for ${proposal.job_title} to ${CANDIDATE_JOB_STAGE_LABELS[proposal.stage]}. It does not send another email.`,
    confirmLabel: "Confirm stage",
  };
}

function confirmCopyFor(proposal: PeopleEmailFollowUpProposal): {
  title: string;
  description: string;
  confirmLabel: string;
} {
  switch (proposal.kind) {
    case "set_employment_status":
      return employmentConfirmCopy(proposal);
    case "set_candidate_job_stage":
      return candidateConfirmCopy(proposal);
    default: {
      const _exhaustive: never = proposal;
      throw new Error(`Unsupported follow-up: ${String(_exhaustive)}`);
    }
  }
}

function applyBodyFor(
  proposal: PeopleEmailFollowUpProposal,
): PeopleEmailFollowUpApplyBody {
  switch (proposal.kind) {
    case "set_employment_status":
      return {
        kind: "set_employment_status",
        employment_status: proposal.employment_status,
      };
    case "set_candidate_job_stage":
      return {
        kind: "set_candidate_job_stage",
        candidate_job_id: proposal.candidate_job_id,
        stage: proposal.stage,
      };
    default: {
      const _exhaustive: never = proposal;
      throw new Error(`Unsupported follow-up: ${String(_exhaustive)}`);
    }
  }
}

function successCopy(result: PeopleEmailFollowUpApplyResult): string {
  switch (result.kind) {
    case "set_employment_status": {
      const status = result.employee?.employment_status;
      if (!status) return "People record updated.";
      return `Roster updated to ${EMPLOYMENT_STATUS_LABELS[status].toLowerCase()}.`;
    }
    case "set_candidate_job_stage": {
      const stage = result.candidate_job?.stage;
      if (!stage) return "People record updated.";
      return `Application moved to ${CANDIDATE_JOB_STAGE_LABELS[stage]}.`;
    }
    default: {
      const _exhaustive: never = result.kind;
      return String(_exhaustive);
    }
  }
}

export function PeopleEmailFollowUp({ draft }: { draft: PeopleMessageDraft }) {
  const queryClient = useQueryClient();
  const tenant = useTenantScope();
  const teamId = tenant.teamId;
  const sent = draft.status === "sent";

  const [dismissed, setDismissed] = useState(false);
  const [applied, setApplied] = useState<PeopleEmailFollowUpApplyResult | null>(
    null,
  );
  const [selectedJobId, setSelectedJobId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: queryKeys.peopleEmailFollowUp(teamId, draft.id),
    queryFn: () => peopleEmailFollowUpQuery(draft.id),
    enabled: sent && !dismissed && applied === null && teamId !== null,
    staleTime: 15_000,
  });

  const proposals = useMemo(
    () => query.data?.proposals ?? [],
    [query.data?.proposals],
  );
  const employmentProposal = proposals.find(
    (row): row is Extract<PeopleEmailFollowUpProposal, { kind: "set_employment_status" }> =>
      row.kind === "set_employment_status",
  );
  const stageProposals = useMemo(
    () =>
      proposals.filter(
        (
          row,
        ): row is Extract<
          PeopleEmailFollowUpProposal,
          { kind: "set_candidate_job_stage" }
        > => row.kind === "set_candidate_job_stage",
      ),
    [proposals],
  );

  const selectedStage = useMemo(() => {
    if (stageProposals.length === 1) return stageProposals[0];
    return (
      stageProposals.find((row) => row.candidate_job_id === selectedJobId) ??
      null
    );
  }, [selectedJobId, stageProposals]);

  const pendingProposal = employmentProposal ?? selectedStage;
  const confirmCopy = pendingProposal ? confirmCopyFor(pendingProposal) : null;

  async function handleConfirm() {
    if (!pendingProposal) return;
    setBusy(true);
    setError(null);
    try {
      const result = await applyPeopleEmailFollowUp(
        draft.id,
        applyBodyFor(pendingProposal),
      );
      setApplied(result);
      setConfirmOpen(false);
      await queryClient.invalidateQueries({
        queryKey: [...queryKeys.root(teamId), "employees"],
      });
      await queryClient.invalidateQueries({
        queryKey: [...queryKeys.root(teamId), "job-candidates"],
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.peopleEmailFollowUp(teamId, draft.id),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply follow-up");
    } finally {
      setBusy(false);
    }
  }

  if (!sent || dismissed) return null;

  if (applied) {
    return (
      <section className="app-glass-card space-y-2 rounded-xl p-5 sm:p-6">
        <h2 className="nexus-section-title text-atmospheric-grey">
          Follow-up applied
        </h2>
        <p className="text-sm text-muted">{successCopy(applied)}</p>
      </section>
    );
  }

  if (query.isPending) {
    return (
      <section className="app-glass-card flex items-center gap-3 rounded-xl p-5 text-sm text-muted sm:p-6">
        <Spinner className="h-4 w-4" label="Loading follow-up" />
        Checking optional next steps…
      </section>
    );
  }

  if (query.error) {
    return (
      <section className="app-glass-card space-y-2 rounded-xl p-5 sm:p-6">
        <h2 className="nexus-section-title text-atmospheric-grey">
          Optional next step
        </h2>
        <p
          role="alert"
          className="border border-status-critical-border bg-status-critical-surface px-3 py-2 font-mono text-xs text-status-critical"
        >
          {query.error instanceof Error
            ? query.error.message
            : "Could not load follow-up options"}
        </p>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => setDismissed(true)}>
            Not now
          </Button>
        </div>
      </section>
    );
  }

  if (proposals.length === 0) return null;

  return (
    <section className="app-glass-card space-y-4 rounded-xl p-5 sm:p-6">
      <div>
        <h2 className="nexus-section-title text-atmospheric-grey">
          Optional next step
        </h2>
        <p className="mt-2 text-sm text-muted">
          The email is already sent. Confirm a roster or pipeline update only if
          you want it. Skip if nothing should change.
        </p>
      </div>

      {employmentProposal ? (
        <p className="text-sm text-atmospheric-grey">
          Current status:{" "}
          {EMPLOYMENT_STATUS_LABELS[employmentProposal.from_status]}.
        </p>
      ) : null}

      {stageProposals.length > 1 ? (
        <PeopleField id="people-email-follow-up-job" label="Application">
          <select
            id="people-email-follow-up-job"
            className={PEOPLE_CONTROL_CLASS}
            value={selectedJobId}
            disabled={busy}
            onChange={(event) => setSelectedJobId(event.target.value)}
          >
            <option value="">Select a job</option>
            {stageProposals.map((row) => (
              <option key={row.candidate_job_id} value={row.candidate_job_id}>
                {row.job_title} ({CANDIDATE_JOB_STAGE_LABELS[row.from_stage]})
              </option>
            ))}
          </select>
        </PeopleField>
      ) : null}

      {stageProposals.length === 1 ? (
        <p className="text-sm text-atmospheric-grey">
          {stageProposals[0].job_title} is currently{" "}
          {CANDIDATE_JOB_STAGE_LABELS[stageProposals[0].from_stage]}.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="border border-status-critical-border bg-status-critical-surface px-3 py-2 font-mono text-xs text-status-critical"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => setDismissed(true)}
          disabled={busy}
        >
          Not now
        </Button>
        <Button
          onClick={() => {
            setError(null);
            setConfirmOpen(true);
          }}
          disabled={busy || !pendingProposal}
        >
          {employmentProposal
            ? `Mark as ${EMPLOYMENT_STATUS_LABELS[employmentProposal.employment_status].toLowerCase()}`
            : "Mark as contacted"}
        </Button>
      </div>

      {confirmOpen && confirmCopy ? (
        <ConfirmDialog
          title={confirmCopy.title}
          description={<p>{confirmCopy.description}</p>}
          confirmLabel={confirmCopy.confirmLabel}
          busy={busy}
          onCancel={() => {
            if (!busy) setConfirmOpen(false);
          }}
          onConfirm={() => void handleConfirm()}
        />
      ) : null}
    </section>
  );
}
