import "server-only";

import { writeAuditEvent } from "@/lib/audit";
import {
  PEOPLE_READ_QUERY_MAX,
  PEOPLE_READ_ROW_LIMIT,
} from "@/lib/chat/people-tools";
import { updateCandidateJobPipeline, getCandidateJob } from "@/lib/people/candidate-jobs";
import { getCandidate, listCandidates } from "@/lib/people/candidates";
import {
  getEmployee,
  listEmployees,
  updateEmployee,
  type PeopleTenantContext,
} from "@/lib/people/employees";
import { getJob, listJobs } from "@/lib/people/jobs";
import {
  CANDIDATE_JOB_STAGES,
  CHAT_PROPOSED_ACTION_KINDS,
  CHAT_PROPOSED_ACTION_STATUSES,
  EMPLOYMENT_STATUSES,
  type CandidateJobStage,
  type ChatProposedAction,
  type ChatProposedActionKind,
  type ChatProposedActionStatus,
  type ChatProposedEmploymentPayload,
  type ChatProposedPipelinePayload,
  type EmploymentStatus,
} from "@/types";

/**
 * G3 — closed allowlist of confirmation-gated People propose tools.
 * Tools persist pending rows. They never mutate employees or candidate_jobs.
 */

export const PEOPLE_PROPOSE_PENDING_CAP = 5;
export const PEOPLE_PROPOSE_TTL_MS = 24 * 60 * 60 * 1000;
export const PEOPLE_PROPOSE_LIST_LIMIT = 20;

export const PEOPLE_PROPOSE_TOOL_NAMES = [
  "propose_pipeline_stage",
  "propose_employment_status",
] as const;

export type PeopleProposeToolName = (typeof PEOPLE_PROPOSE_TOOL_NAMES)[number];

export type PeopleProposeContext = PeopleTenantContext & {
  sessionId: string;
};

export type PeopleProposeErr = { ok: false; status: number; error: string };
export type PeopleProposeOk<T> = { ok: true; data: T };
export type PeopleConfirmOk = {
  ok: true;
  data: ChatProposedAction;
  skipped: boolean;
};

type PeopleProposeToolDefinition = {
  type: "function";
  function: {
    name: PeopleProposeToolName;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
      additionalProperties: false;
    };
  };
};

const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  active: "Active",
  onboarding: "Onboarding",
  resignation_pending: "Resignation pending",
  offboarded: "Offboarded",
};

const STAGE_LABELS: Record<CandidateJobStage, string> = {
  new: "New",
  shortlisted: "Shortlisted",
  contacted: "Contacted",
  decision: "Decision",
};

const DESTRUCTIVE_STATUSES: readonly EmploymentStatus[] = [
  "resignation_pending",
  "offboarded",
];

type ActionRow = {
  id: string;
  team_id: string;
  workspace_id: string | null;
  session_id: string;
  kind: ChatProposedActionKind;
  status: ChatProposedActionStatus;
  payload: unknown;
  summary: string;
  created_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export const PEOPLE_PROPOSE_TOOLS: PeopleProposeToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "propose_pipeline_stage",
      description:
        "Queue a confirmation to move a named candidate on a named job to a pipeline stage. Does not change anything until the founder clicks Confirm in Chat. Never email, hire, or reject.",
      parameters: {
        type: "object",
        properties: {
          candidate: {
            type: "string",
            description: "Candidate name (max 80 characters).",
          },
          job: {
            type: "string",
            description: "Job title substring (max 80 characters).",
          },
          stage: {
            type: "string",
            enum: [...CANDIDATE_JOB_STAGES],
            description: "Target pipeline stage.",
          },
        },
        required: ["candidate", "job", "stage"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_employment_status",
      description:
        "Queue a confirmation to change a named employee's employment status. Does not change anything until the founder clicks Confirm in Chat. Never email, hire, or reject.",
      parameters: {
        type: "object",
        properties: {
          q: {
            type: "string",
            description: "Employee name (max 80 characters).",
          },
          employment_status: {
            type: "string",
            enum: [...EMPLOYMENT_STATUSES],
            description: "Target employment status.",
          },
        },
        required: ["q", "employment_status"],
        additionalProperties: false,
      },
    },
  },
];

