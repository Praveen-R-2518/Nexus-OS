import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiOrgContext,
} from "@/lib/api-security";
import { generatePlatformCaptions, OpenAINotConfiguredError } from "@/lib/posts/ai";
import { POST_PLATFORMS, type Platform } from "@/lib/posts/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const POST_MEDIA_BUCKET = "post-media";

/**
 * Generate per-platform captions with OpenAI (GPT-4o, vision when media is present).
 * Returns `{ captions }` ONLY — the social_posts row is created later by the
 * Save/Schedule/Upload actions, so manual posts never depend on this route.
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

  if (!userDescription || platforms.length === 0) {
    return jsonError("A description and at least one platform are required", 400);
  }

  // Sign the private media path so the vision model can see it. Best-effort:
  // captioning still works from the description alone if signing fails.
  let imageUrl: string | null = null;
  if (mediaUrl) {
    const { data } = await org.supabase.storage
      .from(POST_MEDIA_BUCKET)
      .createSignedUrl(mediaUrl, 600);
    imageUrl = data?.signedUrl ?? null;
  }

  try {
    const captions = await generatePlatformCaptions({
      userDescription,
      platforms,
      imageDataUrl: imageUrl,
    });
    return NextResponse.json({ captions });
  } catch (e) {
    if (e instanceof OpenAINotConfiguredError) return jsonError(e.message, 503);
    console.error("[posts/generate-captions]", e instanceof Error ? e.message : e);
    return jsonError("Caption generation failed", 502);
  }
}
