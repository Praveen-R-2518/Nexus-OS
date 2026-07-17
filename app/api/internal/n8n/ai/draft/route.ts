import { NextResponse } from "next/server";
import { AI_NOT_CONFIGURED_BODY, isOpenAiConfigured } from "@/lib/ai/provider";
import { draftReply, type SimilarContextChunk } from "@/lib/ai/draft";
import {
  JSON_LIMITS,
  rateLimitDurable,
  readJsonObjectWithLimit,
  requireN8nToken,
} from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";
import { matchKnowledge } from "@/lib/embeddings/store";
import { parseWorkspaceId } from "@/lib/workspace-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function boundedString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeClassification(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { raw };
    }
  }
  if (typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

/**
 * POST /api/internal/n8n/ai/draft — the ONLY place n8n reaches to draft a customer reply.
 * Body: `{ team_id, original_message, classification?, customer_name?, channel?,
 * workspace_id?, similar_context? }` → `{ draft_text, ...rest of ai_prompts/reply_generation_prompt.txt fields }`.
 *
 * When `similar_context` isn't supplied, retrieves it server-side via the same pgvector
 * `matchKnowledge` path the analyst chat uses — n8n no longer needs a separate round trip to
 * `/api/internal/n8n/match-embeddings` for this. Token-auth (N8N_INGEST_TOKEN); returns 503
 * `ai_not_configured` when OPENAI_API_KEY is unset.
 */
export async function POST(request: Request) {
  const limited = await rateLimitDurable(request, "api:internal:n8n:ai:draft", 240, 60_000);
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

  const originalMessage = boundedString(body.original_message ?? body.message, 8000);
  if (!originalMessage) {
    return NextResponse.json({ error: "original_message is required" }, { status: 400 });
  }

  const workspaceId = parseWorkspaceId(body.workspace_id);
  const customerName = boundedString(body.customer_name, 200) || undefined;
  const channel = boundedString(body.channel, 60) || undefined;
  const classification = normalizeClassification(body.classification ?? body.classification_result);

  const supabase = createServerClient();

  let similarContext: SimilarContextChunk[] | undefined = Array.isArray(body.similar_context)
    ? (body.similar_context as unknown[])
        .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
        .map((c) => ({ kind: String(c.kind ?? "context"), content: String(c.content ?? "") }))
    : undefined;

  if (!similarContext) {
    try {
      const chunks = await matchKnowledge({ supabase, teamId, queryText: originalMessage, limit: 4 });
      similarContext = chunks.map((c) => ({ kind: c.kind, content: c.content }));
    } catch {
      similarContext = [];
    }
  }

  try {
    const { draft, model, source } = await draftReply({
      customerName,
      channel,
      originalMessage,
      classification,
      similarContext,
      teamId,
      workspaceId,
      supabase,
    });
    return NextResponse.json({
      draft_text: draft.reply_text,
      model,
      source,
      similar_context_count: similarContext.length,
      ...draft,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AiNotConfiguredError") {
      return NextResponse.json(AI_NOT_CONFIGURED_BODY, { status: 503 });
    }
    console.error("[internal n8n ai/draft] error:", err);
    return NextResponse.json({ error: "Draft generation failed" }, { status: 502 });
  }
}
