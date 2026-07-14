import "server-only";

import OpenAI from "openai";

/**
 * Server-only OpenAI embeddings wrapper for the knowledge layer (pgvector RAG).
 * Isolated behind one function so ingest/retrieval can be smoke-tested with a fake.
 * Model is text-embedding-3-small (1536 dims) to match the embeddings.embedding vector(1536) column.
 */

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

function resolveClient(): { client: OpenAI; model: string } {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  const model = process.env.OPENAI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
  return { client: new OpenAI({ apiKey }), model };
}

/** Embed a single string. Returns a 1536-dim vector. */
export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedBatch([text]);
  return vector;
}

/** Embed many strings in one request. Order of the result matches the input order. */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { client, model } = resolveClient();
  const response = await client.embeddings.create({ model, input: texts });
  return response.data.map((d) => d.embedding as number[]);
}
