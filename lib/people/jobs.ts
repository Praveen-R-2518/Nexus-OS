import "server-only";

/**
 * People job openings (`public.jobs`). D1 background queue lives in
 * `lib/people/background-jobs.ts`, not this module.
 */

import { writeAuditEvent } from "@/lib/audit";
import { enqueuePeopleMatchJob } from "@/lib/people/background-jobs";
import { scheduleJobSummaryEmbed } from "@/lib/people/embed";
import type { PeopleTenantContext } from "@/lib/people/employees";
import {
  DEFAULT_SCORING_WEIGHTS,
  parseStoredWeights,
  validateScoringWeights,
  weightsChanged,
} from "@/lib/people/scoring-weights";
import {
  JOB_STATUSES,
  REMOTE_POLICIES,
  type Job,
  type JobStatus,
  type RemotePolicy,
  type ScoringWeights,
} from "@/types";

export { JOB_STATUSES, REMOTE_POLICIES };

const CREATE_FIELDS = [
  "title",
  "description",
  "status",
  "required_skills",
  "preferred_skills",
  "experience_min_years",
  "experience_max_years",
  "seniority",
  "location",
  "remote_policy",
  "scoring_weights",
] as const;

const PATCH_FIELDS = [...CREATE_FIELDS, "archived"] as const;

const LIMITS = {
  title: 250,
  description: 10_000,
  seniority: 80,
  location: 250,
  search: 200,
  skill: 80,
  skills: 50,
  years: 50,
} as const;

const AUDIT_DIFF_KEYS = [
  "title",
  "status",
  "seniority",
  "location",
  "remote_policy",
  "experience_min_years",
  "experience_max_years",
  "scoring_weights_version",
  "archived_at",
] as const;

export type JobErr = { ok: false; status: number; error: string };
export type JobOk<T> = { ok: true; data: T };
export type JobListOk = { ok: true; data: Job[]; count: number };

export type ListJobsQuery = {
  ok: true;
  q: string | null;
  includeArchived: boolean;
  status: JobStatus | null;
  limit: number;
  offset: number;
};

type ParsedCreate = {
  title: string;
  description: string | null;
  status: JobStatus;
  required_skills: string[];
  preferred_skills: string[];
  experience_min_years: number | null;
  experience_max_years: number | null;
  seniority: string | null;
  location: string | null;
  remote_policy: RemotePolicy | null;
  scoring_weights: ScoringWeights;
};

type ParsedPatch = {
  fields: Partial<ParsedCreate>;
  archived?: boolean;
};

function fail(status: number, error: string): JobErr {
  return { ok: false, status, error };
}

function isErr(value: { ok?: boolean }): value is JobErr {
  return value.ok === false;
}

function unknownKeys(
  body: Record<string, unknown>,
  allowed: readonly string[],
): string[] {
  return Object.keys(body).filter((key) => !allowed.includes(key));
}

