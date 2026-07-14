import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type GmailBackfillJobStatus = "pending" | "running" | "completed" | "failed";

export interface GmailBackfillJob {
  id: string;
  workspaceId: string;
  teamId: string | null;
  status: GmailBackfillJobStatus;
  afterDate: string;
  pageToken: string | null;
  messagesFetched: number;
  messagesForwarded: number;
  lastError: string | null;
}

const TABLE = "gmail_backfill_jobs";
export const DEFAULT_BACKFILL_DAYS = 90;

export function backfillAfterDate(days: number = DEFAULT_BACKFILL_DAYS): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

/** Idempotent enqueue: skip if workspace already has pending/running job. */
export async function enqueueGmailBackfillJob(
  supabase: SupabaseClient,
  input: { workspaceId: string; teamId: string | null; afterDate?: string },
): Promise<{ enqueued: boolean; jobId: string | null; error: string | null }> {
  const { data: existing, error: lookupErr } = await supabase
    .from(TABLE)
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .in("status", ["pending", "running"])
    .maybeSingle();

  if (lookupErr) {
    return { enqueued: false, jobId: null, error: lookupErr.message };
  }
  if (existing?.id) {
    return { enqueued: false, jobId: existing.id as string, error: null };
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      workspace_id: input.workspaceId,
      team_id: input.teamId,
      status: "pending",
      after_date: input.afterDate ?? backfillAfterDate(),
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    return { enqueued: false, jobId: null, error: error?.message ?? "insert_failed" };
  }
  return { enqueued: true, jobId: data.id as string, error: null };
}

export async function claimGmailBackfillJob(
  supabase: SupabaseClient,
  input: { workspaceId?: string; jobId?: string },
): Promise<GmailBackfillJob | null> {
  let query = supabase
    .from(TABLE)
    .select(
      "id, workspace_id, team_id, status, after_date, page_token, messages_fetched, messages_forwarded, last_error",
    )
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: true })
    .limit(1);

  if (input.jobId) query = query.eq("id", input.jobId);
  else if (input.workspaceId) query = query.eq("workspace_id", input.workspaceId);

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  const id = row.id as string;

  const patch: Record<string, unknown> = {
    status: "running",
    last_error: null,
  };
  if (row.status === "pending") patch.started_at = new Date().toISOString();

  const { error: patchErr } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .in("status", ["pending", "running"]);

  if (patchErr) return null;

  return {
    id,
    workspaceId: row.workspace_id as string,
    teamId: (row.team_id as string | null) ?? null,
    status: "running",
    afterDate: row.after_date as string,
    pageToken: (row.page_token as string | null) ?? null,
    messagesFetched: typeof row.messages_fetched === "number" ? row.messages_fetched : 0,
    messagesForwarded: typeof row.messages_forwarded === "number" ? row.messages_forwarded : 0,
    lastError: (row.last_error as string | null) ?? null,
  };
}

export async function updateGmailBackfillJobProgress(
  supabase: SupabaseClient,
  jobId: string,
  patch: {
    pageToken?: string | null;
    messagesFetchedDelta?: number;
    messagesForwardedDelta?: number;
    status?: GmailBackfillJobStatus;
    lastError?: string | null;
  },
): Promise<boolean> {
  const { data: current, error: readErr } = await supabase
    .from(TABLE)
    .select("messages_fetched, messages_forwarded")
    .eq("id", jobId)
    .maybeSingle();

  if (readErr || !current) return false;

  const row = current as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  if (patch.pageToken !== undefined) update.page_token = patch.pageToken;
  if (patch.messagesFetchedDelta) {
    update.messages_fetched =
      (typeof row.messages_fetched === "number" ? row.messages_fetched : 0) +
      patch.messagesFetchedDelta;
  }
  if (patch.messagesForwardedDelta) {
    update.messages_forwarded =
      (typeof row.messages_forwarded === "number" ? row.messages_forwarded : 0) +
      patch.messagesForwardedDelta;
  }
  if (patch.lastError !== undefined) update.last_error = patch.lastError;
  if (patch.status) {
    update.status = patch.status;
    if (patch.status === "completed") update.completed_at = new Date().toISOString();
  }

  const { error } = await supabase.from(TABLE).update(update).eq("id", jobId);
  return !error;
}
