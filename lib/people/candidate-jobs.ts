import "server-only";

import { writeAuditEvent } from "@/lib/audit";
import type { PeopleTenantContext } from "@/lib/people/employees";
import { getJob } from "@/lib/people/jobs";
import {
  CANDIDATE_JOB_STAGES,
  type CandidateJob,
  type CandidateJobStage,
  type CandidateJobStageCounts,
  type JobCandidateCandidateSummary,
  type JobCandidateListItem,
  type TeamAssignee,
} from "@/types";

const NOTES_PREVIEW_MAX = 200;
const OVERRIDE_MIN = 1;
const OVERRIDE_MAX = 999;
const ASSIGNEE_CAP = 100;
export const BULK_STAGE_MAX_IDS = 50;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const OVERRIDE_FIELDS = ["manual_rank_override"] as const;
const PIPELINE_FIELDS = ["stage", "assigned_to"] as const;

const FORBIDDEN_OVERRIDE_KEYS = [
  "match_score",
  "match_components",
  "match_weights_used",
  "scoring_version",
  "data_quality",
  "insufficient_reason",
  "ai_explanation",
  "ai_model",
  "ai_prompt_version",
  "stage",
  "assigned_to",
  "candidate_id",
  "job_id",
  "team_id",
  "workspace_id",
] as const;

const FORBIDDEN_PIPELINE_KEYS = [
  "match_score",
  "match_components",
  "match_weights_used",
  "scoring_version",
  "data_quality",
  "insufficient_reason",
  "ai_explanation",
  "ai_model",
  "ai_prompt_version",
  "manual_rank_override",
  "candidate_id",
  "job_id",
  "team_id",
  "workspace_id",
] as const;

const CANDIDATE_JOB_LIST_SELECT = `
      id,
      candidate_id,
      job_id,
      stage,
      match_score,
      match_components,
      match_weights_used,
      scoring_version,
      data_quality,
      insufficient_reason,
      ai_explanation,
      ai_model,
      ai_prompt_version,
      manual_rank_override,
      assigned_to,
      created_at,
      updated_at,
      candidates!inner (
        id,
        full_name,
        headline,
        current_role,
        location,
        source,
        source_url,
        consent_status,
        notes,
        archived_at
      )
    `;

export type CandidateJobErr = { ok: false; status: number; error: string };
export type CandidateJobOk<T> = { ok: true; data: T };

export type { JobCandidateListItem, JobCandidateCandidateSummary };

export type ListJobCandidatesQuery = {
  ok: true;
  limit: number;
  offset: number;
  stage: CandidateJobStage | null;
};

export type ListJobCandidatesOk = {
  ok: true;
  data: JobCandidateListItem[];
  count: number;
  stage_counts: CandidateJobStageCounts;
  assignees: TeamAssignee[];
};

export type BulkStageOk = {
  ok: true;
  data: JobCandidateListItem[];
  skipped: number;
};

type CandidateJoinRow = {
  id: string;
  full_name: string;
  headline: string | null;
  current_role: string | null;
  location: string | null;
  source: string | null;
  source_url: string | null;
  consent_status: JobCandidateCandidateSummary["consent_status"];
  notes: string | null;
  archived_at: string | null;
};

type CandidateJobJoinRow = {
  id: string;
  candidate_id: string;
  job_id: string;
  stage: JobCandidateListItem["stage"];
  match_score: number | null;
  match_components: unknown;
  match_weights_used: JobCandidateListItem["match_weights_used"];
  scoring_version: string | null;
  data_quality: JobCandidateListItem["data_quality"];
  insufficient_reason: string | null;
  ai_explanation: JobCandidateListItem["ai_explanation"];
  ai_model: string | null;
  ai_prompt_version: string | null;
  manual_rank_override: number | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  candidates: CandidateJoinRow | CandidateJoinRow[] | null;
};

type PipelinePatch = {
  hasStage: boolean;
  stage: CandidateJobStage | null;
  hasAssigned: boolean;
  assignedTo: string | null;
};

type PipelineApplyOk = {
  ok: true;
  data: JobCandidateListItem;
  skipped: boolean;
};

function fail(status: number, error: string): CandidateJobErr {
  return { ok: false, status, error };
}

