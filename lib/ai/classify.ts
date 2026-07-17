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

/** Matches `ai_prompts/classification_prompt.txt`'s required output shape. */
export type ClassificationResult = {
  intent_type: string;
  urgency: string;
  sentiment: string;
  customer_stage: string;
  lead_score: number;
  revenue_risk: string;
  summary: string;
  recommended_action: string;
  needs_human_approval: boolean;
  suggested_reply_angle: string;
  tags: string[];
  confidence: number;
};

export type ClassifyMessageParams = {
  message: string;
  customerName?: string;
  channel?: string;
  /** Optional prior turns / thread context to ground the classification. */
  conversationContext?: string;
  teamId: string;
  workspaceId?: string | null;
  supabase?: SupabaseClient;
};

export type ClassifyMessageResponse = {
  classification: ClassificationResult;
  model: string;
  source: "openai" | "mock";
};

const MOCK_CLASSIFICATION: ClassificationResult = {
  intent_type: "general",
  urgency: "low",
  sentiment: "neutral",
  customer_stage: "unknown",
  lead_score: 40,
  revenue_risk: "low",
  summary: "Mock classification fixture for CI/tests.",
  recommended_action: "Reply with a helpful, low-risk message.",
  needs_human_approval: false,
  suggested_reply_angle: "warm, brief acknowledgment",
  tags: ["mock"],
  confidence: 0.5,
};

function buildUserPayload(params: ClassifyMessageParams): string {
  const lines = [
    "Classify this single inbound customer message. Use only the message text for classification; the rest is context.",
    "",
    `customer_name: ${params.customerName ?? ""}`,
    `channel: ${params.channel ?? ""}`,
  ];
  if (params.conversationContext?.trim()) {
    lines.push("", "conversation_context:", params.conversationContext.trim());
  }
  lines.push("", "message:", params.message);
  return lines.join("\n");
}

function parseClassification(raw: string): ClassificationResult {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned) as Partial<ClassificationResult>;
  return {
    intent_type: String(parsed.intent_type ?? "general"),
    urgency: String(parsed.urgency ?? "low"),
    sentiment: String(parsed.sentiment ?? "neutral"),
    customer_stage: String(parsed.customer_stage ?? "unknown"),
    lead_score: Number(parsed.lead_score) || 0,
    revenue_risk: String(parsed.revenue_risk ?? "low"),
    summary: String(parsed.summary ?? ""),
    recommended_action: String(parsed.recommended_action ?? ""),
    needs_human_approval: Boolean(parsed.needs_human_approval),
    suggested_reply_angle: String(parsed.suggested_reply_angle ?? ""),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
  };
}

/**
 * Classify a single inbound customer message (intent, urgency, revenue risk, lead score, …)
 * using `ai_prompts/classification_prompt.txt`. Throws `AiNotConfiguredError` when no key is
 * configured — callers (routes) turn that into a 503 `ai_not_configured`.
 */
export async function classifyMessage(
  params: ClassifyMessageParams,
): Promise<ClassifyMessageResponse> {
  const model = AI_MODELS.CLASSIFY;

  if (isMockMode()) {
    return { classification: MOCK_CLASSIFICATION, model, source: "mock" };
  }

  const client = getOpenAiClient();
  if (!client) throw new AiNotConfiguredError();

  const system = loadPrompt("classification_prompt.txt");
  const user = buildUserPayload(params);

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const text = completion.choices?.[0]?.message?.content;
  if (!text) throw new Error("classifyMessage: empty model response");
  const classification = parseClassification(text);

  if (params.supabase) {
    const { inputTokens, outputTokens } = extractTokenUsage(completion.usage);
    await recordAiUsage(params.supabase, {
      teamId: params.teamId,
      workspaceId: params.workspaceId,
      model,
      operation: "classify",
      inputTokens,
      outputTokens,
    });
  }

  return { classification, model, source: "openai" };
}
