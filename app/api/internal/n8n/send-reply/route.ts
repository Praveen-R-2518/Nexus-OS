import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  rateLimitDurable,
  readJsonObjectWithLimit,
  requireN8nToken,
} from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";
import { parseWorkspaceId } from "@/lib/workspace-id";
import { executeSendReply } from "@/lib/channel-sender";

export const dynamic = "force-dynamic";

/**
 * Channel Sender — turns an APPROVED reply_draft into a real email (docs/channel_sender.md).
 * Called by the n8n approval-trigger workflow, guarded by N8N_INGEST_TOKEN. Tenant-scoped and
 * idempotent. All send logic lives in `lib/channel-sender.ts`; this route only auth/parses.
 */
export async function POST(request: Request) {
  const limited = await rateLimitDurable(request, "api:internal:n8n:send-reply", 60, 60_000);
  if (limited) return limited;

  const unauthorized = requireN8nToken(request);
  if (unauthorized) return unauthorized;

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
