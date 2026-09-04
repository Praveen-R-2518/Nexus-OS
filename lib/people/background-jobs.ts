import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { handlePeopleMatch } from "@/lib/people/match-worker";
import type { PeopleTenantContext } from "@/lib/people/employees";

export const BACKGROUND_JOB_KINDS = {
  peopleMatch: "people.match",
} as const;

export type BackgroundJobKind =
  (typeof BACKGROUND_JOB_KINDS)[keyof typeof BACKGROUND_JOB_KINDS];

export type BackgroundJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type BackgroundJob = {
  id: string;
  teamId: string;
  workspaceId: string | null;
  kind: string;
  status: BackgroundJobStatus;
  payload: Record<string, unknown>;
  progress: Record<string, unknown>;
  error: string | null;
  idempotencyKey: string | null;
  attempts: number;
  runAfter: string;
  lockedAt: string | null;
  lockedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BackgroundJobErr = { ok: false; status: number; error: string };
export type BackgroundJobOk<T> = { ok: true; data: T };

export const MAX_BACKGROUND_JOB_ATTEMPTS = 8;
export const DEFAULT_CLAIM_LIMIT = 5;
export const MAX_CLAIM_LIMIT = 20;
export const DEFAULT_LOCK_TTL_SECONDS = 120;

const TABLE = "background_jobs";

const REQUEUE_STATUSES: BackgroundJobStatus[] = ["completed", "failed", "cancelled"];

function rowToJob(row: Record<string, unknown>): BackgroundJob {
  return {
    id: row.id as string,
    teamId: row.team_id as string,
    workspaceId: (row.workspace_id as string | null) ?? null,
    kind: row.kind as string,
    status: row.status as BackgroundJobStatus,
    payload:
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {},
    progress:
      row.progress && typeof row.progress === "object" && !Array.isArray(row.progress)
        ? (row.progress as Record<string, unknown>)
        : {},
    error: (row.error as string | null) ?? null,
    idempotencyKey: (row.idempotency_key as string | null) ?? null,
    attempts: typeof row.attempts === "number" ? row.attempts : 0,
    runAfter: row.run_after as string,
    lockedAt: (row.locked_at as string | null) ?? null,
    lockedBy: (row.locked_by as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export function peopleMatchIdempotencyKey(jobId: string): string {
  return `${BACKGROUND_JOB_KINDS.peopleMatch}:${jobId.trim()}`;
}

async function findByIdempotencyKey(
  ctx: PeopleTenantContext,
  idempotencyKey: string,
): Promise<BackgroundJob | null> {
  const { data, error } = await ctx.supabase
    .from(TABLE)
    .select("*")
    .eq("team_id", ctx.teamId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error || !data) return null;
  return rowToJob(data as Record<string, unknown>);
}

export async function enqueue(
  ctx: PeopleTenantContext,
  input: {
    kind: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string | null;
    runAfter?: string | null;
  },
): Promise<
  BackgroundJobOk<{ job: BackgroundJob; created: boolean }> | BackgroundJobErr
> {
  const kind = input.kind.trim();
  if (!kind) return { ok: false, status: 400, error: "kind is required" };

  const idempotencyKey =
    typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : null;

  const row = {
    team_id: ctx.teamId,
    workspace_id: ctx.workspaceId,
    kind,
    status: "queued" as const,
    payload: input.payload,
    progress: {},
    idempotency_key: idempotencyKey || null,
    run_after: input.runAfter ?? new Date().toISOString(),
  };

  const { data, error } = await ctx.supabase.from(TABLE).insert(row).select("*").maybeSingle();

  if (error) {
    if (isUniqueViolation(error) && idempotencyKey) {
      const existing = await findByIdempotencyKey(ctx, idempotencyKey);
      if (existing) return { ok: true, data: { job: existing, created: false } };
    }
    return { ok: false, status: 500, error: error.message || "enqueue_failed" };
  }

  if (!data) {
    return { ok: false, status: 500, error: "enqueue_failed" };
  }

  return {
    ok: true,
    data: { job: rowToJob(data as Record<string, unknown>), created: true },
  };
}

export async function enqueuePeopleMatchJob(
  ctx: PeopleTenantContext,
  jobId: string,
): Promise<
  BackgroundJobOk<{ job: BackgroundJob; created: boolean }> | BackgroundJobErr
> {
  const trimmed = jobId.trim();
  if (!trimmed) return { ok: false, status: 400, error: "job_id is required" };

  const idempotencyKey = peopleMatchIdempotencyKey(trimmed);
  const existing = await findByIdempotencyKey(ctx, idempotencyKey);
  if (existing) {
    if (existing.status === "queued" || existing.status === "running") {
      return { ok: true, data: { job: existing, created: false } };
    }

    const { data, error } = await ctx.supabase
      .from(TABLE)
      .update({
        status: "queued",
        attempts: 0,
        error: null,
        progress: {},
        locked_at: null,
        locked_by: null,
        run_after: new Date().toISOString(),
        payload: { job_id: trimmed },
      })
      .eq("id", existing.id)
      .eq("team_id", ctx.teamId)
      .in("status", REQUEUE_STATUSES)
      .select("*")
      .maybeSingle();

    if (error || !data) {
      return { ok: false, status: 500, error: error?.message || "requeue_failed" };
    }

    return {
      ok: true,
      data: { job: rowToJob(data as Record<string, unknown>), created: false },
    };
  }

  return enqueue(ctx, {
    kind: BACKGROUND_JOB_KINDS.peopleMatch,
    payload: { job_id: trimmed },
    idempotencyKey,
  });
}

export async function claim(
  supabase: SupabaseClient,
  input?: {
    limit?: number;
    lockedBy?: string;
    lockTtlSeconds?: number;
  },
): Promise<BackgroundJob[]> {
  const rawLimit = input?.limit ?? DEFAULT_CLAIM_LIMIT;
  const limit = Math.min(Math.max(rawLimit, 1), MAX_CLAIM_LIMIT);
  const lockedBy = input?.lockedBy?.trim() || "people-worker";
  const lockTtlSeconds = input?.lockTtlSeconds ?? DEFAULT_LOCK_TTL_SECONDS;

  const { data, error } = await supabase.rpc("claim_background_jobs", {
    p_limit: limit,
    p_locked_by: lockedBy,
    p_lock_ttl_seconds: lockTtlSeconds,
  });

  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(rowToJob);
}

export async function complete(
  supabase: SupabaseClient,
  jobId: string,
  progress: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: "completed",
      progress,
      error: null,
      locked_at: null,
      locked_by: null,
    })
    .eq("id", jobId)
    .eq("status", "running")
    .select("id")
    .maybeSingle();

  return !error && !!data;
}

export async function fail(
  supabase: SupabaseClient,
  jobId: string,
  errorMessage: string,
  opts?: { fromStatuses?: BackgroundJobStatus[] },
): Promise<boolean> {
  const fromStatuses = opts?.fromStatuses ?? ["running", "queued"];
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: "failed",
      error: errorMessage.slice(0, 500),
      locked_at: null,
      locked_by: null,
    })
    .eq("id", jobId)
    .in("status", fromStatuses)
    .select("id")
    .maybeSingle();

  return !error && !!data;
}

