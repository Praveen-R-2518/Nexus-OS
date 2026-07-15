import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiOrgContext,
} from "@/lib/api-security";
import type { Platform } from "@/lib/posts/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Resolve the WF8b publish webhook (server-only). Path matches the live WF8b. */
function publishWebhookUrl(): string | null {
  const direct = process.env.N8N_SOCIAL_PUBLISH_WEBHOOK_URL?.trim();
  if (direct) return direct;
  const base = process.env.N8N_WEBHOOK_BASE_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/webhook/publish-social-post`;
}

/**
 * Publish a post now. Validates ownership + that every target platform is
 * connected, flips the row to `publishing`, and triggers WF8b. WF8b writes the
 * final `published`/`failed` state back via /api/internal/n8n/post-result.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:posts:publish", 20, 60_000);
  if (limited) return limited;

  const org = await requireApiOrgContext();
  if (!org.ok) return org.response;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;
  const postId = typeof parsed.body.postId === "string" ? parsed.body.postId.trim() : "";
  if (!postId) return jsonError("postId is required", 400);

  // Load the post (RLS scopes to the caller's org).
  const { data: post, error: postErr } = await org.supabase
    .from("social_posts")
    .select("id, status, platforms")
    .eq("id", postId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (postErr) return jsonError(postErr.message, 500);
  if (!post) return jsonError("Post not found", 404);

  const platforms = ((post as { platforms: Platform[] | null }).platforms ?? []) as Platform[];
  if (platforms.length === 0) {
    return jsonError("Select at least one platform before publishing", 400);
  }
  const status = (post as { status: string }).status;
  if (status === "publishing" || status === "published") {
    return jsonError(`Post is already ${status}`, 409);
  }

  // Every target platform must have a connected credential.
  const { data: creds } = await org.supabase
    .from("social_credentials")
    .select("platform")
    .eq("organization_id", org.organizationId);
  const connected = new Set(
    (creds ?? []).map((r) => (r as { platform?: string }).platform).filter(Boolean),
  );
  const missing = platforms.filter((p) => !connected.has(p));
  if (missing.length > 0) {
    return jsonError(
      `Connect these platforms in Settings first: ${missing.join(", ")}`,
      409,
    );
  }

  const webhookUrl = publishWebhookUrl();
  if (!webhookUrl) {
    return jsonError("Publishing is not configured yet", 503);
  }

  // Flip to publishing before firing WF8b so the board reflects it immediately.
  const { error: updErr } = await org.supabase
    .from("social_posts")
    .update({ status: "publishing", publish_error: null, updated_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("organization_id", org.organizationId);
  if (updErr) return jsonError(updErr.message, 500);

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orgId: org.organizationId, postId, platforms }),
    });
    if (!res.ok) {
      console.error(`[posts/publish] WF8b responded ${res.status}`);
      return jsonError("Publishing failed to start", 502);
    }
  } catch (e) {
    console.error("[posts/publish]", e instanceof Error ? e.message : e);
    return jsonError("Publishing failed to start", 502);
  }

  return NextResponse.json({ ok: true, status: "publishing" });
}
