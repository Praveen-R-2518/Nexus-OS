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
const DAILY_ORG_IMAGE_LIMIT = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Edit an existing AI generation with a text instruction (image-to-image). Reads
 * the source generation, runs an OpenAI image edit, records a new
 * `post_generations` row whose parent is the edited generation (undo chain).
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

  const editOf = typeof body.editOf === "string" ? body.editOf.trim() : "";
  const editInstruction =
    typeof body.editInstruction === "string" ? body.editInstruction.trim() : "";
  if (!editOf || !editInstruction) {
    return jsonError("editOf and editInstruction are required", 400);
  }

  try {
    const { data: gen, error: genErr } = await org.supabase
      .from("post_generations")
      .select("id, image_url, prompt")
      .eq("id", editOf)
      .eq("organization_id", org.organizationId)
      .maybeSingle();
    if (genErr) throw genErr;
    if (!gen) return jsonError("Source image not found", 404);

    const sourcePath = (gen as { image_url: string }).image_url;
    const { data: blob } = await org.supabase.storage
      .from(POST_MEDIA_BUCKET)
      .download(sourcePath);
    if (!blob) return jsonError("Source image is unavailable", 404);

    const bytes = Buffer.from(await blob.arrayBuffer());
    const image = await generateImage({
      prompt: editInstruction,
      reference: { bytes, filename: "source.png" },
    });

    const imagePath = `${org.organizationId}/${randomUUID()}.png`;
    const { error: uploadErr } = await org.supabase.storage
      .from(POST_MEDIA_BUCKET)
      .upload(imagePath, image.buffer, { contentType: "image/png", upsert: false });
    if (uploadErr) throw uploadErr;

    const { data: newGen, error: insErr } = await org.supabase
      .from("post_generations")
      .insert({
        organization_id: org.organizationId,
        prompt: editInstruction,
        image_url: imagePath,
        parent_generation_id: editOf,
        model: image.model,
        created_by: org.user.id,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    const { data: signed } = await org.supabase.storage
      .from(POST_MEDIA_BUCKET)
      .createSignedUrl(imagePath, 24 * 60 * 60);

    return NextResponse.json({
      generation_id: (newGen as { id: string }).id,
      image_path: imagePath,
      signed_url: signed?.signedUrl ?? null,
      enhanced_prompt: editInstruction,
    });
  } catch (e) {
    if (e instanceof OpenAINotConfiguredError) return jsonError(e.message, 503);
    console.error("[posts/edit-image]", e instanceof Error ? e.message : e);
    return jsonError("Image edit failed", 502);
  }
}
