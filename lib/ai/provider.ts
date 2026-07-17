import "server-only";

import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Single hosting point for the OpenAI integration (Nexus OS "centralize AI" task).
 *
 * Nothing outside `lib/ai/*` (and the thin back-compat wrappers in `lib/chat/openai.ts` /
 * `lib/embeddings/openai.ts`) should read `process.env.OPENAI_API_KEY` or import the `openai`
 * package directly. n8n never sees this key — it calls the typed `/api/internal/n8n/ai/*`
 * routes, which call into `lib/ai/*`.
 */

/** Central model names — change once here, not per call site. */
export const AI_MODELS = {
  CLASSIFY: "gpt-4o-mini",
  DRAFT: "gpt-4o",
  REPORT: "gpt-4o-mini",
  CHAT: "gpt-4o",
  EMBED: "text-embedding-3-small",
  CAPTION: "gpt-4o-mini",
  IMAGE: "dall-e-3",
} as const;

export type AiOperation =
  | "classify"
  | "draft"
  | "report_summary"
  | "chat"
  | "embed"
  | "caption"
  | "image"
  | "enhance_persona";

/** `AI_PROVIDER=mock` or `OPENAI_API_KEY=mock` — deterministic fixtures, no network call. Used in CI/tests. */
export function isMockMode(): boolean {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (provider === "mock") return true;
  const key = process.env.OPENAI_API_KEY?.trim().toLowerCase();
  return key === "mock";
}

/** True when a real (or mock) OpenAI key is configured — the gate every AI route/function checks first. */
export function isOpenAiConfigured(): boolean {
  if (isMockMode()) return true;
  return !!process.env.OPENAI_API_KEY?.trim();
}

let cachedClient: OpenAI | null = null;
let cachedKey: string | null = null;

/**
 * Returns a shared OpenAI client, or `null` when no key is configured (mock mode never needs a
 * client — callers should check `isMockMode()` first and short-circuit before calling this).
 * Never throws for a missing key; routes/functions decide whether that's a 503 or a fallback.
 */
export function getOpenAiClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || apiKey.toLowerCase() === "mock") return null;
  if (cachedClient && cachedKey === apiKey) return cachedClient;
  cachedClient = new OpenAI({ apiKey });
  cachedKey = apiKey;
  return cachedClient;
}

/** Thrown by callers that require a real client and got none — routes catch this and return 503. */
export class AiNotConfiguredError extends Error {
  code = "ai_not_configured" as const;
  constructor(message = "OPENAI_API_KEY is not set") {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

/** Standard 503 body shape every internal AI route returns when the key is missing. */
export const AI_NOT_CONFIGURED_BODY = {
  error: "ai_not_configured",
  code: "ai_not_configured",
} as const;

export type RecordAiUsageParams = {
  teamId: string;
  workspaceId?: string | null;
  model: string;
  operation: AiOperation | string;
  inputTokens?: number | null;
  outputTokens?: number | null;
};

/**
 * Best-effort AI cost/usage recorder. Inserts into `public.ai_usage` (migration
 * `20260714190000_ai_usage.sql`) when the table/columns exist; swallows any error so a usage
 * logging failure never breaks a classify/draft/report call. `operation` is stored in the
 * existing `workflow_name` column (kept for backward compatibility with pre-existing rows).
 */
export async function recordAiUsage(
  supabase: SupabaseClient,
  params: RecordAiUsageParams,
): Promise<void> {
  try {
    await supabase.from("ai_usage").insert({
      team_id: params.teamId,
      workflow_name: params.operation,
      model: params.model,
      input_tokens: params.inputTokens ?? null,
      output_tokens: params.outputTokens ?? null,
    });
  } catch {
    /* best-effort: never let usage logging break the caller */
  }
}

/** Extracts `{ input, output }` token counts from an OpenAI chat/completions usage object. */
export function extractTokenUsage(usage: unknown): {
  inputTokens: number | null;
  outputTokens: number | null;
} {
  if (!usage || typeof usage !== "object") return { inputTokens: null, outputTokens: null };
  const u = usage as Record<string, unknown>;
  const input = u.prompt_tokens ?? u.input_tokens;
  const output = u.completion_tokens ?? u.output_tokens;
  return {
    inputTokens: typeof input === "number" ? input : null,
    outputTokens: typeof output === "number" ? output : null,
  };
}
