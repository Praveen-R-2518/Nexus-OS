import "server-only";

import OpenAI, { toFile } from "openai";
import { POST_PLATFORMS, PLATFORM_LABELS } from "./types";
import type { Platform, PlatformCaption, PostCaptions } from "./types";

/**
 * Server-only OpenAI helpers for the Post unit.
 *
 * Everything the Posts feature needs from a model lives here: per-platform caption
 * generation (with optional image vision), single-caption enhancement, a caption
 * written from an image, and text-to-image / reference-guided image generation.
 *
 * All functions throw {@link OpenAINotConfiguredError} when `OPENAI_API_KEY` is
 * unset so routes can surface a single honest 503 — nothing here is stubbed.
 */

const DEFAULT_TEXT_MODEL = "gpt-4o";
const DEFAULT_IMAGE_MODEL = "gpt-image-1";

export class OpenAINotConfiguredError extends Error {
  constructor(feature: string) {
    super(`${feature} is not configured (OPENAI_API_KEY missing)`);
    this.name = "OpenAINotConfiguredError";
  }
}

export function isPostAiConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY?.trim();
}

function client(feature: string): { openai: OpenAI; textModel: string; imageModel: string } {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new OpenAINotConfiguredError(feature);
  return {
    openai: new OpenAI({ apiKey }),
    textModel: process.env.OPENAI_MODEL?.trim() || DEFAULT_TEXT_MODEL,
    imageModel: process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL,
  };
}

function normalizeCaption(raw: unknown): PlatformCaption | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { caption?: unknown; hashtags?: unknown };
  const caption = typeof obj.caption === "string" ? obj.caption.trim() : "";
  if (!caption) return null;
  const hashtags = Array.isArray(obj.hashtags)
    ? obj.hashtags
        .filter((h): h is string => typeof h === "string")
        .map((h) => h.replace(/^#/, "").trim())
        .filter(Boolean)
    : [];
  return { caption, hashtags };
}

/**
 * Generate a caption + hashtags per platform. When `imageDataUrl` is supplied the
 * model sees the image (vision) and grounds the copy in it.
 */
export async function generatePlatformCaptions(params: {
  userDescription: string;
  platforms: Platform[];
  imageDataUrl?: string | null;
}): Promise<PostCaptions> {
  const { openai, textModel } = client("Caption generation");
  const platforms = params.platforms.length ? params.platforms : [...POST_PLATFORMS];

  const system =
    "You are a senior social media copywriter. Write scroll-stopping, on-brand captions " +
    "tailored to each platform's norms (Instagram: warm, emoji-friendly; Facebook: " +
    "conversational; X: punchy and short; LinkedIn: professional, no emoji spam). " +
    "Return STRICT JSON only.";

  const shape = platforms
    .map((p) => `"${p}": { "caption": string, "hashtags": string[] }`)
    .join(", ");
  const instruction =
    `Post is about: "${params.userDescription}".\n` +
    `Write one caption per platform for: ${platforms.map((p) => PLATFORM_LABELS[p]).join(", ")}.\n` +
    `Hashtags are without the leading '#'. Respond as JSON: { ${shape} }.`;

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: instruction },
  ];
  if (params.imageDataUrl) {
    userContent.push({ type: "image_url", image_url: { url: params.imageDataUrl } });
  }

  const completion = await openai.chat.completions.create({
    model: textModel,
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
  });

  const text = completion.choices?.[0]?.message?.content?.trim() ?? "{}";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  const out: PostCaptions = {};
  for (const p of platforms) {
    const cap = normalizeCaption(parsed[p]);
    if (cap) out[p] = cap;
  }
  return out;
}

/** Rewrite/improve a single caption, keeping the user's intent and voice. */
export async function enhanceCaption(params: {
  caption: string;
  platform?: Platform | null;
}): Promise<string> {
  const { openai, textModel } = client("Caption enhancement");
  const platformHint = params.platform
    ? ` Optimize it for ${PLATFORM_LABELS[params.platform]}.`
    : "";
  const completion = await openai.chat.completions.create({
    model: textModel,
    temperature: 0.6,
    messages: [
      {
        role: "system",
        content:
          "You improve social media captions: sharper hook, clearer value, natural voice. " +
          "Keep it roughly the same length. Return only the improved caption text.",
      },
      { role: "user", content: `${params.caption}${platformHint}` },
    ],
  });
  return completion.choices?.[0]?.message?.content?.trim() ?? params.caption;
}

/** Write a caption from an image alone (vision). */
export async function captionFromImage(params: {
  imageDataUrl: string;
  hint?: string | null;
}): Promise<string> {
  const { openai, textModel } = client("Caption from image");
  const completion = await openai.chat.completions.create({
    model: textModel,
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content:
          "You are a social media copywriter. Look at the image and write one engaging, " +
          "ready-to-post caption. Return only the caption text.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: params.hint?.trim()
              ? `Context: ${params.hint.trim()}. Write a caption for this image.`
              : "Write a caption for this image.",
          },
          { type: "image_url", image_url: { url: params.imageDataUrl } },
        ],
      },
    ],
  });
  return completion.choices?.[0]?.message?.content?.trim() ?? "";
}

export interface GeneratedImage {
  /** Raw PNG bytes of the generated image. */
  buffer: Buffer;
  model: string;
  /** The (possibly model-rewritten) prompt actually used. */
  prompt: string;
}

/**
 * Generate an image from a prompt. When `reference` is supplied, use the image-edit
 * endpoint so the generation is guided by the brand asset (reference-guided).
 */
export async function generateImage(params: {
  prompt: string;
  reference?: { bytes: Buffer; filename: string } | null;
}): Promise<GeneratedImage> {
  const { openai, imageModel } = client("Image generation");

  let b64: string | undefined;
  if (params.reference) {
    const file = await toFile(params.reference.bytes, params.reference.filename, {
      type: "image/png",
    });
    const res = await openai.images.edit({
      model: imageModel,
      image: file,
      prompt: params.prompt,
      size: "1024x1024",
    });
    b64 = res.data?.[0]?.b64_json;
  } else {
    const res = await openai.images.generate({
      model: imageModel,
      prompt: params.prompt,
      size: "1024x1024",
    });
    b64 = res.data?.[0]?.b64_json;
  }

  if (!b64) throw new Error("Image generation returned no image");
  return { buffer: Buffer.from(b64, "base64"), model: imageModel, prompt: params.prompt };
}
