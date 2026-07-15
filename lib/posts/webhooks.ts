"use client";

import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import type { Platform, SocialPost } from "./types";

/**
 * AI helpers for the Post unit.
 *
 * These call server-side proxy routes (`app/api/posts/*`) which resolve the
 * caller's organization_id from their own `user_profiles` row and forward to
 * n8n using server-only env vars. The browser never supplies an org id and
 * never sees an n8n URL (2026-07-15 security review, item 3).
 *
 * The three AI helpers below (vision caption, caption enhance, image edit) are
 * NOT built yet — they throw {@link PostFeatureUnavailableError} so the UI can
 * surface a "Not available yet" affordance instead of hitting a guessed URL.
 */

/** Thrown by the not-yet-built AI helpers so callers can show a clear toast. */
export class PostFeatureUnavailableError extends Error {
  constructor(feature: string) {
    super(`${feature} isn't available yet.`);
    this.name = "PostFeatureUnavailableError";
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await authenticatedFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: string };
      detail = j.error ?? "";
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
 * The backend ALSO writes the `social_posts` draft row itself, so the caller
 * does not insert separately — it returns the created row (status `draft`).
 */
export async function generateCaptions(input: {
  mediaUrl: string;
  userDescription: string;
  platforms: Platform[];
}): Promise<SocialPost> {
  return postJson<SocialPost>("/api/posts/generate-captions", {
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
 * Server-side caps: 5/min per caller and a per-organization daily quota.
 *
 * Pass the current generation's id as `parentGenerationId` to regenerate a
 * variant (this builds the undo chain server-side); pass null for a fresh one.
 */
export async function generatePostImage(input: {
  prompt: string;
  parentGenerationId: string | null;
}): Promise<GenerateImageResult> {
  return postJson<GenerateImageResult>("/api/posts/generate-image", {
    prompt: input.prompt,
    parentGenerationId: input.parentGenerationId,
  });
}

// ---------------------------------------------------------------------------
// NOT YET BUILT — stubs. Do not call a real API for these.
// ---------------------------------------------------------------------------

/**
 * Build a caption from the uploaded image.
 * TODO(backend): vision-caption-post — server proxy route + n8n workflow
 *   body: { mediaUrl } -> { caption: string }
 */
export async function visionCaptionStub(_input: {
  mediaUrl: string;
}): Promise<{ caption: string }> {
  void _input;
  throw new PostFeatureUnavailableError("Caption from image");
}

/**
 * Enhance an existing caption.
 * TODO(backend): enhance-caption — server proxy route + n8n workflow
 *   body: { existingCaption } -> { enhancedCaption: string }
 */
export async function enhanceCaptionStub(_input: {
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
  editOf: string;
  editInstruction: string;
}): Promise<GenerateImageResult> {
  void _input;
  throw new PostFeatureUnavailableError("Image edit");
}
