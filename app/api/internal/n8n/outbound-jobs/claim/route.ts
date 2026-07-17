import { NextResponse } from "next/server";
import { rateLimit, requireN8nBootstrapToken } from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";
import { issueN8nJobToken } from "@/lib/n8n-job-tokens";

export const dynamic = "force-dynamic";

const JOB_TOKEN_TTL_SECONDS = 10 * 60;

type OutboundJobRow = {
  id: string;
  team_id: string;
  workspace_id: string | null;
  draft_id: string | null;
  conversation_id: string | null;
  channel: string | null;
  status: string;
  attempts: number;
  created_at: string;
};

/**
 * Outbound job claimer (public.outbound_jobs, migration 20260717130000). Bootstrap-token-guarded
 * — this endpoint IS the claim step, so no job-scoped token exists yet. Atomically flips the
 * oldest `queued` row to `claiming` (`public.claim_next_outbound_job`, for-update-skip-locked, so
 * overlapping n8n pollers never double-claim) and mints a single-use `send_reply` job token bound
 * to (team_id, workspace_id, resource: outbound_job) that the caller must present to
 * `/api/internal/n8n/outbound-jobs/result` when it reports back.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:internal:n8n:outbound-jobs-claim", 60, 60_000);
  if (limited) return limited;

  const unauthorized = requireN8nBootstrapToken(request);
  if (unauthorized) return unauthorized;

  let supabase;
  try {
    supabase = createServerClient();
  } catch {
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500 },
    );
  }

  const { data, error } = await supabase.rpc("claim_next_outbound_job");
  if (error) {
    console.error("[internal n8n outbound-jobs claim] Supabase error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to claim outbound job" },
      { status: 502 },
    );
  }

  const rows = (data ?? []) as OutboundJobRow[];
  const job = rows[0];
  if (!job) {
    return NextResponse.json({ success: true, claimed: false }, { status: 200 });
  }

  let jobToken: { token: string; expiresAt: string };
  try {
    jobToken = await issueN8nJobToken({
      action: "send_reply",
      teamId: job.team_id,
      workspaceId: job.workspace_id,
      resourceType: "outbound_job",
      resourceId: job.id,
      ttlSeconds: JOB_TOKEN_TTL_SECONDS,
    });
  } catch (err) {
    console.error("[internal n8n outbound-jobs claim] issueN8nJobToken failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to mint job token" },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      claimed: true,
      job: {
        id: job.id,
        team_id: job.team_id,
        workspace_id: job.workspace_id,
        draft_id: job.draft_id,
        conversation_id: job.conversation_id,
        channel: job.channel,
        attempts: job.attempts,
      },
      job_token: jobToken.token,
      job_token_expires_at: jobToken.expiresAt,
    },
    { status: 200 },
  );
}
