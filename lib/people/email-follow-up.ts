import "server-only";

import { writeAuditEvent } from "@/lib/audit";
import {
  getDraft,
  type PeopleEmailErr,
  type PeopleEmailOk,
} from "@/lib/people/email-drafts";
import { updateCandidateJobPipeline } from "@/lib/people/candidate-jobs";
import {
  getEmployee,
  updateEmployee,
  type PeopleTenantContext,
} from "@/lib/people/employees";
import {
  CANDIDATE_JOB_STAGES,
  PEOPLE_EMAIL_FOLLOW_UP_EMPLOYMENT_STATUSES,
  PEOPLE_EMAIL_FOLLOW_UP_KINDS,
  PEOPLE_EMAIL_FOLLOW_UP_STAGE,
  type CandidateJobStage,
  type EmploymentStatus,
  type PeopleEmailFollowUpApplyResult,
  type PeopleEmailFollowUpEmploymentStatus,
  type PeopleEmailFollowUpKind,
  type PeopleEmailFollowUpList,
  type PeopleEmailFollowUpProposal,
  type PeopleMessageDraft,
} from "@/types";

const FOLLOW_UP_FIELDS = [
  "kind",
  "employment_status",
  "candidate_job_id",
  "stage",
] as const;

const CONTACTABLE_STAGES: readonly CandidateJobStage[] = [
  "new",
  "shortlisted",
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CandidateJobFollowRow = {
  id: string;
  candidate_id: string;
  job_id: string;
  stage: CandidateJobStage;
  job_title: string;
};

function fail(status: number, error: string): PeopleEmailErr {
  return { ok: false, status, error };
}

function isErr(value: { ok?: boolean }): value is PeopleEmailErr {
  return value.ok === false;
}

function unknownKeys(
  body: Record<string, unknown>,
  allowed: readonly string[],
): string[] {
  return Object.keys(body).filter((key) => !allowed.includes(key));
}

function isFollowUpKind(value: unknown): value is PeopleEmailFollowUpKind {
  return (
    typeof value === "string" &&
    (PEOPLE_EMAIL_FOLLOW_UP_KINDS as readonly string[]).includes(value)
  );
}

function isFollowUpEmploymentStatus(
  value: unknown,
): value is PeopleEmailFollowUpEmploymentStatus {
  return (
    typeof value === "string" &&
    (PEOPLE_EMAIL_FOLLOW_UP_EMPLOYMENT_STATUSES as readonly string[]).includes(
      value,
    )
  );
}

function isCandidateJobStage(value: unknown): value is CandidateJobStage {
  return (
    typeof value === "string" &&
    (CANDIDATE_JOB_STAGES as readonly string[]).includes(value)
  );
}

function requireSentDraft(
  draft: PeopleMessageDraft,
): PeopleEmailErr | { ok: true } {
  switch (draft.status) {
    case "sent":
      return { ok: true };
    case "draft":
      return fail(409, "Email has not been sent");
    case "discarded":
      return fail(409, "Discarded drafts cannot receive follow-up");
    default: {
      const _exhaustive: never = draft.status;
      return fail(409, `Unsupported draft status: ${String(_exhaustive)}`);
    }
  }
}

function nextEmploymentFollowUp(
  current: EmploymentStatus,
): PeopleEmailFollowUpEmploymentStatus | null {
  switch (current) {
    case "active":
    case "onboarding":
      return "resignation_pending";
    case "resignation_pending":
      return "offboarded";
    case "offboarded":
      return null;
    default: {
      const _exhaustive: never = current;
      return _exhaustive;
    }
  }
}

function employmentFollowUpAllowed(
  current: EmploymentStatus,
  requested: PeopleEmailFollowUpEmploymentStatus,
): boolean {
  if (current === requested) return true;
  return nextEmploymentFollowUp(current) === requested;
}

function stageFollowUpAllowed(current: CandidateJobStage): boolean {
  switch (current) {
    case "new":
    case "shortlisted":
    case "contacted":
      return true;
    case "decision":
      return false;
    default: {
      const _exhaustive: never = current;
      return _exhaustive;
    }
  }
}

async function requireSent(
  ctx: PeopleTenantContext,
  draftId: string,
): Promise<PeopleEmailOk<PeopleMessageDraft> | PeopleEmailErr> {
  const existing = await getDraft(ctx, draftId);
  if (!existing.ok) return existing;
  const sent = requireSentDraft(existing.data);
  if (!sent.ok) return sent;
  return existing;
}

function employeeProposal(
  employeeId: string,
  status: EmploymentStatus,
): PeopleEmailFollowUpProposal | null {
  const next = nextEmploymentFollowUp(status);
  if (!next) return null;
  return {
    kind: "set_employment_status",
    employee_id: employeeId,
    from_status: status,
    employment_status: next,
  };
}

function candidateJobProposal(
  row: CandidateJobFollowRow,
): PeopleEmailFollowUpProposal | null {
  if (!CONTACTABLE_STAGES.includes(row.stage)) return null;
  return {
    kind: "set_candidate_job_stage",
    candidate_job_id: row.id,
    candidate_id: row.candidate_id,
    job_id: row.job_id,
    job_title: row.job_title,
    from_stage: row.stage,
    stage: PEOPLE_EMAIL_FOLLOW_UP_STAGE,
  };
}

async function listCandidateJobsForFollowUp(
  ctx: PeopleTenantContext,
  candidateId: string,
): Promise<PeopleEmailOk<CandidateJobFollowRow[]> | PeopleEmailErr> {
  const { data, error } = await ctx.supabase
    .from("candidate_jobs")
    .select("id, candidate_id, job_id, stage")
    .eq("candidate_id", candidateId)
    .eq("team_id", ctx.teamId);

  if (error) return fail(500, error.message);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const jobIds = [
    ...new Set(
      rows
        .map((row) => (typeof row.job_id === "string" ? row.job_id : ""))
        .filter(Boolean),
    ),
  ];

  const titles = new Map<string, string>();
  if (jobIds.length > 0) {
    const jobs = await ctx.supabase
      .from("jobs")
      .select("id, title")
      .eq("team_id", ctx.teamId)
      .in("id", jobIds);
    if (jobs.error) return fail(500, jobs.error.message);
    for (const job of jobs.data ?? []) {
      const id = typeof job.id === "string" ? job.id : "";
      if (!id) continue;
      titles.set(id, typeof job.title === "string" ? job.title : "Untitled role");
    }
  }

  const mapped: CandidateJobFollowRow[] = [];
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id : "";
    const jobId = typeof row.job_id === "string" ? row.job_id : "";
    const candId = typeof row.candidate_id === "string" ? row.candidate_id : "";
    if (!id || !jobId || !candId) continue;
    if (!isCandidateJobStage(row.stage)) continue;
    mapped.push({
      id,
      candidate_id: candId,
      job_id: jobId,
      stage: row.stage,
      job_title: titles.get(jobId) ?? "Untitled role",
    });
  }

  return { ok: true, data: mapped };
}

