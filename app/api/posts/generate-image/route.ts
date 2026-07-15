import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  rateLimitDurable,
  readJsonObjectWithLimit,
  requireApiOrgContext,
} from "@/lib/api-security";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Per-organization image generations per day (~$0.04/call cost guardrail). */
const DAILY_ORG_IMAGE_LIMIT = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

function imageWebhookUrl(): string | null {
  const direct = process.env.N8N_GENERATE_POST_IMAGE_WEBHOOK_URL?.trim();
  if (direct) return direct;
  const base = process.env.N8N_WEBHOOK_BASE_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/webhook/generate-post-image`;
}

/**
 * Server-side proxy for the n8n image-generation webhook (gpt-image-1). Org id is
 * derived server-side; the paid call is capped per-IP per-minute and per-org per-day
 * (durable counter, survives redeploys).
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

  if (!prompt) {
    return jsonError("prompt is required", 400);
  }

  const webhookUrl = imageWebhookUrl();
  if (!webhookUrl) {
    return jsonError("Image generation is not configured", 503);
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orgId: org.organizationId,
        prompt,
        parentGenerationId,
      }),
    });
    if (!res.ok) {
      console.error(`[posts/generate-image] n8n responded ${res.status}`);
      return jsonError("Image generation failed", 502);
    }
    const json = (await res.json()) as unknown;
    return NextResponse.json(json);
  } catch (e) {
    console.error(
      "[posts/generate-image] webhook error:",
      e instanceof Error ? e.message : e,
    );
    return jsonError("Image generation failed", 502);
  }
}