function isUniqueCandidateJobConflict(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = error.message ?? "";
  return message.includes("candidate_jobs") || message.includes("candidate_id");
}

export async function ensureCandidateJobLink(
  ctx: PeopleTenantContext,
  candidateId: string,
  jobId: string,
): Promise<{ ok: true; attached: boolean } | CandidateJobErr> {
  const { data: existing, error: lookupError } = await ctx.supabase
    .from("candidate_jobs")
    .select("id")
    .eq("team_id", ctx.teamId)
    .eq("candidate_id", candidateId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (lookupError) return fail(500, lookupError.message);
  if (existing) return { ok: true, attached: false };

  const { error } = await ctx.supabase.from("candidate_jobs").insert({
    team_id: ctx.teamId,
    workspace_id: ctx.workspaceId,
    candidate_id: candidateId,
    job_id: jobId,
    stage: "new",
    data_quality: "pending",
  });

  if (error) {
    if (isUniqueCandidateJobConflict(error)) {
      return { ok: true, attached: false };
    }
    return fail(500, error.message || "Failed to attach candidate to job");
  }

  return { ok: true, attached: true };
}

function unknownKeys(
  body: Record<string, unknown>,
  allowed: readonly string[],
): string[] {
  return Object.keys(body).filter((key) => !allowed.includes(key));
}

function hasOwn(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function isCandidateJobStage(value: unknown): value is CandidateJobStage {
  return (
    typeof value === "string" &&
    (CANDIDATE_JOB_STAGES as readonly string[]).includes(value)
  );
}

function emptyStageCounts(): CandidateJobStageCounts {
  return {
    new: 0,
    shortlisted: 0,
    contacted: 0,
    decision: 0,
  };
}

function notesPreview(notes: string | null): string | null {
  if (!notes) return null;
  const trimmed = notes.trim();
  if (!trimmed) return null;
  if (trimmed.length <= NOTES_PREVIEW_MAX) return trimmed;
  return `${trimmed.slice(0, NOTES_PREVIEW_MAX)}…`;
}

function parseComponents(
  value: unknown,
): JobCandidateListItem["match_components"] {
  if (!Array.isArray(value)) return null;
  return value as JobCandidateListItem["match_components"];
}

function mapRow(row: CandidateJobJoinRow): JobCandidateListItem | null {
  const rawCandidate = row.candidates;
  const candidate = Array.isArray(rawCandidate)
    ? rawCandidate[0]
    : rawCandidate;
  if (!candidate || candidate.archived_at) return null;

  return {
    id: row.id,
    candidate_id: row.candidate_id,
    job_id: row.job_id,
    stage: row.stage,
    match_score:
      typeof row.match_score === "number"
        ? row.match_score
        : row.match_score != null
          ? Number(row.match_score)
          : null,
    match_components: parseComponents(row.match_components),
    match_weights_used: row.match_weights_used,
    scoring_version: row.scoring_version,
    data_quality: row.data_quality,
    insufficient_reason: row.insufficient_reason,
    ai_explanation: row.ai_explanation,
    ai_model: row.ai_model,
    ai_prompt_version: row.ai_prompt_version,
    manual_rank_override: row.manual_rank_override,
    assigned_to: row.assigned_to,
    created_at: row.created_at,
    updated_at: row.updated_at,
    candidate: {
      id: candidate.id,
      full_name: candidate.full_name,
      headline: candidate.headline,
      current_role: candidate.current_role,
      location: candidate.location,
      source: candidate.source,
      source_url: candidate.source_url,
      consent_status: candidate.consent_status,
      notes_preview: notesPreview(candidate.notes),
    },
  };
}

function pipelineState(row: {
  stage: CandidateJobStage;
  assigned_to: string | null;
}): { stage: CandidateJobStage; assigned_to: string | null } {
  return { stage: row.stage, assigned_to: row.assigned_to };
}

export function parseListJobCandidatesQuery(
  searchParams: URLSearchParams,
): ListJobCandidatesQuery | CandidateJobErr {
  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");
  const stageParam = searchParams.get("stage");
  const limit =
    limitParam === null || limitParam === ""
      ? 50
      : Number.parseInt(limitParam, 10);
  const offset =
    offsetParam === null || offsetParam === ""
      ? 0
      : Number.parseInt(offsetParam, 10);

  if (!Number.isFinite(limit) || limit < 1) {
    return fail(400, "limit must be a positive integer");
  }
  if (limit > 100) return fail(400, "limit must not exceed 100");
  if (!Number.isFinite(offset) || offset < 0) {
    return fail(400, "offset must be a non-negative integer");
  }

  let stage: CandidateJobStage | null = null;
  if (stageParam != null && stageParam !== "") {
    if (!isCandidateJobStage(stageParam)) {
      return fail(
        400,
        `stage must be one of: ${CANDIDATE_JOB_STAGES.join(", ")}`,
      );
    }
    stage = stageParam;
  }

  return { ok: true, limit, offset, stage };
}

async function loadCandidateJobListItem(
  ctx: PeopleTenantContext,
  id: string,
): Promise<CandidateJobOk<JobCandidateListItem> | CandidateJobErr> {
  const { data, error } = await ctx.supabase
    .from("candidate_jobs")
    .select(CANDIDATE_JOB_LIST_SELECT)
    .eq("id", id)
    .eq("team_id", ctx.teamId)
    .maybeSingle();

  if (error) return fail(500, error.message);
  if (!data) return fail(404, "Application not found");
  const mapped = mapRow(data as CandidateJobJoinRow);
  if (!mapped) return fail(404, "Application not found");
  return { ok: true, data: mapped };
}

async function countJobStages(
  ctx: PeopleTenantContext,
  jobId: string,
): Promise<CandidateJobOk<CandidateJobStageCounts> | CandidateJobErr> {
  const { data, error } = await ctx.supabase
    .from("candidate_jobs")
    .select(
      `
      stage,
      candidates!inner (
        archived_at
      )
    `,
    )
    .eq("job_id", jobId)
    .eq("team_id", ctx.teamId)
    .is("candidates.archived_at", null);

  if (error) return fail(500, error.message);

  const counts = emptyStageCounts();
  for (const row of data ?? []) {
    const stage = (row as { stage?: unknown }).stage;
    if (!isCandidateJobStage(stage)) continue;
    counts[stage] += 1;
  }
  return { ok: true, data: counts };
}

export async function listTeamAssignees(
  ctx: PeopleTenantContext,
): Promise<CandidateJobOk<TeamAssignee[]> | CandidateJobErr> {
  const { data, error } = await ctx.supabase
    .from("profiles")
    .select("id, full_name")
    .eq("team_id", ctx.teamId)
    .order("full_name", { ascending: true })
    .limit(ASSIGNEE_CAP);

  if (error) return fail(500, error.message);

  const assignees: TeamAssignee[] = [];
  for (const row of data ?? []) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    assignees.push({
      id,
      full_name:
        typeof row.full_name === "string" && row.full_name.trim()
          ? row.full_name.trim()
          : null,
    });
  }
  return { ok: true, data: assignees };
}

async function assertTeamAssignee(
  ctx: PeopleTenantContext,
  userId: string,
): Promise<CandidateJobErr | { ok: true }> {
  const { data, error } = await ctx.supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .eq("team_id", ctx.teamId)
    .maybeSingle();

  if (error) return fail(500, error.message);
  if (!data) return fail(400, "assigned_to must be a member of this team");
  return { ok: true };
}

export async function listJobCandidates(
  ctx: PeopleTenantContext,
  jobId: string,
  query: ListJobCandidatesQuery,
): Promise<ListJobCandidatesOk | CandidateJobErr> {
  const job = await getJob(ctx, jobId);
  if (!job.ok) return job;

  let db = ctx.supabase
    .from("candidate_jobs")
    .select(CANDIDATE_JOB_LIST_SELECT, { count: "exact" })
    .eq("job_id", job.data.id)
    .eq("team_id", ctx.teamId)
    .is("candidates.archived_at", null)
    .order("manual_rank_override", { ascending: true, nullsFirst: false })
    .order("match_score", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true });

  if (query.stage) db = db.eq("stage", query.stage);

  const rangeEnd = query.offset + query.limit - 1;
  const { data, error, count } = await db.range(query.offset, rangeEnd);

  if (error) return fail(500, error.message);

  const rows = ((data ?? []) as CandidateJobJoinRow[])
    .map(mapRow)
    .filter((row): row is JobCandidateListItem => row !== null);

  const counts = await countJobStages(ctx, job.data.id);
  if (!counts.ok) return counts;

  const assignees = await listTeamAssignees(ctx);
  if (!assignees.ok) return assignees;

  return {
    ok: true,
    data: rows,
    count: count ?? rows.length,
    stage_counts: counts.data,
    assignees: assignees.data,
  };
}

