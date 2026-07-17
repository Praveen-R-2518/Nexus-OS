import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiOrgContext,
} from "@/lib/api-security";
import { enhanceCaption, OpenAINotConfiguredError } from "@/lib/posts/ai";
import { POST_PLATFORMS, type Platform } from "@/lib/posts/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Rewrite/improve a single caption with OpenAI. Returns `{ caption }`. */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:posts:enhance", 20, 60_000);
  if (limited) return limited;

  const org = await requireApiOrgContext();
  if (!org.ok) return org.response;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const caption = typeof body.caption === "string" ? body.caption.trim() : "";
  const platform =
    typeof body.platform === "string" &&
    (POST_PLATFORMS as readonly string[]).includes(body.platform)
      ? (body.platform as Platform)
      : null;

  if (!caption) return jsonError("caption is required", 400);

  try {
    const enhanced = await enhanceCaption({ caption, platform });
    return NextResponse.json({ caption: enhanced });
  } catch (e) {
    if (e instanceof OpenAINotConfiguredError) return jsonError(e.message, 503);
    console.error("[posts/enhance-caption]", e instanceof Error ? e.message : e);
    return jsonError("Caption enhancement failed", 502);
  }
}
