import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPrompt } from "./prompts";
import {
  AI_MODELS,
  AiNotConfiguredError,
  extractTokenUsage,
  getOpenAiClient,
  isMockMode,
  recordAiUsage,
} from "./provider";

/** Matches `ai_prompts/reply_generation_prompt.txt`'s required output shape. */
export type ReplyDraftResult = {
  reply_text: string;
  approval_required: boolean;
  approval_reason: string;
  tone: string;
  next_step: string;
  follow_up_needed: boolean;
  follow_up_delay_minutes: number;
};

export type SimilarContextChunk = { kind: string; content: string };

export type DraftReplyParams = {
  customerName?: string;
  channel?: string;
  originalMessage: string;
  /** Classification result (or raw object) from `classifyMessage` — used for tone/approval hints. */
  classification?: Record<string, unknown> | null;
  similarContext?: SimilarContextChunk[];
  teamId: string;
  workspaceId?: string | null;
  supabase?: SupabaseClient;
};

export type DraftReplyResponse = {
  draft: ReplyDraftResult;
  model: string;
  source: "openai" | "mock";
};

const MOCK_DRAFT: ReplyDraftResult = {
  reply_text: "Thanks for reaching out — we'll get back to you shortly.\n\nTeam Nexus OS",
  approval_required: true,
  approval_reason: "Mock draft fixture for CI/tests.",
  tone: "warm",
  next_step: "Review and send.",
  follow_up_needed: false,
  follow_up_delay_minutes: 0,
};

function buildUserPayload(params: DraftReplyParams): string {
  const lines = [
    "Generate the reply draft JSON per your instructions.",
    "",
    `customer_name: ${params.customerName ?? ""}`,
    `channel: ${params.channel ?? ""}`,
    "",
    "original_message:",
    params.originalMessage,
    "",
    "classification_result (use for tone and approval flags; do not paste into reply_text):",
    JSON.stringify(params.classification ?? {}, null, 2),
  ];
  if (params.similarContext && params.similarContext.length > 0) {
    lines.push(
      "",
      "similar_past_context (retrieved from this business's own knowledge base — ground tone,",
      "pricing, and policy on it; NEVER copy it verbatim into reply_text and never invent facts",
      "beyond it):",
    );
    params.similarContext.forEach((c, i) => {
      lines.push(`[${i + 1}] (${c.kind}) ${c.content.slice(0, 800)}`);
    });
  }
  return lines.join("\n");
}

function parseDraft(raw: string): ReplyDraftResult {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned) as Partial<ReplyDraftResult>;
  return {
    reply_text: String(parsed.reply_text ?? ""),
    approval_required: parsed.approval_required !== false,
    approval_reason: String(parsed.approval_reason ?? "Safe to send"),
    tone: String(parsed.tone ?? ""),
    next_step: String(parsed.next_step ?? ""),
    follow_up_needed: Boolean(parsed.follow_up_needed),
    follow_up_delay_minutes: Math.max(0, Math.floor(Number(parsed.follow_up_delay_minutes) || 0)),
  };
}

/**
 * Draft a customer-facing reply using `ai_prompts/reply_generation_prompt.txt`. Throws
 * `AiNotConfiguredError` when no key is configured — callers (routes) turn that into a 503
 * `ai_not_configured`.
 */
export async function draftReply(params: DraftReplyParams): Promise<DraftReplyResponse> {
  const model = AI_MODELS.DRAFT;

  if (isMockMode()) {
    return { draft: MOCK_DRAFT, model, source: "mock" };
  }

  const client = getOpenAiClient();
  if (!client) throw new AiNotConfiguredError();

  const system = loadPrompt("reply_generation_prompt.txt");
  const user = buildUserPayload(params);

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const text = completion.choices?.[0]?.message?.content;
  if (!text) throw new Error("draftReply: empty model response");
  const draft = parseDraft(text);

  if (params.supabase) {
    const { inputTokens, outputTokens } = extractTokenUsage(completion.usage);
    await recordAiUsage(params.supabase, {
      teamId: params.teamId,
      workspaceId: params.workspaceId,
      model,
      operation: "draft",
      inputTokens,
      outputTokens,
    });
  }

  return { draft, model, source: "openai" };
}
