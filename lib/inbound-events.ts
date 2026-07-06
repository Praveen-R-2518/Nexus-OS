import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Durable inbound idempotency helper (channel-agnostic).
 *
 * Backed by the `inbound_events` table (migration 20260620120000). The webhook persists a raw
 * event here BEFORE acking the platform, and the UNIQUE (platform, external_message_id) index makes
 * re-delivery a no-op. Gmail intake can call the same helper later — pass `platform: "gmail"` and
 * the Gmail Message-ID.
 *
 * Requires a service-role Supabase client (e.g. `createServerClient()` from `@/lib/supabase`) — the
 * table is RLS-locked with no authenticated grants, so anon/authenticated clients cannot use it.
 */

export type InboundPlatform = "gmail" | "whatsapp" | "instagram" | "facebook";

export type InboundEventStatus =
  | "received"
  | "processing"
  | "processed"
  | "failed";

export interface RecordInboundEventInput {
  platform: InboundPlatform;
  externalMessageId: string;
  /** Full raw event payload, stored as jsonb for replay/audit. */
  rawPayload: unknown;
  /** Optional once tenant is resolved; left null at webhook time. */
  workspaceId?: string | null;
  teamId?: string | null;
}

export interface RecordInboundEventResult {
  externalMessageId: string;
  /** First time we have seen this (platform, message_id): the row was inserted. */
  inserted: boolean;
  /** The event already existed — safe to drop. */
  duplicate: boolean;
  /** Row id when freshly inserted; null on duplicate or error. */
  id: string | null;
  /** Non-null when the insert genuinely failed (DB down, misconfig) — caller must NOT ack. */
  error: string | null;
}

const INBOUND_EVENTS_TABLE = "inbound_events";
const CONFLICT_TARGET = "platform,external_message_id";

/**
 * Idempotently record a single inbound event.
 *
 * Uses upsert with `ignoreDuplicates` (ON CONFLICT DO NOTHING). On a fresh insert the row is
 * returned (`inserted: true`); on a collision no row comes back (`duplicate: true`); a real DB
 * error sets `error` and leaves both flags false so the caller can refuse to ack and let the
 * platform redeliver.
 */
export async function recordInboundEvent(
  supabase: SupabaseClient,
  input: RecordInboundEventInput,
): Promise<RecordInboundEventResult> {
  const externalMessageId = input.externalMessageId;

  const { data, error } = await supabase
    .from(INBOUND_EVENTS_TABLE)
    .upsert(
      {
        platform: input.platform,
        external_message_id: externalMessageId,
        raw_payload: (input.rawPayload ?? {}) as Record<string, unknown>,
        workspace_id: input.workspaceId ?? null,
        team_id: input.teamId ?? null,
        status: "received" satisfies InboundEventStatus,
      },
      { onConflict: CONFLICT_TARGET, ignoreDuplicates: true },
    )
    .select("id");

  if (error) {
    return {
      externalMessageId,
      inserted: false,
      duplicate: false,
      id: null,
      error: error.message,
    };
  }

  const inserted = Array.isArray(data) && data.length > 0;
  return {
    externalMessageId,
    inserted,
    duplicate: !inserted,
    id: inserted ? (data[0].id as string) : null,
    error: null,
  };
}

/**
 * Record many inbound events (one webhook delivery can carry several messages). Preserves order.
 */
export async function recordInboundEvents(
  supabase: SupabaseClient,
  inputs: RecordInboundEventInput[],
): Promise<RecordInboundEventResult[]> {
  const results: RecordInboundEventResult[] = [];
  for (const input of inputs) {
    results.push(await recordInboundEvent(supabase, input));
  }
  return results;
}

/**
 * Stamp the resolved tenant onto already-persisted events (the webhook resolves the tenant at the
 * edge AFTER the idempotent persist). Setting `workspace_id` lets the DB trigger derive `team_id`,
 * but we pass both so the ledger is correct even if the trigger is absent. Best-effort: never
 * throws — tenant bookkeeping must not break the ack path. Returns true on success.
 */
export async function setInboundEventsTenant(
  supabase: SupabaseClient,
  ids: string[],
  workspaceId: string | null,
  teamId: string | null,
): Promise<boolean> {
  if (ids.length === 0) return true;

  try {
    const { error } = await supabase
      .from(INBOUND_EVENTS_TABLE)
      .update({ workspace_id: workspaceId ?? null, team_id: teamId ?? null })
      .in("id", ids);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Advance the status of already-persisted events (e.g. to `processing` once handed to n8n, or
 * `failed` if the hand-off fails). Best-effort: never throws — status bookkeeping must not break
 * the ack path. Returns true on success.
 */
export async function markInboundEventsStatus(
  supabase: SupabaseClient,
  ids: string[],
  status: InboundEventStatus,
  errorText?: string | null,
): Promise<boolean> {
  if (ids.length === 0) return true;

  const patch: Record<string, unknown> = { status };
  if (status === "processed") patch.processed_at = new Date().toISOString();
  if (errorText !== undefined) patch.error = errorText;

  try {
    const { error } = await supabase
      .from(INBOUND_EVENTS_TABLE)
      .update(patch)
      .in("id", ids);
    return !error;
  } catch {
    return false;
  }
}
