import { NextResponse } from "next/server";
import { rateLimitDurable, requireN8nToken } from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Scheduler endpoint (called BY the n8n social-post scheduler workflow, Bearer
 * N8N_INGEST_TOKEN). Atomically CLAIMS due scheduled posts by flipping them to
 * `publishing` and returning them, so overlapping polls never double-publish.
 * The workflow then hands each post to WF8b and reports back via post-result.
 */
export async function GET(request: Request) {
  const limited = await rateLimitDurable(
    request,
    "api:internal:n8n:scheduled-posts",
    60,
    60_000,
  );
  if (limited) return limited;

  const unauthorized = requireN8nToken(request);
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
