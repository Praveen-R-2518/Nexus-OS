import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  rateLimit,
  readJsonObjectWithLimit,
  requireN8nToken,
} from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";
import { parseWorkspaceId } from "@/lib/workspace-id";
import { recordInboundEvent, type InboundPlatform } from "@/lib/inbound-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INBOUND_PLATFORMS: readonly InboundPlatform[] = [
  "gmail",
  "whatsapp",
  "instagram",
  "facebook",
];

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

/**
 * Channel-agnostic inbound ledger record endpoint (Task 3.3).
 *
 * n8n (e.g. WF0a IMAP intake) calls this per fetched message BEFORE processing so that Gmail —
 * like Meta — flows through the durable `inbound_events` ledger keyed on (platform,
 * external_message_id). The response `duplicate` flag lets the caller drop re-deliveries as no-ops.
 * Token-guarded (N8N_INGEST_TOKEN); the RLS-locked ledger is only writable by the service role.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:internal:n8n:inbound-record", 240, 60_000);
  if (limited) return limited;

  const unauthorized = requireN8nToken(request);
  if (unauthorized) return unauthorized;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.ingest);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const platform = typeof body.platform === "string" ? body.platform.trim() : "";
  if (!INBOUND_PLATFORMS.includes(platform as InboundPlatform)) {
    return NextResponse.json(
      {
        success: false,
        error: `platform is required and must be one of ${INBOUND_PLATFORMS.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const externalMessageId = boundedString(body.external_message_id, 998);
  if (!externalMessageId) {
    return NextResponse.json(
      { success: false, error: "external_message_id is required" },
      { status: 400 },
    );
  }

  const rawPayload = Object.prototype.hasOwnProperty.call(body, "raw_payload")
    ? body.raw_payload
    : body;

  const workspaceId = parseWorkspaceId(body.workspace_id);
  const teamId = parseWorkspaceId(body.team_id);

  let supabase;
  try {
    supabase = createServerClient();
  } catch {
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500 },
    );
  }

  const result = await recordInboundEvent(supabase, {
    platform: platform as InboundPlatform,
    externalMessageId,
    rawPayload,
    workspaceId,
    teamId,
  });

  if (result.error) {
    console.error("[internal n8n inbound-record] Supabase error:", result.error);
    return NextResponse.json(
      { success: false, error: "Failed to record inbound event" },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      inserted: result.inserted,
      duplicate: result.duplicate,
      id: result.id,
    },
    { status: 200 },
  );
}
