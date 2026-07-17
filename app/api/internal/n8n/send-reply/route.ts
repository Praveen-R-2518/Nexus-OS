import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  rateLimitDurable,
  readJsonObjectWithLimit,
  requireN8nJobOrBootstrapToken,
} from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";
import { parseWorkspaceId } from "@/lib/workspace-id";
import { executeSendReply } from "@/lib/channel-sender";

export const dynamic = "force-dynamic";

/**
 * Channel Sender — turns an APPROVED reply_draft into a real email (docs/channel_sender.md).
 * Called by the n8n approval-trigger workflow. Job-scoped: expects a single-use token minted
 * for action `send_reply` bound to (team_id, draft). Falls back to the bootstrap/legacy
 * `N8N_INGEST_TOKEN` (with a warning) until n8n mints job tokens. Tenant-scoped and idempotent.
 * All send logic lives in `lib/channel-sender.ts`; this route only auth/parses.
 */
export async function POST(request: Request) {
  const limited = await rateLimitDurable(request, "api:internal:n8n:send-reply", 60, 60_000);
  if (limited) return limited;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const draftId = parseWorkspaceId(body.draft_id);
  if (!draftId) {
    return NextResponse.json(
      { success: false, error: "draft_id is required and must be a valid UUID" },
      { status: 400 },
    );
  }
  const teamId = parseWorkspaceId(body.team_id);
  if (!teamId) {
    return NextResponse.json(
      { success: false, error: "team_id is required and must be a valid UUID" },
      { status: 400 },
    );
  }

  const jobId = parseWorkspaceId(body.job_id);
  const unauthorized = await requireN8nJobOrBootstrapToken(
    request,
    "send_reply",
    jobId
      ? { teamId, resourceType: "outbound_job", resourceId: jobId }
      : { teamId, resourceType: "draft", resourceId: draftId },
    "internal n8n send-reply",
  );
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

  const result = await executeSendReply(supabase, {
    draftId,
    teamId,
    conversationId: parseWorkspaceId(body.conversation_id),
    workspaceId: parseWorkspaceId(body.workspace_id),
  });
  return NextResponse.json(result.body, { status: result.status });
}