async function proposalsForDraft(
  ctx: PeopleTenantContext,
  draft: PeopleMessageDraft,
): Promise<PeopleEmailOk<PeopleEmailFollowUpProposal[]> | PeopleEmailErr> {
  switch (draft.recipient_type) {
    case "employee": {
      if (!draft.employee_id) return fail(400, "Draft is missing employee_id");
      const employee = await getEmployee(ctx, draft.employee_id);
      if (!employee.ok) return employee;
      const proposal = employeeProposal(
        employee.data.id,
        employee.data.employment_status,
      );
      return { ok: true, data: proposal ? [proposal] : [] };
    }
    case "candidate": {
      if (!draft.candidate_id) return fail(400, "Draft is missing candidate_id");
      const jobs = await listCandidateJobsForFollowUp(ctx, draft.candidate_id);
      if (!jobs.ok) return jobs;
      return {
        ok: true,
        data: jobs.data
          .map(candidateJobProposal)
          .filter((row): row is PeopleEmailFollowUpProposal => row !== null),
      };
    }
    default: {
      const _exhaustive: never = draft.recipient_type;
      return fail(400, `Unsupported recipient_type: ${String(_exhaustive)}`);
    }
  }
}

export async function listFollowUpProposals(
  ctx: PeopleTenantContext,
  draftId: string,
): Promise<PeopleEmailOk<PeopleEmailFollowUpList> | PeopleEmailErr> {
  const draft = await requireSent(ctx, draftId);
  if (!draft.ok) return draft;

  const proposals = await proposalsForDraft(ctx, draft.data);
  if (!proposals.ok) return proposals;

  return {
    ok: true,
    data: { draft_id: draft.data.id, proposals: proposals.data },
  };
}

