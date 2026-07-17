import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Durable outbound send queue (migration 20260717130000_launch_durability_and_tokens).
 *
 * `outbound_jobs` RLS grants `SELECT` only to `authenticated` (scoped to the caller's
 * `team_id`) and revokes insert/update/delete entirely — every write here MUST run on a
 * service-role client (`createServerClient()`), never the tenant-scoped route-handler client.
 * Best-effort throughout: a ledger write failure must never fail the caller's primary action
 * (approving a draft, sending an autopilot reply), so every function here swallows its own
 * errors and logs instead of throwing.
 */

export type OutboundJobStatus =
  | "queued"
  | "claiming"
  | "sending"
  | "sent"
  | "failed"
  | "cancelled";

export interface OutboundJobRow {
  id: string;
  draft_id: string | null;
  team_id: string;
  workspace_id: string | null;
  conversation_id: string | null;
  channel: string | null;
  status: OutboundJobStatus;
  attempts: number;
  last_error: string | null;
  provider_message_id: string | null;
  claimed_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QueueOutboundJobInput {
  draftId: string;
  teamId: string;
  workspaceId: string | null;
  conversationId: string | null;
  channel: string | null;
}

/**
 * Upsert a `queued` job keyed by `draft_id` (unique index `outbound_jobs_draft_id_uidx`). Safe to
 * call more than once for the same draft — approving a draft and then having the autopilot/
 * send-reply path run again just refreshes the same row. Returns the row on success, null on any
 * failure (never throws).
 */
export async function queueOutboundJob(
  supabase: SupabaseClient,
  input: QueueOutboundJobInput,
): Promise<OutboundJobRow | null> {
  try {
    const { data, error } = await supabase
      .from("outbound_jobs")
      .upsert(
        {
          draft_id: input.draftId,
          team_id: input.teamId,
          workspace_id: input.workspaceId,
          conversation_id: input.conversationId,
          channel: input.channel,
          status: "queued" satisfies OutboundJobStatus,
        },
        { onConflict: "draft_id" },
      )
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("[outbound-jobs] queue error:", error.message);
      return null;
    }
    return (data as OutboundJobRow | null) ?? null;
  } catch (e) {
    console.error("[outbound-jobs] queue threw:", e instanceof Error ? e.message : e);
    return null;
  }
}

export type OutboundJobOutcome =
  | { status: "sent"; providerMessageId?: string | null }
  | { status: "failed"; error: string }
  | { status: "cancelled" };

/**
 * Advance an already-queued job's terminal status, looked up by `draft_id`. A no-op (not an
 * error) when no job row exists yet for that draft — callers must never depend on this ledger
 * write for their primary send/approval flow to succeed.
 */
export async function markOutboundJobResult(
  supabase: SupabaseClient,
  draftId: string,
  outcome: OutboundJobOutcome,
): Promise<void> {
  const patch: Record<string, unknown> = { status: outcome.status };
  if (outcome.status === "sent") {
    patch.sent_at = new Date().toISOString();
    patch.provider_message_id = outcome.providerMessageId ?? null;
    patch.last_error = null;
  }
  if (outcome.status === "failed") {
    patch.last_error = outcome.error;
  }

  try {
    const { data: current } = await supabase
      .from("outbound_jobs")
      .select("attempts")
      .eq("draft_id", draftId)
      .maybeSingle();
    const currentAttempts = (current as { attempts?: unknown } | null)?.attempts;
    const attempts = typeof currentAttempts === "number" ? currentAttempts : 0;
    if (outcome.status !== "cancelled") patch.attempts = attempts + 1;

    const { error } = await supabase.from("outbound_jobs").update(patch).eq("draft_id", draftId);
    if (error) console.error("[outbound-jobs] mark result error:", error.message);
  } catch (e) {
    console.error("[outbound-jobs] mark result threw:", e instanceof Error ? e.message : e);
  }
}