export function isPeopleProposeToolName(
  name: string,
): name is PeopleProposeToolName {
  return (PEOPLE_PROPOSE_TOOL_NAMES as readonly string[]).includes(name);
}

export function isChatActionDecision(
  value: unknown,
): value is "confirm" | "cancel" {
  return value === "confirm" || value === "cancel";
}

export async function executePeopleProposeTool(
  name: string,
  rawArgs: unknown,
  ctx: PeopleProposeContext,
): Promise<string> {
  if (!isPeopleProposeToolName(name)) {
    return errJson("Unknown tool");
  }

  switch (name) {
    case "propose_employment_status":
      return proposeEmploymentStatusTool(rawArgs, ctx);
    case "propose_pipeline_stage":
      return proposePipelineStageTool(rawArgs, ctx);
    default: {
      const _never: never = name;
      return errJson(`Unhandled tool: ${String(_never)}`);
    }
  }
}

export async function listProposedActions(
  ctx: PeopleProposeContext,
): Promise<PeopleProposeOk<ChatProposedAction[]> | PeopleProposeErr> {
  const sessionId = boundSessionId(ctx.sessionId);
  if (!sessionId) return fail(400, "session_id is required");

  const session = await requireSession(ctx, sessionId);
  if (!session.ok) return session;

  const expired = await expireStalePending(ctx, sessionId);
  if (!expired.ok) return expired;

  const { data, error } = await ctx.supabase
    .from("chat_proposed_actions")
    .select("*")
    .eq("team_id", ctx.teamId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(PEOPLE_PROPOSE_LIST_LIMIT);

  if (error) return fail(500, error.message);
  const rows = ((data ?? []) as unknown[])
    .map(mapActionRow)
    .filter((row): row is ActionRow => row !== null)
    .map(toPublic)
    .filter((row): row is ChatProposedAction => row !== null);
  return { ok: true, data: rows };
}

export async function confirmProposedAction(
  ctx: PeopleProposeContext,
  id: string,
): Promise<PeopleConfirmOk | PeopleProposeErr> {
  const existing = await loadAction(ctx, id);
  if (!existing.ok) return existing;

  const pending = await requirePending(ctx, existing.data);
  if (!pending.ok) return pending;

  const kind = pending.data.kind;
  switch (kind) {
    case "set_employment_status":
      return confirmEmployment(ctx, pending.data);
    case "set_pipeline_stage":
      return confirmPipeline(ctx, pending.data);
    default: {
      const _never: never = kind;
      return fail(500, `Unhandled kind: ${String(_never)}`);
    }
  }
}

export async function cancelProposedAction(
  ctx: PeopleProposeContext,
  id: string,
): Promise<PeopleProposeOk<ChatProposedAction> | PeopleProposeErr> {
  const existing = await loadAction(ctx, id);
  if (!existing.ok) return existing;

  const pending = await requirePending(ctx, existing.data);
  if (!pending.ok) return pending;

  const saved = await saveAction(ctx, pending.data.id, {
    status: "cancelled",
    error: null,
  });
  if (!saved.ok) return saved;
  const dto = toPublic(saved.data);
  if (!dto) return fail(500, "Could not cancel confirmation");
  return { ok: true, data: dto };
}

function fail(status: number, error: string): PeopleProposeErr {
  return { ok: false, status, error };
}

function errJson(error: string): string {
  return JSON.stringify({ error });
}

function boundSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function isKind(value: unknown): value is ChatProposedActionKind {
  return (
    typeof value === "string" &&
    (CHAT_PROPOSED_ACTION_KINDS as readonly string[]).includes(value)
  );
}

function isStatus(value: unknown): value is ChatProposedActionStatus {
  return (
    typeof value === "string" &&
    (CHAT_PROPOSED_ACTION_STATUSES as readonly string[]).includes(value)
  );
}

function isEmploymentStatus(value: unknown): value is EmploymentStatus {
  return (
    typeof value === "string" &&
    (EMPLOYMENT_STATUSES as readonly string[]).includes(value)
  );
}

function isStage(value: unknown): value is CandidateJobStage {
  return (
    typeof value === "string" &&
    (CANDIDATE_JOB_STAGES as readonly string[]).includes(value)
  );
}

type ParseOk<T> = { ok: true; value: T };
type ParseErr = { ok: false; error: string };

function parseArgsObject(raw: unknown): Record<string, unknown> | string {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return "Arguments must be an object";
    } catch {
      return "Invalid JSON arguments";
    }
  }
  if (raw == null) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return "Arguments must be an object";
}

