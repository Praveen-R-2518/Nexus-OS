import { NextResponse } from "next/server";
import {
  AI_NOT_CONFIGURED_BODY,
  isOpenAiConfigured,
} from "@/lib/ai/provider";
import { classifyMessage } from "@/lib/ai/classify";
import {
  JSON_LIMITS,
  rateLimitDurable,
  readJsonObjectWithLimit,
  requireN8nToken,
} from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";
import { parseWorkspaceId } from "@/lib/workspace-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function boundedString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

/**
 * POST /api/internal/n8n/ai/classify — the ONLY place n8n reaches to classify an inbound
 * message. Body: `{ team_id, message, customer_name?, channel?, conversation_context?,
 * workspace_id? }` → the classification JSON from `ai_prompts/classification_prompt.txt`.
 *
 * Token-auth (N8N_INGEST_TOKEN); returns 503 `{ error: "ai_not_configured", code:
 * "ai_not_configured" }` when OPENAI_API_KEY is unset — n8n must never call OpenAI directly.
 */
export async function POST(request: Request) {
  const limited = await rateLimitDurable(request, "api:internal:n8n:ai:classify", 240, 60_000);
  if (limited) return limited;

  const unauthorized = requireN8nToken(request);
  if (unauthorized) return unauthorized;

  if (!isOpenAiConfigured()) {
    return NextResponse.json(AI_NOT_CONFIGURED_BODY, { status: 503 });
  }

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.medium);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const teamId = parseWorkspaceId(body.team_id);
  if (!teamId) {
    return NextResponse.json(
      { error: "team_id is required and must be a valid UUID" },
      { status: 400 },
    );
  }

  const message = boundedString(body.message, 8000);
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const workspaceId = parseWorkspaceId(body.workspace_id);
  const customerName = boundedString(body.customer_name, 200) || undefined;
  const channel = boundedString(body.channel, 60) || undefined;
  const conversationContext =
    boundedString(body.conversation_context, 8000) || undefined;

  const supabase = createServerClient();

  try {
    const { classification, model, source } = await classifyMessage({
      message,
      customerName,
      channel,
      conversationContext,
      teamId,
      workspaceId,
      supabase,
    });
    return NextResponse.json({ classification, model, source, ...classification });
  } catch (err) {
    if (err instanceof Error && err.name === "AiNotConfiguredError") {
      return NextResponse.json(AI_NOT_CONFIGURED_BODY, { status: 503 });
    }
    console.error("[internal n8n ai/classify] error:", err);
    return NextResponse.json({ error: "Classification failed" }, { status: 502 });
  }
}
