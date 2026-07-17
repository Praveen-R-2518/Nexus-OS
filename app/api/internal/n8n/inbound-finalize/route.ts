import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  rateLimit,
  readJsonObjectWithLimit,
  requireN8nBootstrapToken,
} from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";
import { parseWorkspaceId } from "@/lib/workspace-id";
import {
  markInboundEventsStatus,
  type InboundPlatform,
} from "@/lib/inbound-events";

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

type FinalizeEventInput = {
  id?: unknown;
  platform?: unknown;
  external_message_id?: unknown;
};

/**
 * Marks durable `inbound_events` rows as `processed` after WF0a (or replay) finishes
 * successfully. Bootstrap-token-guarded; best-effort per event — partial success is reported.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:internal:n8n:inbound-finalize", 240, 60_000);
  if (limited) return limited;

  const unauthorized = requireN8nBootstrapToken(request);
  if (unauthorized) return unauthorized;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const rawEvents: FinalizeEventInput[] = Array.isArray(body.events)
    ? (body.events as FinalizeEventInput[])
    : [
        {
          id: body.id,
          platform: body.platform,
          external_message_id: body.external_message_id,
        },
      ];

  if (rawEvents.length === 0) {
    return NextResponse.json(
      { success: false, error: "events array or id/platform pair is required" },
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

  const idsToFinalize: string[] = [];
  const lookupFailures: string[] = [];

  for (const event of rawEvents) {
    const id = parseWorkspaceId(event.id);
    if (id) {
      idsToFinalize.push(id);
      continue;
    }

    const platform =
      typeof event.platform === "string" ? event.platform.trim() : "";
    const externalMessageId = boundedString(event.external_message_id, 998);
    if (!INBOUND_PLATFORMS.includes(platform as InboundPlatform) || !externalMessageId) {
      lookupFailures.push("invalid_platform_or_external_message_id");
      continue;
    }

    const { data, error } = await supabase
      .from("inbound_events")
      .select("id")
      .eq("platform", platform)
      .eq("external_message_id", externalMessageId)
      .maybeSingle();

    if (error || !data?.id) {
      lookupFailures.push(`${platform}:${externalMessageId}`);
      continue;
    }
    idsToFinalize.push(data.id as string);
  }

  if (idsToFinalize.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "no matching inbound events to finalize",
        lookup_failures: lookupFailures,
      },
      { status: 404 },
    );
  }

  const ok = await markInboundEventsStatus(supabase, idsToFinalize, "processed");
  if (!ok) {
    return NextResponse.json(
      { success: false, error: "Failed to finalize inbound events" },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      finalized: idsToFinalize.length,
      lookup_failures: lookupFailures,
    },
    { status: 200 },
  );
}
