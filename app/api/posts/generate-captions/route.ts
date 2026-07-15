import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiOrgContext,
} from "@/lib/api-security";
import { POST_PLATFORMS, type Platform } from "@/lib/posts/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function captionWebhookUrl(): string | null {
  const direct = process.env.N8N_SOCIAL_POST_INPUT_WEBHOOK_URL?.trim();
  if (direct) return direct;
  const base = process.env.N8N_WEBHOOK_BASE_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/webhook/social-post-input`;
}

/**
 * Server-side proxy for the n8n caption-generation webhook. The browser used to
 * POST a client-supplied orgId straight to n8n (spoofable, hard-coded URL); the
 * org id is now derived server-side from the caller's user_profiles row and the
 * n8n URL stays server-only.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:posts:captions", 20, 60_000);
  if (limited) return limited;

  const org = await requireApiOrgContext();
  if (!org.ok) return org.response;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.medium);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl.trim() : "";
  const userDescription =
    typeof body.userDescription === "string" ? body.userDescription.trim() : "";
  const platforms = Array.isArray(body.platforms)
    ? body.platforms.filter(
        (p): p is Platform =>
          typeof p === "string" &&
          (POST_PLATFORMS as readonly string[]).includes(p),
      )
    : [];

  if (!mediaUrl || platforms.length === 0) {
    return jsonError("mediaUrl and at least one platform are required", 400);
  }

  const webhookUrl = captionWebhookUrl();
  if (!webhookUrl) {
    return jsonError("Caption generation is not configured", 503);
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orgId: org.organizationId,
        mediaUrl,
        userDescription,
        platforms,
      }),
    });
    if (!res.ok) {
      console.error(`[posts/generate-captions] n8n responded ${res.status}`);
      return jsonError("Caption generation failed", 502);
    }
    const json = (await res.json()) as unknown;
    return NextResponse.json(json);
  } catch (e) {
    console.error(
      "[posts/generate-captions] webhook error:",
      e instanceof Error ? e.message : e,
    );
    return jsonError("Caption generation failed", 502);
  }
}
