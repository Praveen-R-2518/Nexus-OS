import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  n8nWebhookAuthHeaders,
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
 *
 * Task D.1: a previously-`rejected` post is blocked; otherwise this request itself records
 * approval (`approval_status`/`approved_at`/`approved_by`) if not already set.
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
    .select("id, status, platforms, approval_status, approved_at")
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

  // Task D.1: `social_posts.approval_status` is an audit trail, not a separate reviewer queue —
  // there is no second-approver UI for posts today. A previously-rejected post can't be silently
  // re-published, but otherwise this explicit "Publish now" request from an authenticated org
  // member IS the approval; we stamp it below in the same update that flips the post to
  // `publishing`, so `approval_status`/`approved_at` are always populated before WF8b/post-result
  // ever run for this post.
  const approvalStatus = (post as { approval_status?: string | null }).approval_status ?? null;
  if (approvalStatus === "rejected") {
    return jsonError("This post was rejected and can't be published as-is. Edit it first.", 409);
  }
  const alreadyApproved =
    approvalStatus === "approved" ||
    (post as { approved_at?: string | null }).approved_at != null;

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

  // Flip to publishing before firing WF8b so the board reflects it immediately. Stamp approval
  // (Task D.1) in the same write when it wasn't already recorded (e.g. via schedulePost()).
  const nowIso = new Date().toISOString();
  const { error: updErr } = await org.supabase
    .from("social_posts")
    .update({
      status: "publishing",
      publish_error: null,
      updated_at: nowIso,
      ...(alreadyApproved
        ? {}
        : { approval_status: "approved", approved_at: nowIso, approved_by: org.user.id }),
    })
    .eq("id", postId)
    .eq("organization_id", org.organizationId);
  if (updErr) return jsonError(updErr.message, 500);

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json", ...n8nWebhookAuthHeaders() },
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