function parseBoundedQuery(value: unknown, field: string): ParseOk<string> | ParseErr {
  if (typeof value !== "string") return { ok: false, error: `${field} is required` };
  const q = value.trim();
  if (!q) return { ok: false, error: `${field} is required` };
  if (q.length > PEOPLE_READ_QUERY_MAX) {
    return {
      ok: false,
      error: `${field} must be at most ${PEOPLE_READ_QUERY_MAX} characters`,
    };
  }
  return { ok: true, value: q };
}

function parseEmploymentArg(value: unknown): ParseOk<EmploymentStatus> | ParseErr {
  if (!isEmploymentStatus(value)) {
    return { ok: false, error: "employment_status is invalid" };
  }
  return { ok: true, value };
}

function parseStageArg(value: unknown): ParseOk<CandidateJobStage> | ParseErr {
  if (!isStage(value)) return { ok: false, error: "stage is invalid" };
  return { ok: true, value };
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function employmentPayload(value: unknown): ChatProposedEmploymentPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const employeeId = asString(row.employee_id);
  const employeeName = asString(row.employee_name);
  if (!employeeId || !employeeName) return null;
  if (!isEmploymentStatus(row.from_status)) return null;
  if (!isEmploymentStatus(row.employment_status)) return null;
  return {
    employee_id: employeeId,
    employee_name: employeeName,
    from_status: row.from_status,
    employment_status: row.employment_status,
  };
}

function pipelinePayload(value: unknown): ChatProposedPipelinePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const candidateJobId = asString(row.candidate_job_id);
  const candidateId = asString(row.candidate_id);
  const jobId = asString(row.job_id);
  const candidateName = asString(row.candidate_name);
  const jobTitle = asString(row.job_title);
  if (!candidateJobId || !candidateId || !jobId || !candidateName || !jobTitle) {
    return null;
  }
  if (!isStage(row.from_stage) || !isStage(row.stage)) return null;
  return {
    candidate_job_id: candidateJobId,
    candidate_id: candidateId,
    job_id: jobId,
    candidate_name: candidateName,
    job_title: jobTitle,
    from_stage: row.from_stage,
    stage: row.stage,
  };
}

function mapActionRow(raw: unknown): ActionRow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = asString(row.id);
  const teamId = asString(row.team_id);
  const sessionId = asString(row.session_id);
  const summary = asString(row.summary);
  const createdAt = asString(row.created_at);
  if (!id || !teamId || !sessionId || !summary || !createdAt) return null;
  if (!isKind(row.kind) || !isStatus(row.status)) return null;
  return {
    id,
    team_id: teamId,
    workspace_id: asString(row.workspace_id),
    session_id: sessionId,
    kind: row.kind,
    status: row.status,
    payload: row.payload,
    summary,
    created_by: asString(row.created_by),
    confirmed_by: asString(row.confirmed_by),
    confirmed_at: asString(row.confirmed_at),
    error: asString(row.error),
    created_at: createdAt,
    updated_at: asString(row.updated_at) ?? createdAt,
  };
}