function extraFieldsError(keys: string[]): JobErr {
  return fail(400, `Unexpected fields: ${keys.join(", ")}`);
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function hasOwn(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === "string" && JOB_STATUSES.includes(value as JobStatus);
}

function isRemotePolicy(value: unknown): value is RemotePolicy {
  return (
    typeof value === "string" && REMOTE_POLICIES.includes(value as RemotePolicy)
  );
}

function parseOptionalText(
  body: Record<string, unknown>,
  key: "description" | "seniority" | "location",
): { ok: true; value: string | null | undefined } | JobErr {
  if (!hasOwn(body, key)) return { ok: true, value: undefined };
  const raw = body[key];
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return fail(400, `${key} must be a string or null`);
  return { ok: true, value: boundedString(raw, LIMITS[key]) };
}

function parseJobStatus(
  body: Record<string, unknown>,
  required: boolean,
): { ok: true; value: JobStatus | undefined } | JobErr {
  if (!hasOwn(body, "status")) {
    if (required) return { ok: true, value: "draft" };
    return { ok: true, value: undefined };
  }
  if (!isJobStatus(body.status)) {
    return fail(400, `status must be one of: ${JOB_STATUSES.join(", ")}`);
  }
  return { ok: true, value: body.status };
}

function parseRemotePolicy(
  body: Record<string, unknown>,
): { ok: true; value: RemotePolicy | null | undefined } | JobErr {
  if (!hasOwn(body, "remote_policy")) return { ok: true, value: undefined };
  const raw = body.remote_policy;
  if (raw === null || raw === "") return { ok: true, value: null };
  if (!isRemotePolicy(raw)) {
    return fail(
      400,
      `remote_policy must be one of: ${REMOTE_POLICIES.join(", ")}`,
    );
  }
  return { ok: true, value: raw };
}

function parseYears(
  body: Record<string, unknown>,
  key: "experience_min_years" | "experience_max_years",
): { ok: true; value: number | null | undefined } | JobErr {
  if (!hasOwn(body, key)) return { ok: true, value: undefined };
  const raw = body[key];
  if (raw === null || raw === "") return { ok: true, value: null };
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fail(400, `${key} must be a number or null`);
  if (n < 0) return fail(400, `${key} must be greater than or equal to 0`);
  if (n > LIMITS.years) return fail(400, `${key} must not exceed ${LIMITS.years}`);
  return { ok: true, value: n };
}

function experienceRangeError(
  min: number | null | undefined,
  max: number | null | undefined,
): JobErr | null {
  if (typeof min === "number" && typeof max === "number" && min > max) {
    return fail(
      400,
      "experience_min_years must be less than or equal to experience_max_years",
    );
  }
  return null;
}

function parseSkillList(
  body: Record<string, unknown>,
  key: "required_skills" | "preferred_skills",
): { ok: true; value: string[] | undefined } | JobErr {
  if (!hasOwn(body, key)) return { ok: true, value: undefined };
  const raw = body[key];
  if (raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return fail(400, `${key} must be an array of strings`);
  if (raw.length > LIMITS.skills) {
    return fail(400, `${key} must not exceed ${LIMITS.skills} items`);
  }
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      return fail(400, `${key} must be an array of strings`);
    }
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > LIMITS.skill) {
      return fail(400, `${key} entries must be at most ${LIMITS.skill} characters`);
    }
    out.push(trimmed);
  }
  return { ok: true, value: out };
}

function parseWeights(
  body: Record<string, unknown>,
  requiredDefault: boolean,
): { ok: true; value: ScoringWeights | undefined } | JobErr {
  if (!hasOwn(body, "scoring_weights")) {
    if (requiredDefault) return { ok: true, value: DEFAULT_SCORING_WEIGHTS };
    return { ok: true, value: undefined };
  }
  const parsed = validateScoringWeights(body.scoring_weights);
  if (!parsed.ok) return fail(400, parsed.error);
  return { ok: true, value: parsed.weights };
}

function parseCreateBody(
  body: Record<string, unknown>,
): { ok: true; data: ParsedCreate } | JobErr {
  const extra = unknownKeys(body, CREATE_FIELDS);
  if (extra.length > 0) return extraFieldsError(extra);

  const title = boundedString(body.title, LIMITS.title);
  if (!title) return fail(400, "title is required");

  const description = parseOptionalText(body, "description");
  if (isErr(description)) return description;
  const seniority = parseOptionalText(body, "seniority");
  if (isErr(seniority)) return seniority;
  const location = parseOptionalText(body, "location");
  if (isErr(location)) return location;
  const status = parseJobStatus(body, true);
  if (isErr(status)) return status;
  const remotePolicy = parseRemotePolicy(body);
  if (isErr(remotePolicy)) return remotePolicy;
  const minYears = parseYears(body, "experience_min_years");
  if (isErr(minYears)) return minYears;
  const maxYears = parseYears(body, "experience_max_years");
  if (isErr(maxYears)) return maxYears;
  const rangeErr = experienceRangeError(minYears.value ?? null, maxYears.value ?? null);
  if (rangeErr) return rangeErr;
  const requiredSkills = parseSkillList(body, "required_skills");
  if (isErr(requiredSkills)) return requiredSkills;
  const preferredSkills = parseSkillList(body, "preferred_skills");
  if (isErr(preferredSkills)) return preferredSkills;
  const weights = parseWeights(body, true);
  if (isErr(weights)) return weights;

  return {
    ok: true,
    data: {
      title,
      description: description.value ?? null,
      status: status.value ?? "draft",
      required_skills: requiredSkills.value ?? [],
      preferred_skills: preferredSkills.value ?? [],
      experience_min_years: minYears.value ?? null,
      experience_max_years: maxYears.value ?? null,
      seniority: seniority.value ?? null,
      location: location.value ?? null,
      remote_policy: remotePolicy.value ?? null,
      scoring_weights: weights.value ?? DEFAULT_SCORING_WEIGHTS,
    },
  };
}

