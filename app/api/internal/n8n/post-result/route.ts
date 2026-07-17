import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  rateLimitDurable,
  readJsonObjectWithLimit,
  requireN8nJobOrBootstrapToken,
} from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";
import { parseWorkspaceId } from "@/lib/workspace-id";

export const dynamic = "force-dynamic";

/**
 * Publish-result writeback (called BY WF8b / the scheduler). Sets the final
 * `published`/`failed` state — the browser is forbidden from writing these statuses, so the
 * terminal transition happens here with the service role. Job-scoped: expects a single-use
 * token minted for action `post_result` bound to (resource: post); falls back to the
 * bootstrap/legacy `N8N_INGEST_TOKEN` (with a warning) until n8n mints job tokens.
 */
export async function POST(request: Request) {
  const limited = await rateLimitDurable(
    request,
    "api:internal:n8n:post-result",
    120,
    60_000,
  );
  if (limited) return limited;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const postId = typeof body.postId === "string" ? body.postId.trim() : "";
  const statusRaw = typeof body.status === "string" ? body.status.trim() : "";
  const publishError =
    typeof body.error === "string" && body.error.trim() ? body.error.trim().slice(0, 500) : null;

  if (!postId || (statusRaw !== "published" && statusRaw !== "failed")) {
    return NextResponse.json(
      { success: false, error: "postId and status ('published'|'failed') are required" },
      { status: 400 },
    );
  }

  const unauthorized = await requireN8nJobOrBootstrapToken(
    request,
    "post_result",
    { resourceType: "post", resourceId: parseWorkspaceId(postId) },
    "internal n8n post-result",
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

  const patch: Record<string, unknown> = {
    status: statusRaw,
    publish_error: statusRaw === "failed" ? publishError : null,
    updated_at: new Date().toISOString(),
  };
  if (statusRaw === "published") patch.published_at = new Date().toISOString();

  const { error } = await supabase.from("social_posts").update(patch).eq("id", postId);
  if (error) {
    console.error("[internal n8n post-result] Supabase error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update post" },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
