import "server-only";

import { AI_MODELS, AiNotConfiguredError, getOpenAiClient, isMockMode } from "@/lib/ai/provider";

/**
 * Server-only OpenAI embeddings wrapper for the knowledge layer (pgvector RAG). Thin wrapper
 * over `lib/ai/provider` — the OpenAI client and default embedding model are centralized there.
 * Model is text-embedding-3-small (1536 dims) to match the embeddings.embedding vector(1536)
 * column. In mock mode (`AI_PROVIDER=mock` / `OPENAI_API_KEY=mock`), returns deterministic
 * zero-ish vectors so ingest/retrieval tests never need a live key.
 */

function resolveModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL?.trim() || AI_MODELS.EMBED;
}

/** Deterministic 1536-dim fixture vector derived from the string's length — stable across runs. */
function mockVector(seed: string): number[] {
  const dims = 1536;
  const vec = new Array<number>(dims).fill(0);
  vec[seed.length % dims] = 1;
  return vec;
}

/** Embed a single string. Returns a 1536-dim vector. */
export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedBatch([text]);
  return vector;
}

/** Embed many strings in one request. Order of the result matches the input order. */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (isMockMode()) {
    return texts.map(mockVector);
  }

  const client = getOpenAiClient();
  if (!client) throw new AiNotConfiguredError();

  const model = resolveModel();
  const response = await client.embeddings.create({ model, input: texts });
  return response.data.map((d) => d.embedding as number[]);
}