function parseOverrideBody(
  body: Record<string, unknown>,
): { ok: true; value: number | null } | CandidateJobErr {
  const extra = unknownKeys(body, OVERRIDE_FIELDS);
  if (extra.length > 0) {
    return fail(400, `Unexpected fields: ${extra.join(", ")}`);
  }
  for (const forbidden of FORBIDDEN_OVERRIDE_KEYS) {
    if (hasOwn(body, forbidden)) {
      return fail(400, `Field ${forbidden} cannot be updated via this endpoint`);
    }
  }
  if (!hasOwn(body, "manual_rank_override")) {
    return fail(400, "manual_rank_override is required");
  }

  const raw = body.manual_rank_override;
  if (raw === null) return { ok: true, value: null };
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(n)) {
    return fail(400, "manual_rank_override must be an integer or null");
  }
  if (n < OVERRIDE_MIN || n > OVERRIDE_MAX) {
    return fail(
      400,
      `manual_rank_override must be between ${OVERRIDE_MIN} and ${OVERRIDE_MAX}, or null`,
    );
  }
  return { ok: true, value: n };
}

function parseAssignedTo(
  raw: unknown,
): { ok: true; value: string | null } | CandidateJobErr {
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") {
    return fail(400, "assigned_to must be a uuid or null");
  }
  const trimmed = raw.trim();
  if (!trimmed) return fail(400, "assigned_to must be a uuid or null");
  if (!UUID_RE.test(trimmed)) {
    return fail(400, "assigned_to must be a uuid or null");
  }
  return { ok: true, value: trimmed };
}

