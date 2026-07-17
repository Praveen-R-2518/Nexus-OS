"use client";

import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import type { Platform, PostCaptions } from "./types";

/**
 * Client for the Post unit's server AI + publish routes (`app/api/posts/*`).
 *
 * Every call resolves the caller's organization_id server-side. AI runs in-app on
 * OpenAI, gated only on `OPENAI_API_KEY`; publishing is proxied to n8n (WF8b). When
 * a capability's key/webhook is unset the route returns a 503 whose message is
 * surfaced verbatim — nothing here is stubbed.
 */

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

/** Generate per-platform captions from the description (and image, if present). */
export async function generateCaptions(input: {
  mediaUrl: string;
  userDescription: string;
  platforms: Platform[];
}): Promise<{ captions: PostCaptions }> {
  return postJson("/api/posts/generate-captions", input);
}

/** Improve a single caption. */
export async function enhanceCaption(input: {
  caption: string;
  platform?: Platform | null;
}): Promise<{ caption: string }> {
  return postJson("/api/posts/enhance-caption", input);
}

/** Write a caption from the uploaded image. */
export async function visionCaption(input: {
  mediaUrl: string;
  hint?: string | null;
}): Promise<{ caption: string }> {
  return postJson("/api/posts/vision-caption", input);
}

export interface GenerateImageResult {
  generation_id: string;
  /** Storage path within `post-media`, e.g. `org_id/filename.png`. */
  image_path: string;
  /** Signed URL valid ~24h — use immediately, re-sign for later display. */
  signed_url: string | null;
  enhanced_prompt: string;
}

/**
 * AI image generation. Pass `parentGenerationId` to build the undo chain, and
 * `referenceAssetPath` (a brand asset storage path) for reference-guided output.
 */
export async function generatePostImage(input: {
  prompt: string;
  parentGenerationId: string | null;
  referenceAssetPath?: string | null;
}): Promise<GenerateImageResult> {
  return postJson("/api/posts/generate-image", input);
}

/** Edit an existing generation with a text instruction (image-to-image). */
export async function editImage(input: {
  editOf: string;
  editInstruction: string;
}): Promise<GenerateImageResult> {
  return postJson("/api/posts/edit-image", input);
}

/** Publish a post now (triggers WF8b). Returns the transient publishing state. */
export async function publishPost(input: {
  postId: string;
}): Promise<{ ok: true; status: "publishing" }> {
  return postJson("/api/posts/publish", input);
}