function parseApplyBody(
  body: Record<string, unknown>,
):
  | {
      ok: true;
      kind: "set_employment_status";
      employmentStatus: PeopleEmailFollowUpEmploymentStatus;
    }
  | {
      ok: true;
      kind: "set_candidate_job_stage";
      candidateJobId: string;
      stage: typeof PEOPLE_EMAIL_FOLLOW_UP_STAGE;
    }
  | PeopleEmailErr {
  const extra = unknownKeys(body, FOLLOW_UP_FIELDS);
  if (extra.length > 0) {
    return fail(400, `Unexpected fields: ${extra.join(", ")}`);
  }
  if (!isFollowUpKind(body.kind)) {
    return fail(
      400,
      `kind must be one of: ${PEOPLE_EMAIL_FOLLOW_UP_KINDS.join(", ")}`,
    );
  }

  switch (body.kind) {
    case "set_employment_status": {
      if (Object.prototype.hasOwnProperty.call(body, "candidate_job_id")) {
        return fail(400, "candidate_job_id is not valid for this kind");
      }
      if (Object.prototype.hasOwnProperty.call(body, "stage")) {
        return fail(400, "stage is not valid for this kind");
      }
      if (!isFollowUpEmploymentStatus(body.employment_status)) {
        return fail(
          400,
          `employment_status must be one of: ${PEOPLE_EMAIL_FOLLOW_UP_EMPLOYMENT_STATUSES.join(", ")}`,
        );
      }
      return {
        ok: true,
        kind: "set_employment_status",
        employmentStatus: body.employment_status,
      };
    }
    case "set_candidate_job_stage": {
      if (Object.prototype.hasOwnProperty.call(body, "employment_status")) {
        return fail(400, "employment_status is not valid for this kind");
      }
      if (
        typeof body.candidate_job_id !== "string" ||
        !UUID_RE.test(body.candidate_job_id.trim())
      ) {
        return fail(400, "candidate_job_id must be a UUID");
      }
      if (body.stage !== PEOPLE_EMAIL_FOLLOW_UP_STAGE) {
        return fail(
          400,
          `stage must be ${PEOPLE_EMAIL_FOLLOW_UP_STAGE}`,
        );
      }
      return {
        ok: true,
        kind: "set_candidate_job_stage",
        candidateJobId: body.candidate_job_id.trim(),
        stage: PEOPLE_EMAIL_FOLLOW_UP_STAGE,
      };
    }
    default: {
      const _exhaustive: never = body.kind;
      return fail(400, `Unsupported kind: ${String(_exhaustive)}`);
    }
  }
}

async function recordFollowUpAudit(
  ctx: PeopleTenantContext,
  input: {
    draftId: string;
    kind: PeopleEmailFollowUpKind;
    entityType: "employee" | "candidate_job";
    entityId: string;
    prevState: Record<string, unknown>;
    nextState: Record<string, unknown>;
  },
): Promise<PeopleEmailErr | { ok: true }> {
  const audit = await writeAuditEvent(ctx, {
    domain: "people",
    action: "follow_up",
    entityType: input.entityType,
    entityId: input.entityId,
    prevState: input.prevState,
    nextState: input.nextState,
    metadata: { draft_id: input.draftId, kind: input.kind },
  });
  if (!audit.ok) return fail(500, audit.error);
  return { ok: true };
}

