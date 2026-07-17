import { createServerClient } from "@/lib/supabase";
import {
  DEFAULT_BATCH_SIZE,
  fetchGmailMessage,
  gmailMessageToIntakePayload,
  listGmailMessageIds,
} from "@/lib/gmail/backfill";
import { getWorkspaceGmailCredential } from "@/lib/gmail/credentials";
import { forwardInboundToN8n } from "@/lib/n8n-intake";
import { markInboundEventsStatus, recordInboundEvent } from "@/lib/inbound-events";

const MAX_RUNTIME_MS = 55_000;
const MAX_CREDENTIALS_PER_RUN = 10;
// First sync after connect looks back one day; history is the backfill job's job.
const FIRST_SYNC_LOOKBACK_MS = 24 * 60 * 60 * 1000;

type SyncCredentialRow = {
  id: string;
  workspace_id: string;
  last_synced_at: string | null;
};

export type GmailSyncDeps = {
  createSupabase: typeof createServerClient;
  resolveCredential: typeof getWorkspaceGmailCredential;
  listMessages: typeof listGmailMessageIds;
  fetchMessage: typeof fetchGmailMessage;
  forward: typeof forwardInboundToN8n;
  recordEvent: typeof recordInboundEvent;
  markEventStatus: typeof markInboundEventsStatus;
  now: () => number;
};

export const defaultGmailSyncDeps: GmailSyncDeps = {
  createSupabase: createServerClient,
  resolveCredential: getWorkspaceGmailCredential,
  listMessages: listGmailMessageIds,
  fetchMessage: fetchGmailMessage,
  forward: forwardInboundToN8n,
  recordEvent: recordInboundEvent,
  markEventStatus: markInboundEventsStatus,
  now: () => Date.now(),
};

export interface WorkspaceSyncOutcome {
  workspace_id: string;
  fetched: number;
  forwarded: number;
  error: string | null;
}

/**
 * Continuous Gmail sync worker (release hardening 2026-07-14).
 *
 * WF0a's IMAP trigger was never configured (single-mailbox, no credential), so
 * nothing pulled NEW mail for OAuth-connected accounts — backfill covered
 * history only. This worker walks every sync-enabled OAuth credential, lists
 * inbox messages since last_synced_at via the Gmail API, and pushes each
 * through the SAME n8n intake path as backfill (WF0a ledger dedups by
 * Message-ID, so the day-granular `after:` overlap is safe). Token-guarded;
 * intended for n8n WF0f on a 10-minute schedule.
 */
export async function runGmailSync(
  depsOverride: Partial<GmailSyncDeps> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const deps: GmailSyncDeps = { ...defaultGmailSyncDeps, ...depsOverride };
  let supabase;
  try {
    supabase = deps.createSupabase();
  } catch {
    return { status: 500, body: { success: false, error: "Server configuration error" } };
  }

  const { data: rows, error: credErr } = await supabase
    .from("gmail_credentials")
    .select("id, workspace_id, last_synced_at")
    .eq("credential_type", "oauth")
    .eq("status", "connected")
    .eq("sync_enabled", true)
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(MAX_CREDENTIALS_PER_RUN);

  if (credErr) {
    return { status: 502, body: { success: false, error: credErr.message } };
  }

  const credentials = (rows ?? []) as SyncCredentialRow[];
  if (credentials.length === 0) {
    return { status: 200, body: { success: true, processed: [] } };
  }

  const started = deps.now();
  const processed: WorkspaceSyncOutcome[] = [];

  for (const row of credentials) {
    if (deps.now() - started > MAX_RUNTIME_MS) break;

    const outcome: WorkspaceSyncOutcome = {
      workspace_id: row.workspace_id,
      fetched: 0,
      forwarded: 0,
      error: null,
    };
    processed.push(outcome);

    const credResult = await deps.resolveCredential(supabase, row.workspace_id);
    if (!credResult.ok || !credResult.credential) {
      outcome.error = credResult.error ?? "no_connected_credential";
      await supabase
        .from("gmail_credentials")
        .update({ last_sync_error: outcome.error })
        .eq("id", row.id);
      continue;
    }

    const sinceIso =
      row.last_synced_at ?? new Date(deps.now() - FIRST_SYNC_LOOKBACK_MS).toISOString();

    try {
      const list = await deps.listMessages(credResult.credential.accessToken, {
        afterDate: sinceIso,
        maxResults: DEFAULT_BATCH_SIZE,
      });

      for (const messageId of list.messageIds) {
        if (deps.now() - started > MAX_RUNTIME_MS) break;

        outcome.fetched += 1;
        const message = await deps.fetchMessage(
          credResult.credential.accessToken,
          messageId,
        );
        if (!message) continue;

        const payload = gmailMessageToIntakePayload(
          message,
          credResult.credential.emailAddress,
        );
        if (!payload) continue;

        // Persist-before-forward (Task A.1): mirror the Meta webhook's durable ledger so a Gmail
        // message is never lost to a crashed/timed-out forward, and re-fetches of the same
        // Message-ID (day-granular `after:` overlap) are a no-op instead of a duplicate forward.
        const ledgerResult = await deps.recordEvent(supabase, {
          platform: "gmail",
          externalMessageId: payload.headers["message-id"],
          rawPayload: payload,
          workspaceId: credResult.credential.workspaceId,
          teamId: credResult.credential.teamId,
        });

        if (ledgerResult.error) {
          // Could not durably persist — skip forwarding so it is never lost; the next sync pass
          // re-fetches this message (day-granular `after:` overlap) and retries the ledger write.
          outcome.error = "ledger_persist_failed";
          continue;
        }
        if (ledgerResult.duplicate) {
          // Already ingested (and forwarded) by a previous pass — do not re-forward.
          continue;
        }

        const forwardResult = await deps.forward(payload, "gmail");
        if (forwardResult === "skipped") {
          outcome.error = "n8n_not_configured";
          if (ledgerResult.id) {
            await deps.markEventStatus(supabase, [ledgerResult.id], "received", "n8n not configured");
          }
          return {
            status: 200,
            body: { success: true, processed, skipped: true },
          };
        }
        if (forwardResult === "forwarded") {
          outcome.forwarded += 1;
          if (ledgerResult.id) {
            await deps.markEventStatus(supabase, [ledgerResult.id], "processing");
          }
        } else if (ledgerResult.id) {
          await deps.markEventStatus(supabase, [ledgerResult.id], "received", "n8n forward failed");
        }
      }

      await supabase
        .from("gmail_credentials")
        .update({
          last_synced_at: new Date(deps.now()).toISOString(),
          last_sync_error: null,
        })
        .eq("id", row.id);
    } catch (err) {
      outcome.error = err instanceof Error ? err.message : "gmail_sync_failed";
      await supabase
        .from("gmail_credentials")
        .update({ last_sync_error: outcome.error })
        .eq("id", row.id);
      // Rate limits apply account-wide for this credential only; keep going
      // with the next workspace so one noisy inbox can't starve the rest.
    }
  }

  return { status: 200, body: { success: true, processed } };
}