function parsePipelineBody(
  body: Record<string, unknown>,
): { ok: true; patch: PipelinePatch } | CandidateJobErr {
  const extra = unknownKeys(body, PIPELINE_FIELDS);
  if (extra.length > 0) {
    return fail(400, `Unexpected fields: ${extra.join(", ")}`);
  }
  for (const forbidden of FORBIDDEN_PIPELINE_KEYS) {
    if (hasOwn(body, forbidden)) {
      return fail(400, `Field ${forbidden} cannot be updated via this endpoint`);
    }
  }

  const hasStage = hasOwn(body, "stage");
  const hasAssigned = hasOwn(body, "assigned_to");
  if (!hasStage && !hasAssigned) {
    return fail(400, "stage or assigned_to is required");
  }

  let stage: CandidateJobStage | null = null;
  if (hasStage) {
    if (!isCandidateJobStage(body.stage)) {
      return fail(
        400,
        `stage must be one of: ${CANDIDATE_JOB_STAGES.join(", ")}`,
      );
    }
    stage = body.stage;
  }

  let assignedTo: string | null = null;
  if (hasAssigned) {
    const parsed = parseAssignedTo(body.assigned_to);
    if (!parsed.ok) return parsed;
    assignedTo = parsed.value;
  }

  return { ok: true, patch: { hasStage, stage, hasAssigned, assignedTo } };
}

export async function getCandidateJob(
  ctx: PeopleTenantContext,
  id: string,
): Promise<CandidateJobOk<CandidateJob> | CandidateJobErr> {
  const trimmed = id.trim();
  if (!trimmed) return fail(400, "Missing candidate job id");

  const { data, error } = await ctx.supabase
    .from("candidate_jobs")
    .select("*")
    .eq("id", trimmed)
    .eq("team_id", ctx.teamId)
    .maybeSingle();

  if (error) return fail(500, error.message);
  if (!data) return fail(404, "Application not found");
  return { ok: true, data: data as CandidateJob };
}

