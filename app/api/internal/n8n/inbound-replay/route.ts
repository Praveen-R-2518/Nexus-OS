import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  rateLimit,
  readJsonObjectWithLimit,
  requireN8nBootstrapToken,
} from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";
import {
  applyReplayOutcome,
  fetchStuckInboundEvents,
  reclaimStuckProcessingEvents,
} from "@/lib/inbound-events";
import { channelForPlatform, forwardInboundToN8n } from "@/lib/n8n-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_OLDER_THAN_MINUTES = 10;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LIMIT = 50;

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/**
 * Ledger drain worker (Task 3.2).
 *
 * Re-forwards inbound_events rows stuck at `received`/`failed` back to the n8n intake webhook.
 * Bootstrap-token-guarded (this is the claim/reclaim sweep itself — no job exists yet); intended
 * to be called on a schedule (every 5-10 min) by an n8n workflow. Caps attempts: once a row
 * reaches `max_attempts` it is parked as `failed` and no longer picked up. Nothing is ever
 * silently dropped — a re-forward that fails stays retriable until the cap.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:internal:n8n:inbound-replay", 60, 60_000);
  if (limited) return limited;

  const unauthorized = requireN8nBootstrapToken(request);
  if (unauthorized) return unauthorized;

  // Body is optional; defaults are used when absent or malformed-but-empty.
  let olderThanMinutes = DEFAULT_OLDER_THAN_MINUTES;
  let maxAttempts = DEFAULT_MAX_ATTEMPTS;
  let limit = DEFAULT_LIMIT;

  const contentLength = request.headers.get("content-length");
  const hasBody = contentLength ? Number.parseInt(contentLength, 10) > 0 : false;
  if (hasBody) {
    const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
    if (!parsed.ok) return parsed.response;
    olderThanMinutes = clampInt(parsed.body.older_than_minutes, DEFAULT_OLDER_THAN_MINUTES, 0, 1440);
    maxAttempts = clampInt(parsed.body.max_attempts, DEFAULT_MAX_ATTEMPTS, 1, 20);
    limit = clampInt(parsed.body.limit, DEFAULT_LIMIT, 1, 200);
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

  // Reclaim rows stuck at `processing` (forward "succeeded" but the workflow never finished, or a
  // worker died mid-flight) back to `received` FIRST, so this same sweep can pick them up below.
  const reclaimed = await reclaimStuckProcessingEvents(supabase, {
    staleAfterMinutes: olderThanMinutes,
    limit,
  });

  const stuck = await fetchStuckInboundEvents(supabase, {
    olderThanMinutes,
    maxAttempts,
    limit,
  });

  let forwarded = 0;
  let exhausted = 0;
  let retriable = 0;
  let skipped = 0;

  for (const event of stuck) {
    const forwardBody = {
      ...(event.rawPayload && typeof event.rawPayload === "object"
        ? (event.rawPayload as Record<string, unknown>)
        : {}),
      _tenant: event.teamId
        ? { team_id: event.teamId, workspace_id: event.workspaceId ?? undefined }
        : undefined,
    };

    const outcome = await forwardInboundToN8n(
      forwardBody,
      channelForPlatform(event.platform),
    );

    if (outcome === "skipped") {
      // n8n not configured — retrying more rows is pointless and must not burn attempts. Stop here.
      skipped = stuck.length - (forwarded + exhausted + retriable);
      break;
    }

    const nextAttempts = event.attempts + 1;

    if (outcome === "forwarded") {
      await applyReplayOutcome(supabase, event.id, {
        status: "processing",
        attempts: nextAttempts,
        error: null,
      });
      forwarded += 1;
    } else if (nextAttempts >= maxAttempts) {
      await applyReplayOutcome(supabase, event.id, {
        status: "failed",
        attempts: nextAttempts,
        error: "replay_exhausted",
      });
      exhausted += 1;
    } else {
      await applyReplayOutcome(supabase, event.id, {
        status: "received",
        attempts: nextAttempts,
        error: "replay_failed",
      });
      retriable += 1;
    }
  }

  return NextResponse.json(
    {
      success: true,
      reclaimed,
      scanned: stuck.length,
      forwarded,
      exhausted,
      retriable,
      skipped,
    },
    { status: 200 },
  );
}
