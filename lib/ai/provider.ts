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

/**
 * Central model names — change once here, not per call site. Each workload is overridable by
 * env so a hosted-provider swap (e.g. Azure OpenAI, where these are deployment names) is pure
 * config. The specific vars deliberately do NOT fall back to the generic `OPENAI_MODEL` —
 * tuning chat must never silently change classification.
 */
export const AI_MODELS = {
  CLASSIFY: process.env.OPENAI_MODEL_CLASSIFY?.trim() || "gpt-4o-mini",
  DRAFT: process.env.OPENAI_MODEL_DRAFT?.trim() || "gpt-4o",
  REPORT: process.env.OPENAI_MODEL_REPORT?.trim() || "gpt-4o-mini",
  CHAT: process.env.OPENAI_MODEL?.trim() || "gpt-4o",
  EMBED: process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small",
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
  const key = resolveGlobalApiKey()?.toLowerCase();
  return key === "mock";
}

/** Primary chat/classify key — accepts common Azure aliases so hosting panels that use AZURE_* still work. */
function resolveGlobalApiKey(): string | undefined {
  return (
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.AZURE_OPENAI_API_KEY?.trim() ||
    process.env.AZURE_API_KEY?.trim() ||
    undefined
  );
}

/** Normalizes Azure resource URLs to the OpenAI-compatible `/openai/v1` surface. */
function normalizeOpenAiCompatibleBaseUrl(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes(".openai.azure.com") && !trimmed.includes("/openai/")) {
    return `${trimmed.replace(/\/$/, "")}/openai/v1`;
  }
  return trimmed;
}

function resolveGlobalBaseUrl(): string | undefined {
  const raw =
    process.env.OPENAI_BASE_URL?.trim() || process.env.AZURE_OPENAI_ENDPOINT?.trim();
  return normalizeOpenAiCompatibleBaseUrl(raw);
}

/** True when a real (or mock) OpenAI key is configured — the gate every AI route/function checks first. */
export function isOpenAiConfigured(): boolean {
  const mock = isMockMode();
  const apiKey = resolveGlobalApiKey();
  const configured = mock || !!apiKey;
  // #region agent log
  fetch("http://127.0.0.1:7718/ingest/82f32985-4bff-4337-b714-72c7f9526288", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "23c246" },
    body: JSON.stringify({
      sessionId: "23c246",
      runId: "post-fix",
      hypothesisId: "A,B,C,D",
      location: "lib/ai/provider.ts:isOpenAiConfigured",
      message: "AI config gate evaluated",
      data: {
        configured,
        mock,
        resolvedKeyLen: apiKey?.length ?? 0,
        resolvedKeyIsMock: apiKey?.toLowerCase() === "mock",
        openAiKeyLen: process.env.OPENAI_API_KEY?.trim().length ?? 0,
        azureOpenAiKeyLen: process.env.AZURE_OPENAI_API_KEY?.trim().length ?? 0,
        aiProvider: process.env.AI_PROVIDER?.trim() || null,
        hasResolvedBaseUrl: !!resolveGlobalBaseUrl(),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  if (mock) return true;
  return !!apiKey;
}

/**
 * Which API surface a client is for. Lets embeddings/images point at a different provider than
 * chat completions — needed when the primary base URL is an Azure OpenAI resource that has chat
 * deployments but no embedding/image deployments. `OPENAI_EMBED_API_KEY`/`OPENAI_IMAGE_API_KEY`
 * (with optional `..._BASE_URL`) route that purpose elsewhere; unset means the purpose uses the
 * global `OPENAI_API_KEY`/`OPENAI_BASE_URL` pair, exactly as before.
 */
export type ClientPurpose = "chat" | "embed" | "image";

const clientCache = new Map<string, OpenAI>();

function resolveClientConfig(purpose: ClientPurpose): {
  apiKey: string | undefined;
  baseURL: string | undefined;
} {
  const overrideKey =
    purpose === "embed"
      ? process.env.OPENAI_EMBED_API_KEY?.trim()
      : purpose === "image"
        ? process.env.OPENAI_IMAGE_API_KEY?.trim()
        : undefined;
  if (overrideKey) {
    // The override pair is atomic: an override key WITHOUT an override base URL means plain
    // api.openai.com — it never inherits the global OPENAI_BASE_URL.
    const overrideBase =
      purpose === "embed"
        ? process.env.OPENAI_EMBED_BASE_URL?.trim()
        : process.env.OPENAI_IMAGE_BASE_URL?.trim();
    return { apiKey: overrideKey, baseURL: overrideBase || undefined };
  }
  return {
    apiKey: resolveGlobalApiKey(),
    baseURL: resolveGlobalBaseUrl(),
  };
}

/**
 * Returns a shared OpenAI client, or `null` when no key is configured (mock mode never needs a
 * client — callers should check `isMockMode()` first and short-circuit before calling this).
 * Never throws for a missing key; routes/functions decide whether that's a 503 or a fallback.
 *
 * `OPENAI_BASE_URL` points the client at an OpenAI-compatible endpoint (e.g. an Azure OpenAI
 * resource's `/openai/v1` surface, which accepts standard Bearer auth); unset means
 * api.openai.com. Clients are cached per (baseURL, key) pair.
 */
export function getOpenAiClient(purpose: ClientPurpose = "chat"): OpenAI | null {
  const { apiKey, baseURL } = resolveClientConfig(purpose);
  if (!apiKey || apiKey.toLowerCase() === "mock") return null;
  const cacheKey = `${baseURL ?? "default"}|${apiKey}`;
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;
  const client = new OpenAI({ apiKey, baseURL });
  clientCache.set(cacheKey, client);
  return client;
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