async function applyEmploymentFollowUp(
  ctx: PeopleTenantContext,
  draft: PeopleMessageDraft,
  employmentStatus: PeopleEmailFollowUpEmploymentStatus,
): Promise<PeopleEmailOk<PeopleEmailFollowUpApplyResult> | PeopleEmailErr> {
  if (draft.recipient_type !== "employee" || !draft.employee_id) {
    return fail(400, "This follow-up kind is only valid for employee emails");
  }

  const existing = await getEmployee(ctx, draft.employee_id);
  if (!existing.ok) return existing;

  if (!employmentFollowUpAllowed(existing.data.employment_status, employmentStatus)) {
    return fail(400, "employment_status is not a valid follow-up from the current status");
  }

  const skipped = existing.data.employment_status === employmentStatus;
  const updated = skipped
    ? existing
    : await updateEmployee(ctx, existing.data.id, {
        employment_status: employmentStatus,
      });
  if (!updated.ok) return updated;

  if (!skipped) {
    const audit = await recordFollowUpAudit(ctx, {
      draftId: draft.id,
      kind: "set_employment_status",
      entityType: "employee",
      entityId: updated.data.id,
      prevState: { employment_status: existing.data.employment_status },
      nextState: { employment_status: updated.data.employment_status },
    });
    if (isErr(audit)) return audit;
  }

  return {
    ok: true,
    data: {
      draft_id: draft.id,
      kind: "set_employment_status",
      skipped,
      employee: updated.data,
      candidate_job: null,
    },
  };
}

async function applyCandidateStageFollowUp(
  ctx: PeopleTenantContext,
  draft: PeopleMessageDraft,
  candidateJobId: string,
): Promise<PeopleEmailOk<PeopleEmailFollowUpApplyResult> | PeopleEmailErr> {
  if (draft.recipient_type !== "candidate" || !draft.candidate_id) {
    return fail(400, "This follow-up kind is only valid for candidate emails");
  }

  const jobs = await listCandidateJobsForFollowUp(ctx, draft.candidate_id);
  if (!jobs.ok) return jobs;
  const match = jobs.data.find((row) => row.id === candidateJobId);
  if (!match) {
    return fail(400, "candidate_job_id does not belong to this recipient");
  }
  if (!stageFollowUpAllowed(match.stage)) {
    return fail(400, "stage is not a valid follow-up from the current pipeline stage");
  }

  const skipped = match.stage === PEOPLE_EMAIL_FOLLOW_UP_STAGE;
  const updated = await updateCandidateJobPipeline(ctx, match.id, {
    stage: PEOPLE_EMAIL_FOLLOW_UP_STAGE,
  });
  if (!updated.ok) return updated;

  if (!skipped) {
    const audit = await recordFollowUpAudit(ctx, {
      draftId: draft.id,
      kind: "set_candidate_job_stage",
      entityType: "candidate_job",
      entityId: updated.data.id,
      prevState: { stage: match.stage },
      nextState: { stage: updated.data.stage },
    });
    if (isErr(audit)) return audit;
  }

  return {
    ok: true,
    data: {
      draft_id: draft.id,
      kind: "set_candidate_job_stage",
      skipped,
      employee: null,
      candidate_job: updated.data,
    },
  };
}

export async function applyFollowUp(
  ctx: PeopleTenantContext,
  draftId: string,
  body: Record<string, unknown>,
): Promise<PeopleEmailOk<PeopleEmailFollowUpApplyResult> | PeopleEmailErr> {
  const parsed = parseApplyBody(body);
  if (isErr(parsed)) return parsed;

  const draft = await requireSent(ctx, draftId);
  if (!draft.ok) return draft;

  switch (parsed.kind) {
    case "set_employment_status":
      return applyEmploymentFollowUp(ctx, draft.data, parsed.employmentStatus);
    case "set_candidate_job_stage":
      return applyCandidateStageFollowUp(ctx, draft.data, parsed.candidateJobId);
    default: {
      const _exhaustive: never = parsed;
      return fail(400, `Unsupported kind: ${String(_exhaustive)}`);
    }
  }
}