async function writePipelineAudit(
  ctx: PeopleTenantContext,
  entityId: string,
  prev: { stage: CandidateJobStage; assigned_to: string | null },
  next: { stage: CandidateJobStage; assigned_to: string | null },
  stageChanged: boolean,
): Promise<CandidateJobErr | { ok: true }> {
  const audit = await writeAuditEvent(ctx, {
    domain: "people",
    action: stageChanged ? "stage_change" : "assign",
    entityType: "candidate_job",
    entityId,
    prevState: prev,
    nextState: next,
  });
  if (!audit.ok) return fail(500, audit.error);
  return { ok: true };
}

async function applyPipelineUpdate(
  ctx: PeopleTenantContext,
  existing: CandidateJob,
  patch: PipelinePatch,
): Promise<PipelineApplyOk | CandidateJobErr> {
  if (patch.hasAssigned && patch.assignedTo) {
    const member = await assertTeamAssignee(ctx, patch.assignedTo);
    if (!member.ok) return member;
  }

  const nextStage = patch.hasStage && patch.stage ? patch.stage : existing.stage;
  const nextAssigned = patch.hasAssigned ? patch.assignedTo : existing.assigned_to;
  const stageChanged = nextStage !== existing.stage;
  const assignedChanged = nextAssigned !== existing.assigned_to;

  if (!stageChanged && !assignedChanged) {
    const current = await loadCandidateJobListItem(ctx, existing.id);
    if (!current.ok) return current;
    return { ok: true, data: current.data, skipped: true };
  }

  const update: { stage?: CandidateJobStage; assigned_to?: string | null } = {};
  if (patch.hasStage && patch.stage) update.stage = patch.stage;
  if (patch.hasAssigned) update.assigned_to = patch.assignedTo;

  const { data, error } = await ctx.supabase
    .from("candidate_jobs")
    .update(update)
    .eq("id", existing.id)
    .eq("team_id", ctx.teamId)
    .select(CANDIDATE_JOB_LIST_SELECT)
    .maybeSingle();

  if (error) return fail(500, error.message);
  if (!data) return fail(404, "Application not found");

  const mapped = mapRow(data as CandidateJobJoinRow);
  if (!mapped) return fail(404, "Application not found");

  const audit = await writePipelineAudit(
    ctx,
    existing.id,
    pipelineState(existing),
    { stage: nextStage, assigned_to: nextAssigned },
    stageChanged,
  );
  if (!audit.ok) return audit;

  return { ok: true, data: mapped, skipped: false };
}

export async function updateCandidateJobOverride(
  ctx: PeopleTenantContext,
  id: string,
  body: Record<string, unknown>,
): Promise<CandidateJobOk<JobCandidateListItem> | CandidateJobErr> {
  const existing = await getCandidateJob(ctx, id);
  if (!existing.ok) return existing;

  const parsed = parseOverrideBody(body);
  if (!parsed.ok) return parsed;

  const { data, error } = await ctx.supabase
    .from("candidate_jobs")
    .update({ manual_rank_override: parsed.value })
    .eq("id", existing.data.id)
    .eq("team_id", ctx.teamId)
    .select(CANDIDATE_JOB_LIST_SELECT)
    .maybeSingle();

  if (error) return fail(500, error.message);
  if (!data) return fail(404, "Application not found");

  const mapped = mapRow(data as CandidateJobJoinRow);
  if (!mapped) return fail(404, "Application not found");

  const audit = await writeAuditEvent(ctx, {
    domain: "people",
    action: "rank_override",
    entityType: "candidate_job",
    entityId: existing.data.id,
    prevState: {
      manual_rank_override: existing.data.manual_rank_override,
    },
    nextState: {
      manual_rank_override: parsed.value,
    },
  });
  if (!audit.ok) return fail(500, audit.error);

  return { ok: true, data: mapped };
}

export async function updateCandidateJobPipeline(
  ctx: PeopleTenantContext,
  id: string,
  body: Record<string, unknown>,
): Promise<CandidateJobOk<JobCandidateListItem> | CandidateJobErr> {
  const existing = await getCandidateJob(ctx, id);
  if (!existing.ok) return existing;

  const parsed = parsePipelineBody(body);
  if (!parsed.ok) return parsed;

  const applied = await applyPipelineUpdate(ctx, existing.data, parsed.patch);
  if (!applied.ok) return applied;
  return { ok: true, data: applied.data };
}