function parsePatchBody(
  body: Record<string, unknown>,
): { ok: true; data: ParsedPatch } | JobErr {
  const extra = unknownKeys(body, PATCH_FIELDS);
  if (extra.length > 0) return extraFieldsError(extra);

  const fields: ParsedPatch["fields"] = {};

  if (hasOwn(body, "title")) {
    const title = boundedString(body.title, LIMITS.title);
    if (!title) return fail(400, "title is required");
    fields.title = title;
  }

  const description = parseOptionalText(body, "description");
  if (isErr(description)) return description;
  if (description.value !== undefined) fields.description = description.value;

  const seniority = parseOptionalText(body, "seniority");
  if (isErr(seniority)) return seniority;
  if (seniority.value !== undefined) fields.seniority = seniority.value;

  const location = parseOptionalText(body, "location");
  if (isErr(location)) return location;
  if (location.value !== undefined) fields.location = location.value;

  const status = parseJobStatus(body, false);
  if (isErr(status)) return status;
  if (status.value !== undefined) fields.status = status.value;

  const remotePolicy = parseRemotePolicy(body);
  if (isErr(remotePolicy)) return remotePolicy;
  if (remotePolicy.value !== undefined) fields.remote_policy = remotePolicy.value;

  const minYears = parseYears(body, "experience_min_years");
  if (isErr(minYears)) return minYears;
  if (minYears.value !== undefined) fields.experience_min_years = minYears.value;

  const maxYears = parseYears(body, "experience_max_years");
  if (isErr(maxYears)) return maxYears;
  if (maxYears.value !== undefined) fields.experience_max_years = maxYears.value;

  const requiredSkills = parseSkillList(body, "required_skills");
  if (isErr(requiredSkills)) return requiredSkills;
  if (requiredSkills.value !== undefined) fields.required_skills = requiredSkills.value;

  const preferredSkills = parseSkillList(body, "preferred_skills");
  if (isErr(preferredSkills)) return preferredSkills;
  if (preferredSkills.value !== undefined) fields.preferred_skills = preferredSkills.value;

  const weights = parseWeights(body, false);
  if (isErr(weights)) return weights;
  if (weights.value !== undefined) fields.scoring_weights = weights.value;

  let archived: boolean | undefined;
  if (hasOwn(body, "archived")) {
    if (typeof body.archived !== "boolean") {
      return fail(400, "archived must be a boolean");
    }
    archived = body.archived;
  }

  if (Object.keys(fields).length === 0 && archived === undefined) {
    return fail(400, "No fields to update");
  }

  return { ok: true, data: { fields, archived } };
}

function auditSnapshot(row: Job): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of AUDIT_DIFF_KEYS) {
    out[key] = row[key];
  }
  return out;
}

function auditDiff(
  prev: Job,
  next: Job,
): { prevState: Record<string, unknown>; nextState: Record<string, unknown> } {
  const prevState: Record<string, unknown> = {};
  const nextState: Record<string, unknown> = {};
  for (const key of AUDIT_DIFF_KEYS) {
    if (prev[key] === next[key]) continue;
    prevState[key] = prev[key];
    nextState[key] = next[key];
  }
  return { prevState, nextState };
}

function escapeIlikeTerm(raw: string): string {
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/"/g, "");
}

export function parseJobListQuery(
  searchParams: URLSearchParams,
): ListJobsQuery | JobErr {
  const qRaw = searchParams.get("q");
  const q = qRaw && qRaw.trim() ? qRaw.trim().slice(0, LIMITS.search) : null;

  const includeArchived =
    searchParams.get("include_archived") === "true" ||
    searchParams.get("include_archived") === "1";

  const statusParam = searchParams.get("status");
  if (statusParam !== null && statusParam !== "") {
    if (!isJobStatus(statusParam)) {
      return fail(400, `status must be one of: ${JOB_STATUSES.join(", ")}`);
    }
  }

  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");
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

  return {
    ok: true,
    q,
    includeArchived,
    status: statusParam && statusParam.length > 0 ? (statusParam as JobStatus) : null,
    limit,
    offset,
  };
}

export async function listJobs(
  ctx: PeopleTenantContext,
  query: ListJobsQuery,
): Promise<JobListOk | JobErr> {
  let db = ctx.supabase
    .from("jobs")
    .select("*", { count: "exact" })
    .eq("team_id", ctx.teamId)
    .order("created_at", { ascending: false });

  if (!query.includeArchived) {
    db = db.is("archived_at", null);
  }
  if (query.status) {
    db = db.eq("status", query.status);
  }
  if (query.q) {
    const term = escapeIlikeTerm(query.q);
    if (term) {
      db = db.or(`title.ilike."%${term}%"`);
    }
  }

  const rangeEnd = query.offset + query.limit - 1;
  const { data, error, count } = await db.range(query.offset, rangeEnd);

  if (error) return fail(500, error.message);
  const rows = (data ?? []) as Job[];
  return { ok: true, data: rows, count: count ?? rows.length };
}