function toPublic(row: ActionRow): ChatProposedAction | null {
  switch (row.kind) {
    case "set_employment_status": {
      const payload = employmentPayload(row.payload);
      if (!payload) return null;
      return {
        id: row.id,
        kind: row.kind,
        status: row.status,
        summary: row.summary,
        subject_name: payload.employee_name,
        job_title: null,
        from_label: EMPLOYMENT_STATUS_LABELS[payload.from_status],
        to_label: EMPLOYMENT_STATUS_LABELS[payload.employment_status],
        requires_destructive_confirm: DESTRUCTIVE_STATUSES.includes(
          payload.employment_status,
        ),
        error: row.error,
        created_at: row.created_at,
        confirmed_at: row.confirmed_at,
      };
    }
    case "set_pipeline_stage": {
      const payload = pipelinePayload(row.payload);
      if (!payload) return null;
      return {
        id: row.id,
        kind: row.kind,
        status: row.status,
        summary: row.summary,
        subject_name: payload.candidate_name,
        job_title: payload.job_title,
        from_label: STAGE_LABELS[payload.from_stage],
        to_label: STAGE_LABELS[payload.stage],
        requires_destructive_confirm: false,
        error: row.error,
        created_at: row.created_at,
        confirmed_at: row.confirmed_at,
      };
    }
    default: {
      const _never: never = row.kind;
      void _never;
      return null;
    }
  }
}

function isExpired(createdAt: string, now = Date.now()): boolean {
  const ts = Date.parse(createdAt);
  if (!Number.isFinite(ts)) return true;
  return now - ts > PEOPLE_PROPOSE_TTL_MS;
}