export async function patchCandidateJob(
  ctx: PeopleTenantContext,
  id: string,
  body: Record<string, unknown>,
): Promise<CandidateJobOk<JobCandidateListItem> | CandidateJobErr> {
  const hasOverride = hasOwn(body, "manual_rank_override");
  const hasStage = hasOwn(body, "stage");
  const hasAssigned = hasOwn(body, "assigned_to");

  if (hasOverride && (hasStage || hasAssigned)) {
    return fail(400, "Cannot mix manual_rank_override with stage or assigned_to");
  }
  if (hasOverride) return updateCandidateJobOverride(ctx, id, body);
  if (hasStage || hasAssigned) return updateCandidateJobPipeline(ctx, id, body);
  return fail(400, "Provide stage, assigned_to, or manual_rank_override");
}

function parseBulkStageBody(
  body: Record<string, unknown>,
):
  | { ok: true; ids: string[]; patch: PipelinePatch }
  | CandidateJobErr {
  const extra = unknownKeys(body, ["ids", "stage", "assigned_to"]);
  if (extra.length > 0) {
    return fail(400, `Unexpected fields: ${extra.join(", ")}`);
  }
  if (!hasOwn(body, "ids") || !hasOwn(body, "stage")) {
    return fail(400, "ids and stage are required");
  }
  if (!Array.isArray(body.ids)) return fail(400, "ids must be an array");
  if (body.ids.length < 1) return fail(400, "ids must not be empty");
  if (body.ids.length > BULK_STAGE_MAX_IDS) {
    return fail(400, `ids must not exceed ${BULK_STAGE_MAX_IDS}`);
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const raw of body.ids) {
    if (typeof raw !== "string" || !raw.trim()) {
      return fail(400, "each id must be a non-empty string");
    }
    const id = raw.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  if (!isCandidateJobStage(body.stage)) {
    return fail(
      400,
      `stage must be one of: ${CANDIDATE_JOB_STAGES.join(", ")}`,
    );
  }

  const hasAssigned = hasOwn(body, "assigned_to");
  let assignedTo: string | null = null;
  if (hasAssigned) {
    const parsed = parseAssignedTo(body.assigned_to);
    if (!parsed.ok) return parsed;
    assignedTo = parsed.value;
  }

  return {
    ok: true,
    ids,
    patch: {
      hasStage: true,
      stage: body.stage,
      hasAssigned,
      assignedTo,
    },
  };
}

export async function bulkUpdateCandidateJobStage(
  ctx: PeopleTenantContext,
  jobId: string,
  body: Record<string, unknown>,
): Promise<BulkStageOk | CandidateJobErr> {
  const job = await getJob(ctx, jobId);
  if (!job.ok) return job;

  const parsed = parseBulkStageBody(body);
  if (!parsed.ok) return parsed;

  if (parsed.patch.hasAssigned && parsed.patch.assignedTo) {
    const member = await assertTeamAssignee(ctx, parsed.patch.assignedTo);
    if (!member.ok) return member;
  }

  const { data, error } = await ctx.supabase
    .from("candidate_jobs")
    .select("*")
    .in("id", parsed.ids)
    .eq("job_id", job.data.id)
    .eq("team_id", ctx.teamId);

  if (error) return fail(500, error.message);

  const found = (data ?? []) as CandidateJob[];
  if (found.length !== parsed.ids.length) {
    return fail(400, "One or more applications were not found on this job");
  }

  const byId = new Map(found.map((row) => [row.id, row]));
  const updated: JobCandidateListItem[] = [];
  let skipped = 0;

  for (const id of parsed.ids) {
    const existing = byId.get(id);
    if (!existing) {
      return fail(400, "One or more applications were not found on this job");
    }
    const applied = await applyPipelineUpdate(ctx, existing, parsed.patch);
    if (!applied.ok) return applied;
    if (applied.skipped) {
      skipped += 1;
      continue;
    }
    updated.push(applied.data);
  }

  return { ok: true, data: updated, skipped };
}
