import { NextResponse } from "next/server";
import { rateLimitDurable, requireN8nBootstrapToken } from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Scheduler endpoint (called BY the n8n social-post scheduler workflow). Atomically CLAIMS due
 * scheduled posts by flipping them to `publishing` and returning them, so overlapping polls
 * never double-publish. Bootstrap-token-guarded — this endpoint IS the claimer, no job exists
 * yet. The workflow then hands each post to WF8b and reports back via post-result.
 *
 * Task D.1: this path runs completely unattended (no founder present at claim time), so unlike
 * the manual `/api/posts/publish` route it must NOT self-approve — it only claims posts that
 * were already approved when scheduled (`schedulePost()` stamps `approval_status`/`approved_at`).
 * A post stuck in `scheduled` without either set (e.g. a row written before this column existed)
 * is left alone rather than silently auto-published.
 */
export async function GET(request: Request) {
  const limited = await rateLimitDurable(
    request,
    "api:internal:n8n:scheduled-posts",
    60,
    60_000,
  );
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

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("social_posts")
    .update({ status: "publishing", updated_at: nowIso })
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .or("approval_status.eq.approved,approved_at.not.is.null")
    .select("id, organization_id, platforms, captions, media_url, user_description");

  if (error) {
    console.error("[internal n8n scheduled-posts] Supabase error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to claim scheduled posts" },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, data: data ?? [] }, { status: 200 });
}