async function requireSession(
  ctx: PeopleProposeContext,
  sessionId: string,
): Promise<PeopleProposeOk<{ id: string }> | PeopleProposeErr> {
  const { data, error } = await ctx.supabase
    .from("chat_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("team_id", ctx.teamId)
    .maybeSingle();
  if (error) return fail(500, error.message);
  const id = data && typeof data.id === "string" ? data.id : null;
  if (!id) return fail(404, "Chat session not found");
  return { ok: true, data: { id } };
}

async function loadPendingRows(
  ctx: PeopleProposeContext,
  sessionId: string,
): Promise<PeopleProposeOk<ActionRow[]> | PeopleProposeErr> {
  const { data, error } = await ctx.supabase
    .from("chat_proposed_actions")
    .select("*")
    .eq("team_id", ctx.teamId)
    .eq("session_id", sessionId)
    .eq("status", "pending");
  if (error) return fail(500, error.message);
  const rows = ((data ?? []) as unknown[])
    .map(mapActionRow)
    .filter((row): row is ActionRow => row !== null);
  return { ok: true, data: rows };
}

function sameTarget(
  row: ActionRow,
  kind: ChatProposedActionKind,
  entityId: string,
  toValue: string,
): boolean {
  if (row.kind !== kind) return false;
  if (kind === "set_employment_status") {
    const payload = employmentPayload(row.payload);
    return (
      payload?.employee_id === entityId && payload.employment_status === toValue
    );
  }
  const payload = pipelinePayload(row.payload);
  return payload?.candidate_job_id === entityId && payload.stage === toValue;
}

async function persistPending(
  ctx: PeopleProposeContext,
  input: {
    kind: ChatProposedActionKind;
    payload: ChatProposedEmploymentPayload | ChatProposedPipelinePayload;
    summary: string;
    entityId: string;
    toValue: string;
  },
): Promise<string> {
  const sessionId = boundSessionId(ctx.sessionId);
  if (!sessionId) return errJson("session_id is required");

  const session = await requireSession(ctx, sessionId);
  if (!session.ok) return errJson(session.error);

  const pending = await loadPendingRows(ctx, sessionId);
  if (!pending.ok) return errJson(pending.error);

  const existing = pending.data.find((row) =>
    sameTarget(row, input.kind, input.entityId, input.toValue),
  );
  if (existing) {
    const dto = toPublic(existing);
    if (!dto) return errJson("Could not queue confirmation");
    return JSON.stringify({
      proposed: true,
      action_id: dto.id,
      kind: dto.kind,
      summary: dto.summary,
      from: dto.from_label,
      to: dto.to_label,
    });
  }

  if (pending.data.length >= PEOPLE_PROPOSE_PENDING_CAP) {
    return errJson("Too many pending confirmations in this chat");
  }

  const insert = {
    team_id: ctx.teamId,
    workspace_id: ctx.workspaceId,
    session_id: sessionId,
    kind: input.kind,
    status: "pending" as const,
    payload: input.payload,
    summary: input.summary,
    created_by: ctx.user.id,
  };

  const { data, error } = await ctx.supabase
    .from("chat_proposed_actions")
    .insert(insert)
    .select("*")
    .single();
  if (error) return errJson(error.message || "Could not queue confirmation");
  const row = mapActionRow(data);
  if (!row) return errJson("Could not queue confirmation");

  const entityType =
    input.kind === "set_employment_status" ? "employee" : "candidate_job";
  const audit = await writeAuditEvent(ctx, {
    domain: "people",
    action: "propose",
    entityType,
    entityId: input.entityId,
    prevState: null,
    nextState: { kind: input.kind, summary: input.summary },
    metadata: { source: "chat", action_id: row.id, kind: input.kind },
  });
  if (!audit.ok) return errJson(audit.error);

  const dto = toPublic(row);
  if (!dto) return errJson("Could not queue confirmation");
  return JSON.stringify({
    proposed: true,
    action_id: dto.id,
    kind: dto.kind,
    summary: dto.summary,
    from: dto.from_label,
    to: dto.to_label,
  });
}

async function proposeEmploymentStatusTool(
  rawArgs: unknown,
  ctx: PeopleProposeContext,
): Promise<string> {
  const args = parseArgsObject(rawArgs);
  if (typeof args === "string") return errJson(args);

  const q = parseBoundedQuery(args.q, "q");
  if (!q.ok) return errJson(q.error);
  const status = parseEmploymentArg(args.employment_status);
  if (!status.ok) return errJson(status.error);

  const listed = await listEmployees(ctx, {
    ok: true,
    q: q.value,
    includeArchived: false,
    employmentStatus: null,
    limit: PEOPLE_READ_ROW_LIMIT,
    offset: 0,
  });
  if (!listed.ok) return errJson(listed.error);

  if (listed.data.length === 0) {
    return errJson("No employee matching that name");
  }
  if (listed.data.length > 1) {
    return JSON.stringify({
      disambiguate: true,
      employees: listed.data.map((row) => ({
        name: row.full_name,
        role_title: row.role_title,
        employment_status: row.employment_status,
      })),
    });
  }

  const employee = listed.data[0];
  const toLabel = EMPLOYMENT_STATUS_LABELS[status.value];
  const fromLabel = EMPLOYMENT_STATUS_LABELS[employee.employment_status];
  const summary = `Set ${employee.full_name} from ${fromLabel} to ${toLabel}. Nothing has changed yet — confirm in Chat.`;

  return persistPending(ctx, {
    kind: "set_employment_status",
    payload: {
      employee_id: employee.id,
      employee_name: employee.full_name,
      from_status: employee.employment_status,
      employment_status: status.value,
    },
    summary,
    entityId: employee.id,
    toValue: status.value,
  });
}

async function proposePipelineStageTool(
  rawArgs: unknown,
  ctx: PeopleProposeContext,
): Promise<string> {
  const args = parseArgsObject(rawArgs);
  if (typeof args === "string") return errJson(args);

  const candidateQ = parseBoundedQuery(args.candidate, "candidate");
  if (!candidateQ.ok) return errJson(candidateQ.error);
  const jobQ = parseBoundedQuery(args.job, "job");
  if (!jobQ.ok) return errJson(jobQ.error);
  const stage = parseStageArg(args.stage);
  if (!stage.ok) return errJson(stage.error);

  const candidates = await listCandidates(ctx, {
    ok: true,
    q: candidateQ.value,
    includeArchived: false,
    consentStatus: null,
    limit: PEOPLE_READ_ROW_LIMIT,
    offset: 0,
  });
  if (!candidates.ok) return errJson(candidates.error);

  const jobs = await listJobs(ctx, {
    ok: true,
    q: jobQ.value,
    includeArchived: false,
    status: null,
    limit: PEOPLE_READ_ROW_LIMIT,
    offset: 0,
  });
  if (!jobs.ok) return errJson(jobs.error);

  const manyCandidates = candidates.data.length > 1;
  const manyJobs = jobs.data.length > 1;
  if (candidates.data.length === 0) {
    return errJson("No candidate matching that name");
  }
  if (jobs.data.length === 0) {
    return errJson("No job matching that title");
  }
  if (manyCandidates || manyJobs) {
    return JSON.stringify({
      disambiguate: true,
      candidates: candidates.data.map((row) => ({
        name: row.full_name,
        headline: row.headline,
      })),
      jobs: jobs.data.map((row) => ({ title: row.title })),
    });
  }

  const candidate = candidates.data[0];
  const job = jobs.data[0];
  const { data, error } = await ctx.supabase
    .from("candidate_jobs")
    .select("id, stage, candidate_id, job_id")
    .eq("team_id", ctx.teamId)
    .eq("candidate_id", candidate.id)
    .eq("job_id", job.id)
    .maybeSingle();
  if (error) return errJson(error.message);
  const applicationId = data && typeof data.id === "string" ? data.id : null;
  if (!applicationId || !isStage(data?.stage)) {
    return errJson("That candidate is not on that job");
  }

  const fromStage = data.stage;
  const fromLabel = STAGE_LABELS[fromStage];
  const toLabel = STAGE_LABELS[stage.value];
  const summary = `Move ${candidate.full_name} on ${job.title} from ${fromLabel} to ${toLabel}. Nothing has changed yet — confirm in Chat.`;

  return persistPending(ctx, {
    kind: "set_pipeline_stage",
    payload: {
      candidate_job_id: applicationId,
      candidate_id: candidate.id,
      job_id: job.id,
      candidate_name: candidate.full_name,
      job_title: job.title,
      from_stage: fromStage,
      stage: stage.value,
    },
    summary,
    entityId: applicationId,
    toValue: stage.value,
  });
}

async function loadAction(
  ctx: PeopleProposeContext,
  id: string,
): Promise<PeopleProposeOk<ActionRow> | PeopleProposeErr> {
  const trimmed = id.trim();
  if (!trimmed) return fail(400, "Missing action id");

  const { data, error } = await ctx.supabase
    .from("chat_proposed_actions")
    .select("*")
    .eq("id", trimmed)
    .eq("team_id", ctx.teamId)
    .maybeSingle();
  if (error) return fail(500, error.message);
  const row = mapActionRow(data);
  if (!row) return fail(404, "Confirmation not found");
  return { ok: true, data: row };
}

async function saveAction(
  ctx: PeopleProposeContext,
  id: string,
  patch: Record<string, unknown>,
): Promise<PeopleProposeOk<ActionRow> | PeopleProposeErr> {
  const { data, error } = await ctx.supabase
    .from("chat_proposed_actions")
    .update(patch)
    .eq("id", id)
    .eq("team_id", ctx.teamId)
    .select("*")
    .maybeSingle();
  if (error) return fail(500, error.message);
  const row = mapActionRow(data);
  if (!row) return fail(404, "Confirmation not found");
  return { ok: true, data: row };
}

async function requirePending(
  ctx: PeopleProposeContext,
  row: ActionRow,
): Promise<PeopleProposeOk<ActionRow> | PeopleProposeErr> {
  if (row.status === "pending" && isExpired(row.created_at)) {
    const saved = await saveAction(ctx, row.id, {
      status: "expired",
      error: "This confirmation expired",
    });
    if (!saved.ok) return saved;
    return fail(409, "This confirmation expired");
  }
  if (row.status !== "pending") {
    return fail(409, `Confirmation is ${row.status}`);
  }
  return { ok: true, data: row };
}

async function expireStalePending(
  ctx: PeopleProposeContext,
  sessionId: string,
): Promise<{ ok: true } | PeopleProposeErr> {
  const pending = await loadPendingRows(ctx, sessionId);
  if (!pending.ok) return pending;
  for (const row of pending.data) {
    if (!isExpired(row.created_at)) continue;
    const saved = await saveAction(ctx, row.id, {
      status: "expired",
      error: "This confirmation expired",
    });
    if (!saved.ok) return saved;
  }
  return { ok: true };
}

async function markFailed(
  ctx: PeopleProposeContext,
  id: string,
  status: number,
  error: string,
): Promise<PeopleProposeErr> {
  await saveAction(ctx, id, { status: "failed", error });
  return fail(status, error);
}

async function markConfirmed(
  ctx: PeopleProposeContext,
  id: string,
): Promise<PeopleProposeOk<ActionRow> | PeopleProposeErr> {
  return saveAction(ctx, id, {
    status: "confirmed",
    confirmed_by: ctx.user.id,
    confirmed_at: new Date().toISOString(),
    error: null,
  });
}

async function confirmEmployment(
  ctx: PeopleProposeContext,
  row: ActionRow,
): Promise<PeopleConfirmOk | PeopleProposeErr> {
  const payload = employmentPayload(row.payload);
  if (!payload) return fail(500, "Malformed employment confirmation");

  const employee = await getEmployee(ctx, payload.employee_id);
  if (!employee.ok) {
    return markFailed(ctx, row.id, employee.status, employee.error);
  }
  if (employee.data.archived_at) {
    return markFailed(ctx, row.id, 409, "Employee is archived");
  }

  if (employee.data.employment_status === payload.employment_status) {
    const saved = await markConfirmed(ctx, row.id);
    if (!saved.ok) return saved;
    const dto = toPublic(saved.data);
    if (!dto) return fail(500, "Could not confirm");
    return { ok: true, data: dto, skipped: true };
  }
  if (employee.data.employment_status !== payload.from_status) {
    return fail(409, "Employee status changed; ask Chat to propose again");
  }

  const updated = await updateEmployee(ctx, employee.data.id, {
    employment_status: payload.employment_status,
  });
  if (!updated.ok) {
    return markFailed(ctx, row.id, updated.status, updated.error);
  }

  const saved = await markConfirmed(ctx, row.id);
  if (!saved.ok) return saved;
  const dto = toPublic(saved.data);
  if (!dto) return fail(500, "Could not confirm");
  return { ok: true, data: dto, skipped: false };
}

async function confirmPipeline(
  ctx: PeopleProposeContext,
  row: ActionRow,
): Promise<PeopleConfirmOk | PeopleProposeErr> {
  const payload = pipelinePayload(row.payload);
  if (!payload) return fail(500, "Malformed pipeline confirmation");

  const application = await getCandidateJob(ctx, payload.candidate_job_id);
  if (!application.ok) {
    return markFailed(ctx, row.id, application.status, application.error);
  }

  const candidate = await getCandidate(ctx, payload.candidate_id);
  if (!candidate.ok) {
    return markFailed(ctx, row.id, candidate.status, candidate.error);
  }
  if (candidate.data.archived_at) {
    return markFailed(ctx, row.id, 409, "Candidate is archived");
  }

  const job = await getJob(ctx, payload.job_id);
  if (!job.ok) {
    return markFailed(ctx, row.id, job.status, job.error);
  }
  if (job.data.archived_at) {
    return markFailed(ctx, row.id, 409, "Job is archived");
  }

  if (application.data.stage === payload.stage) {
    const saved = await markConfirmed(ctx, row.id);
    if (!saved.ok) return saved;
    const dto = toPublic(saved.data);
    if (!dto) return fail(500, "Could not confirm");
    return { ok: true, data: dto, skipped: true };
  }
  if (application.data.stage !== payload.from_stage) {
    return fail(409, "Pipeline stage changed; ask Chat to propose again");
  }

  const updated = await updateCandidateJobPipeline(ctx, application.data.id, {
    stage: payload.stage,
  });
  if (!updated.ok) {
    return markFailed(ctx, row.id, updated.status, updated.error);
  }

  const saved = await markConfirmed(ctx, row.id);
  if (!saved.ok) return saved;
  const dto = toPublic(saved.data);
  if (!dto) return fail(500, "Could not confirm");
  return { ok: true, data: dto, skipped: false };
}
