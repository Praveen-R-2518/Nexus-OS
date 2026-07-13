import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  rateLimit,
  readJsonObjectWithLimit,
  requireN8nToken,
} from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";
import { parseWorkspaceId } from "@/lib/workspace-id";
import {
  claimGmailBackfillJob,
  updateGmailBackfillJobProgress,
} from "@/lib/gmail/backfill-jobs";
import {
  DEFAULT_BATCH_SIZE,
  fetchGmailMessage,
  gmailMessageToIntakePayload,
  listGmailMessageIds,
} from "@/lib/gmail/backfill";
import { getWorkspaceGmailCredential } from "@/lib/gmail/credentials";
import { forwardInboundToN8n } from "@/lib/n8n-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RUNTIME_MS = 55_000;

/**
 * Gmail historical backfill worker (Task 3.4).
 *
 * Claims one pending/running gmail_backfill_jobs row, fetches up to one batch of inbox messages
 * via Gmail API, and forwards each through the same n8n intake path as live Gmail (WF0a ledger).
 * Token-guarded (N8N_INGEST_TOKEN); intended for n8n WF0e on a schedule.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:internal:n8n:gmail-backfill", 30, 60_000);
  if (limited) return limited;

  const unauthorized = requireN8nToken(request);
  if (unauthorized) return unauthorized;

  let workspaceId: string | null = null;
  let jobId: string | null = null;

  const contentLength = request.headers.get("content-length");
  const hasBody = contentLength ? Number.parseInt(contentLength, 10) > 0 : false;
  if (hasBody) {
    const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
    if (!parsed.ok) return parsed.response;
    workspaceId = parseWorkspaceId(parsed.body.workspace_id);
    jobId = parseWorkspaceId(parsed.body.job_id);
  }

  let supabase;
  try {
    supabase = createServerClient();
  } catch {
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500 },
    );
  }

  const job = await claimGmailBackfillJob(supabase, { workspaceId: workspaceId ?? undefined, jobId: jobId ?? undefined });
  if (!job) {
    return NextResponse.json({ success: true, claimed: false }, { status: 200 });
  }

  const credResult = await getWorkspaceGmailCredential(supabase, job.workspaceId);
  if (!credResult.ok || !credResult.credential) {
    await updateGmailBackfillJobProgress(supabase, job.id, {
      status: "failed",
      lastError: credResult.error ?? "no_connected_credential",
    });
    return NextResponse.json(
      { success: false, error: credResult.error ?? "no_connected_credential" },
      { status: 502 },
    );
  }

  const started = Date.now();
  const pageToken = job.pageToken;
  let fetched = 0;
  let forwarded = 0;
  let nextPageToken: string | null = null;

  try {
    const list = await listGmailMessageIds(credResult.credential.accessToken, {
      afterDate: job.afterDate,
      pageToken,
      maxResults: DEFAULT_BATCH_SIZE,
    });
    nextPageToken = list.nextPageToken;

    for (const messageId of list.messageIds) {
      if (Date.now() - started > MAX_RUNTIME_MS) break;

      fetched += 1;
      const message = await fetchGmailMessage(credResult.credential.accessToken, messageId);
      if (!message) continue;

      const payload = gmailMessageToIntakePayload(message, credResult.credential.emailAddress);
      if (!payload) continue;

      const outcome = await forwardInboundToN8n(payload, "gmail");
      if (outcome === "skipped") {
        await updateGmailBackfillJobProgress(supabase, job.id, {
          lastError: "n8n_not_configured",
        });
        return NextResponse.json(
          { success: true, claimed: true, job_id: job.id, forwarded, fetched, skipped: true },
          { status: 200 },
        );
      }
      if (outcome === "forwarded") forwarded += 1;
    }

    const done = !nextPageToken;
    await updateGmailBackfillJobProgress(supabase, job.id, {
      pageToken: nextPageToken,
      messagesFetchedDelta: fetched,
      messagesForwardedDelta: forwarded,
      status: done ? "completed" : "running",
      lastError: null,
    });

    return NextResponse.json(
      {
        success: true,
        claimed: true,
        job_id: job.id,
        fetched,
        forwarded,
        completed: done,
        next_page_token: nextPageToken,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "backfill_failed";
    await updateGmailBackfillJobProgress(supabase, job.id, {
      messagesFetchedDelta: fetched,
      messagesForwardedDelta: forwarded,
      pageToken,
      lastError: message,
      status: message === "gmail_rate_limited" ? "running" : "failed",
    });
    return NextResponse.json(
      { success: false, error: message, job_id: job.id, fetched, forwarded },
      { status: message === "gmail_rate_limited" ? 429 : 502 },
    );
  }
}
