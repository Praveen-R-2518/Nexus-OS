import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  rateLimit,
  readJsonObjectWithLimit,
  requireN8nToken,
} from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";
import { parseWorkspaceId } from "@/lib/workspace-id";
import { autopilotSend } from "@/lib/channel-sender";

export const dynamic = "force-dynamic";

/**
 * WF3 autopilot entry point (docs/channel_sender.md). Receives a freshly-created draft and runs
 * the single auto-send policy (`lib/approval-policy.ts`) server-side: gated → leave pending for
 * the approval queue; auto → approve + send via the Channel Sender core. Guarded by
 * N8N_INGEST_TOKEN. All logic lives in `lib/channel-sender.ts`; this route only auth/parses.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:internal:n8n:autopilot-send", 60, 60_000);
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

  const result = await autopilotSend(supabase, {
    draftId,
    teamId,
    leadId: parseWorkspaceId(body.lead_id),
  });
  return NextResponse.json(result.body, { status: result.status });
}
