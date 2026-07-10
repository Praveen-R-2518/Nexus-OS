"use client";

import type { Platform, SocialPost } from "./types";

/**
 * Live n8n webhooks for the Post unit.
 *
 * These are the ONLY two backend contracts that exist today. The three
 * AI helpers below (vision caption, caption enhance, image edit) are NOT
 * built yet — they throw {@link PostFeatureUnavailableError} so the UI can
 * surface a "Not available yet" affordance instead of hitting a guessed URL.
 */
const CAPTION_WEBHOOK =
  process.env.NEXT_PUBLIC_SOCIAL_POST_INPUT_WEBHOOK ??
  "https://knurdz3o.app.n8n.cloud/webhook/social-post-input";

const IMAGE_WEBHOOK =
  process.env.NEXT_PUBLIC_GENERATE_POST_IMAGE_WEBHOOK ??
  "https://knurdz3o.app.n8n.cloud/webhook/generate-post-image";

/** Thrown by the not-yet-built AI helpers so callers can show a clear toast. */
export class PostFeatureUnavailableError extends Error {
  constructor(feature: string) {
    super(`${feature} isn't available yet.`);
    this.name = "PostFeatureUnavailableError";
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(
      `Request failed (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`,
    );
  }
  return (await res.json()) as T;
}

/**
 * Multi-platform caption generation.
 *
 * This webhook ALSO writes the `social_posts` draft row itself, so the caller
 * does not insert separately — it returns the created row (status `draft`).
 */
export async function generateCaptions(input: {
  orgId: string;
  mediaUrl: string;
  userDescription: string;
  platforms: Platform[];
}): Promise<SocialPost> {
  return postJson<SocialPost>(CAPTION_WEBHOOK, {
    orgId: input.orgId,
    mediaUrl: input.mediaUrl,
    userDescription: input.userDescription,
    platforms: input.platforms,
  });
}

export interface GenerateImageResult {
  generation_id: string;
  /** Storage path within `post-media`, e.g. `org_id/filename.png`. */
  image_path: string;
  /** Signed URL valid ~24h — use immediately, re-sign for later display. */
  signed_url: string;
  enhanced_prompt: string;
}

/**
 * AI image generation (~$0.04/call — only invoke on explicit user action).
 *
 * Pass the current generation's id as `parentGenerationId` to regenerate a
 * variant (this builds the undo chain server-side); pass null for a fresh one.
 */
export async function generatePostImage(input: {
  orgId: string;
  prompt: string;
  parentGenerationId: string | null;
}): Promise<GenerateImageResult> {
  return postJson<GenerateImageResult>(IMAGE_WEBHOOK, {
    orgId: input.orgId,
    prompt: input.prompt,
    parentGenerationId: input.parentGenerationId,
  });
}

// ---------------------------------------------------------------------------
// NOT YET BUILT — stubs. Do not call a real API for these.
// ---------------------------------------------------------------------------

/**
 * Build a caption from the uploaded image.
 * TODO(backend): vision-caption-post — POST /webhook/vision-caption-post
 *   body: { orgId, mediaUrl } -> { caption: string }
 */
export async function visionCaptionStub(_input: {
  orgId: string;
  mediaUrl: string;
}): Promise<{ caption: string }> {
  void _input;
  throw new PostFeatureUnavailableError("Caption from image");
}

/**
 * Enhance an existing caption.
 * TODO(backend): enhance-caption — POST /webhook/enhance-caption
 *   body: { orgId, existingCaption } -> { enhancedCaption: string }
 */
export async function enhanceCaptionStub(_input: {
  orgId: string;
  existingCaption: string;
}): Promise<{ enhancedCaption: string }> {
  void _input;
  throw new PostFeatureUnavailableError("Caption enhance");
}

/**
 * Edit / regenerate from an existing AI image (image-to-image with reference).
 * TODO(backend): extend generate-post-image with `editOf` (generation id) and
 *   `editInstruction`; today the webhook only does fresh text-to-image.
 */
export async function editImageStub(_input: {
  orgId: string;
  editOf: string;
  editInstruction: string;
}): Promise<GenerateImageResult> {
  void _input;
  throw new PostFeatureUnavailableError("Image edit");
}
