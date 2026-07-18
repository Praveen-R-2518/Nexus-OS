import "server-only";

import { createServerClient } from "@/lib/supabase";
import { getWorkspaceMailboxCredential } from "@/lib/mailbox/credentials";
import { fetchMailboxMessages, mailboxMessageToIntakePayload } from "@/lib/mailbox/imap";
import { forwardInboundToN8n } from "@/lib/n8n-intake";
import { markInboundEventsStatus, recordInboundEvent } from "@/lib/inbound-events";

const MAX_RUNTIME_MS = 55_000;
const MAX_CREDENTIALS_PER_RUN = 10;
const MAX_MESSAGES_PER_MAILBOX = 50;
// First poll after connect looks back one day; older history is a manual backfill concern.
const FIRST_SYNC_LOOKBACK_MS = 24 * 60 * 60 * 1000;

type SyncCredentialRow = {
  id: string;
  workspace_id: string;
  last_synced_at: string | null;
};

export type MailboxSyncDeps = {
  createSupabase: typeof createServerClient;
  resolveCredential: typeof getWorkspaceMailboxCredential;
  fetchMessages: typeof fetchMailboxMessages;
  toPayload: typeof mailboxMessageToIntakePayload;
  forward: typeof forwardInboundToN8n;
  recordEvent: typeof recordInboundEvent;
  markEventStatus: typeof markInboundEventsStatus;
  now: () => number;
};

export const defaultMailboxSyncDeps: MailboxSyncDeps = {
  createSupabase: createServerClient,
  resolveCredential: getWorkspaceMailboxCredential,
  fetchMessages: fetchMailboxMessages,
  toPayload: mailboxMessageToIntakePayload,
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
 * Continuous generic-mailbox (IMAP) sync worker — the any-provider sibling of `runGmailSync`.
 *
 * Walks every sync-enabled, connected mailbox with `credential_type='imap'` AND a configured
 * `imap_host` (so it NEVER touches Gmail OAuth rows, and never the legacy Gmail-only IMAP rows that
 * have a null host), pulls INBOX messages since `last_synced_at` over IMAP, and pushes each through
 * the SAME persist-before-forward n8n intake path as the Gmail worker. The durable `inbound_events`
 * ledger (keyed by the globally-unique Message-ID) dedups re-fetches, so the day-granular `since`
 * overlap is safe. Token-guarded; intended for an n8n scheduler on a ~10-minute cadence.
 */
export async function runMailboxSync(
  depsOverride: Partial<MailboxSyncDeps> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const deps: MailboxSyncDeps = { ...defaultMailboxSyncDeps, ...depsOverride };
  let supabase;
  try {
    supabase = deps.createSupabase();
  } catch {
    return { status: 500, body: { success: false, error: "Server configuration error" } };
  }

  const { data: rows, error: credErr } = await supabase
    .from("gmail_credentials")
    .select("id, workspace_id, last_synced_at")
    .eq("credential_type", "imap")
    .eq("status", "connected")
    .eq("sync_enabled", true)
    .not("imap_host", "is", null)
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
    if (!credResult.ok || !credResult.credential || !credResult.credential.imap) {
      outcome.error = credResult.error ?? "no_imap_endpoint";
      await supabase
        .from("gmail_credentials")
        .update({ last_sync_error: outcome.error })
        .eq("id", row.id);
      continue;
    }
    const credential = credResult.credential;

    const sinceIso =
      row.last_synced_at ?? new Date(deps.now() - FIRST_SYNC_LOOKBACK_MS).toISOString();

    try {
      const messages = await deps.fetchMessages(credential.imap!, {
        sinceIso,
        max: MAX_MESSAGES_PER_MAILBOX,
      });

      for (const message of messages) {
        if (deps.now() - started > MAX_RUNTIME_MS) break;

        outcome.fetched += 1;
        const payload = deps.toPayload(message, credential.emailAddress);
        if (!payload) continue;

        // Persist-before-forward: mirror the Gmail worker's durable ledger so a message is never lost
        // to a crashed/timed-out forward, and re-fetches of the same Message-ID (day-granular `since`
        // overlap) are a no-op instead of a duplicate. Recorded under platform 'gmail' — the ledger's
        // idempotency key is (platform, Message-ID) and Message-IDs are globally unique, so no new
        // platform value is needed; the 'email' source distinction lives on the conversation row.
        const ledgerResult = await deps.recordEvent(supabase, {
          platform: "gmail",
          externalMessageId: payload.headers["message-id"],
          rawPayload: payload,
          workspaceId: credential.workspaceId,
          teamId: credential.teamId,
        });

        if (ledgerResult.error) {
          outcome.error = "ledger_persist_failed";
          continue;
        }
        if (ledgerResult.duplicate) {
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
      outcome.error = err instanceof Error ? err.message : "mailbox_sync_failed";
      await supabase
        .from("gmail_credentials")
        .update({ last_sync_error: outcome.error })
        .eq("id", row.id);
      // Keep going with the next mailbox so one bad connection can't starve the rest.
    }
  }

  return { status: 200, body: { success: true, processed } };
}
