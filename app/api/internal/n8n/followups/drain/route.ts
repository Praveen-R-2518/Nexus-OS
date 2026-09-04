import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  rateLimitDurable,
  readJsonObjectWithLimit,
  requireN8nBootstrapToken,
} from "@/lib/api-security";
import { drainDueFollowups } from "@/lib/followups/drain";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/internal/n8n/followups/drain
 *
 * WF4 scheduler: claim due follow-ups and persist approval-gated drafts in-app.
 * Bootstrap/ingest token. Empty body is allowed.
 */
export async function POST(request: Request) {
  const limited = await rateLimitDurable(
    request,
    "api:internal:n8n:followups-drain",
    30,
    60_000,
  );
  if (limited) return limited;

  const unauthorized = requireN8nBootstrapToken(request);
  if (unauthorized) return unauthorized;

  let limit: unknown;
  const contentLength = request.headers.get("content-length");
  const hasBody = contentLength ? Number.parseInt(contentLength, 10) > 0 : false;
  if (hasBody) {
    const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
    if (!parsed.ok) return parsed.response;
    limit = parsed.body.limit;
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

  try {
    const result = await drainDueFollowups(supabase, { limit });
    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (err) {
    console.error("[internal n8n followups/drain]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { success: false, error: "Failed to drain follow-ups" },
      { status: 502 },
    );
  }
}
