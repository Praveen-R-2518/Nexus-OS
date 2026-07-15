import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiOrgContext,
} from "@/lib/api-security";
import { captionFromImage, OpenAINotConfiguredError } from "@/lib/posts/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const POST_MEDIA_BUCKET = "post-media";

/** Write a caption from the uploaded image (GPT-4o vision). Returns `{ caption }`. */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:posts:vision", 20, 60_000);
  if (limited) return limited;

  const org = await requireApiOrgContext();
  if (!org.ok) return org.response;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl.trim() : "";
  const hint = typeof body.hint === "string" ? body.hint.trim() : null;
  if (!mediaUrl) return jsonError("mediaUrl is required", 400);

  const { data: signed } = await org.supabase.storage
    .from(POST_MEDIA_BUCKET)
    .createSignedUrl(mediaUrl, 600);
  if (!signed?.signedUrl) return jsonError("Could not read the media", 400);

  try {
    const caption = await captionFromImage({ imageDataUrl: signed.signedUrl, hint });
    return NextResponse.json({ caption });
  } catch (e) {
    if (e instanceof OpenAINotConfiguredError) return jsonError(e.message, 503);
    console.error("[posts/vision-caption]", e instanceof Error ? e.message : e);
    return jsonError("Caption from image failed", 502);
  }
}