export async function getJob(
  ctx: PeopleTenantContext,
  id: string,
): Promise<JobOk<Job> | JobErr> {
  const trimmed = id.trim();
  if (!trimmed) return fail(400, "Missing job id");

  const { data, error } = await ctx.supabase
    .from("jobs")
    .select("*")
    .eq("id", trimmed)
    .eq("team_id", ctx.teamId)
    .maybeSingle();

  if (error) return fail(500, error.message);
  if (!data) return fail(404, "Job not found");
  return { ok: true, data: data as Job };
}

export async function createJob(
  ctx: PeopleTenantContext,
  body: Record<string, unknown>,
): Promise<JobOk<Job> | JobErr> {
  const parsed = parseCreateBody(body);
  if (isErr(parsed)) return parsed;

  const insert = {
    team_id: ctx.teamId,
    workspace_id: ctx.workspaceId,
    scoring_weights_version: 1,
    ...parsed.data,
  };

  const { data, error } = await ctx.supabase
    .from("jobs")
    .insert(insert)
    .select("*")
    .single();

  if (error) return fail(500, error.message || "Failed to create job");
  if (!data) return fail(500, "Failed to create job");

  const created = data as Job;
  const audit = await writeAuditEvent(ctx, {
    domain: "people",
    action: "create",
    entityType: "job",
    entityId: created.id,
    prevState: null,
    nextState: auditSnapshot(created),
  });
  if (!audit.ok) return fail(500, audit.error);

  scheduleJobSummaryEmbed(ctx, created);
  return { ok: true, data: created };
}

export async function updateJob(
  ctx: PeopleTenantContext,
  id: string,
  body: Record<string, unknown>,
): Promise<JobOk<Job> | JobErr> {
  const existing = await getJob(ctx, id);
  if (!existing.ok) return existing;

  const parsed = parsePatchBody(body);
  if (isErr(parsed)) return parsed;

  const nextMin =
    parsed.data.fields.experience_min_years !== undefined
      ? parsed.data.fields.experience_min_years
      : existing.data.experience_min_years;
  const nextMax =
    parsed.data.fields.experience_max_years !== undefined
      ? parsed.data.fields.experience_max_years
      : existing.data.experience_max_years;
  const rangeErr = experienceRangeError(nextMin, nextMax);
  if (rangeErr) return rangeErr;

  const patch: Record<string, unknown> = { ...parsed.data.fields };
  let weightsVersionBumped = false;
  if (parsed.data.fields.scoring_weights) {
    const previous = parseStoredWeights(existing.data.scoring_weights);
    const changed =
      previous === null ||
      weightsChanged(previous, parsed.data.fields.scoring_weights);
    if (changed) {
      const currentVersion =
        typeof existing.data.scoring_weights_version === "number"
          ? existing.data.scoring_weights_version
          : 1;
      patch.scoring_weights_version = currentVersion + 1;
      weightsVersionBumped = true;
    }
  }

  if (parsed.data.archived === true) {
    patch.archived_at = existing.data.archived_at ?? new Date().toISOString();
  } else if (parsed.data.archived === false) {
    patch.archived_at = null;
  }

  const { data, error } = await ctx.supabase
    .from("jobs")
    .update(patch)
    .eq("id", existing.data.id)
    .eq("team_id", ctx.teamId)
    .select("*")
    .single();

  if (error) {
    if (error.code === "PGRST116") return fail(404, "Job not found");
    return fail(500, error.message || "Failed to update job");
  }
  if (!data) return fail(404, "Job not found");

  const updated = data as Job;
  const { prevState, nextState } = auditDiff(existing.data, updated);
  const changed = Object.keys(nextState).length > 0;
  if (changed) {
    const archivedChanged = Object.prototype.hasOwnProperty.call(
      nextState,
      "archived_at",
    );
    const action = archivedChanged
      ? updated.archived_at
        ? "archive"
        : "unarchive"
      : "update";
    const audit = await writeAuditEvent(ctx, {
      domain: "people",
      action,
      entityType: "job",
      entityId: updated.id,
      prevState,
      nextState,
    });
    if (!audit.ok) return fail(500, audit.error);
  }

  if (changed) scheduleJobSummaryEmbed(ctx, updated);

  if (weightsVersionBumped) {
    const matchJob = await enqueuePeopleMatchJob(ctx, updated.id);
    if (!matchJob.ok) return fail(500, matchJob.error);
  }

  return { ok: true, data: updated };
}
