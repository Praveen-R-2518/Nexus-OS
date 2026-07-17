import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  rateLimitDurable,
  readJsonObjectWithLimit,
  requireApiOrgContext,
} from "@/lib/api-security";
import { generateImage, OpenAINotConfiguredError } from "@/lib/posts/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const POST_MEDIA_BUCKET = "post-media";
const BRAND_ASSETS_BUCKET = "brand-assets";

/** Per-organization image generations per day (cost guardrail). */
const DAILY_ORG_IMAGE_LIMIT = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Text-to-image (or reference-guided image edit) via OpenAI. Uploads the result
 * to `post-media`, records a `post_generations` row for the undo chain, and
 * returns a signed URL. Org id is derived server-side; the paid call is capped
 * per-IP per-minute and per-org per-day.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:posts:image", 5, 60_000);
  if (limited) return limited;

  const org = await requireApiOrgContext();
  if (!org.ok) return org.response;

  const dailyCap = await rateLimitDurable(
    request,
    "api:posts:image-daily",
    DAILY_ORG_IMAGE_LIMIT,
    DAY_MS,
    { key: org.organizationId },
  );
  if (dailyCap) return dailyCap;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const parentGenerationId =
    typeof body.parentGenerationId === "string" && body.parentGenerationId.trim()
      ? body.parentGenerationId.trim()
      : null;
  const referenceAssetPath =
    typeof body.referenceAssetPath === "string" && body.referenceAssetPath.trim()
      ? body.referenceAssetPath.trim()
      : null;

  if (!prompt) return jsonError("prompt is required", 400);

  try {
    // Reference-guided: pull the brand asset bytes to steer the generation.
    let reference: { bytes: Buffer; filename: string } | null = null;
    if (referenceAssetPath) {
      const { data: blob } = await org.supabase.storage
        .from(BRAND_ASSETS_BUCKET)
        .download(referenceAssetPath);
      if (blob) {
        const bytes = Buffer.from(await blob.arrayBuffer());
        reference = { bytes, filename: "reference.png" };
      }
    }

    const image = await generateImage({ prompt, reference });

    const imagePath = `${org.organizationId}/${randomUUID()}.png`;
    const { error: uploadErr } = await org.supabase.storage
      .from(POST_MEDIA_BUCKET)
      .upload(imagePath, image.buffer, { contentType: "image/png", upsert: false });
    if (uploadErr) throw uploadErr;

    const { data: genRow, error: genErr } = await org.supabase
      .from("post_generations")
      .insert({
        organization_id: org.organizationId,
        prompt: image.prompt,
        image_url: imagePath,
        parent_generation_id: parentGenerationId,
        model: image.model,
        created_by: org.user.id,
      })
      .select("id")
      .single();
    if (genErr) throw genErr;

    const { data: signed } = await org.supabase.storage
      .from(POST_MEDIA_BUCKET)
      .createSignedUrl(imagePath, 24 * 60 * 60);

    return NextResponse.json({
      generation_id: (genRow as { id: string }).id,
      image_path: imagePath,
      signed_url: signed?.signedUrl ?? null,
      enhanced_prompt: image.prompt,
    });
  } catch (e) {
    if (e instanceof OpenAINotConfiguredError) return jsonError(e.message, 503);
    console.error("[posts/generate-image]", e instanceof Error ? e.message : e);
    return jsonError("Image generation failed", 502);
  }
}