export async function cancel(
  supabase: SupabaseClient,
  jobId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: "cancelled",
      locked_at: null,
      locked_by: null,
    })
    .eq("id", jobId)
    .in("status", ["queued", "running"])
    .select("id")
    .maybeSingle();

  return !error && !!data;
}

export async function refreshLock(
  supabase: SupabaseClient,
  jobId: string,
  lockedBy?: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      locked_at: new Date().toISOString(),
      locked_by: lockedBy?.trim() || "people-worker",
    })
    .eq("id", jobId)
    .eq("status", "running")
    .select("id")
    .maybeSingle();

  return !error && !!data;
}

export async function setProgress(
  supabase: SupabaseClient,
  jobId: string,
  progress: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ progress })
    .eq("id", jobId)
    .eq("status", "running")
    .select("id")
    .maybeSingle();

  return !error && !!data;
}

/** Yield explain work across invocations without failing the job or burning attempt budget. */
export async function requeueExplainContinuation(
  supabase: SupabaseClient,
  jobId: string,
  teamId: string,
  peopleJobId: string,
  progress: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: "queued",
      attempts: 0,
      error: null,
      progress,
      locked_at: null,
      locked_by: null,
      run_after: new Date().toISOString(),
      payload: { job_id: peopleJobId, phase: "explain" },
    })
    .eq("id", jobId)
    .eq("team_id", teamId)
    .eq("status", "running")
    .select("id")
    .maybeSingle();

  return !error && !!data;
}

export async function dispatchBackgroundJob(
  supabase: SupabaseClient,
  job: BackgroundJob,
): Promise<{ status: BackgroundJobStatus; error?: string }> {
  if (job.attempts > MAX_BACKGROUND_JOB_ATTEMPTS) {
    await fail(supabase, job.id, "max_attempts_exceeded");
    return { status: "failed", error: "max_attempts_exceeded" };
  }

  if (job.kind === BACKGROUND_JOB_KINDS.peopleMatch) {
    return handlePeopleMatch(supabase, job);
  }

  await fail(supabase, job.id, "unknown_kind");
  return { status: "failed", error: "unknown_kind" };
}

export async function runBackgroundJobBatch(
  supabase: SupabaseClient,
  input?: { limit?: number; lockedBy?: string },
): Promise<{
  claimed: number;
  completed: number;
  failed: number;
  jobs: Array<{ id: string; kind: string; status: BackgroundJobStatus; error?: string }>;
}> {
  const claimedJobs = await claim(supabase, input);
  const results: Array<{
    id: string;
    kind: string;
    status: BackgroundJobStatus;
    error?: string;
  }> = [];
  let completed = 0;
  let failed = 0;

  for (const job of claimedJobs) {
    const outcome = await dispatchBackgroundJob(supabase, job);
    results.push({
      id: job.id,
      kind: job.kind,
      status: outcome.status,
      error: outcome.error,
    });
    if (outcome.status === "completed") completed += 1;
    else failed += 1;
  }

  return { claimed: claimedJobs.length, completed, failed, jobs: results };
}
