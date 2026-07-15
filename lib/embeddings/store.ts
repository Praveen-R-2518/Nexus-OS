import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { embedBatch, embedText } from "./openai";

/**
 * Knowledge-layer store operations over the single `embeddings` table (tagged by `kind`).
 * Every write is tenant-scoped by team_id and relies on RLS (embeddings_*_team policies).
 * Retrieval goes through the match_embeddings RPC (cosine similarity, RLS-respecting).
 *
 * All reads/writes are best-effort at the call site: a chat turn must never fail because
 * retrieval or a summary write threw. See the try/catch guards in the callers.
 */

export type EmbeddingKind = "business_doc" | "conversation" | "summary";

export type KnowledgeChunk = {
  content: string;
  kind: EmbeddingKind;
  similarity: number;
};

const DEFAULT_CHUNK_CHARS = 1500;
const DEFAULT_CHUNK_OVERLAP = 200;

/**
 * Retrieval quality floor: cosine similarity below this is noise, not knowledge.
 * Without it, sparse tenants get whatever weak matches exist injected into the
 * prompt. Tunable via RAG_MIN_SIMILARITY (0..1).
 */
const DEFAULT_MIN_SIMILARITY = 0.25;

/**
 * Per-kind re-rank weights: the founder's own documents are the most authoritative
 * grounding, prior summaries next, individual inbox messages last. Applied as a
 * multiplier on cosine similarity when ordering the overfetched candidate set.
 */
const KIND_WEIGHTS: Record<EmbeddingKind, number> = {
  business_doc: 1.0,
  summary: 0.95,
  conversation: 0.9,
};

function minSimilarity(): number {
  const raw = Number.parseFloat(process.env.RAG_MIN_SIMILARITY ?? "");
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : DEFAULT_MIN_SIMILARITY;
}

/** pgvector text format is `[a,b,c]`, which JSON.stringify already produces for a number[]. */
function toVectorLiteral(vector: number[]): string {
  return JSON.stringify(vector);
}

/**
 * Split text into overlapping character windows, preferring to break on paragraph/sentence
 * boundaries so chunks stay coherent. Deterministic and dependency-free.
 */
export function chunkText(
  text: string,
  opts: { maxChars?: number; overlap?: number } = {},
): string[] {
  const maxChars = Math.max(opts.maxChars ?? DEFAULT_CHUNK_CHARS, 200);
  const overlap = Math.min(Math.max(opts.overlap ?? DEFAULT_CHUNK_OVERLAP, 0), maxChars - 1);

  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];
  if (normalized.length <= maxChars) return [normalized];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + maxChars, normalized.length);
    if (end < normalized.length) {
      // Prefer a clean break: paragraph, then sentence, then whitespace.
      const window = normalized.slice(start, end);
      const para = window.lastIndexOf("\n\n");
      const sentence = window.lastIndexOf(". ");
      const space = window.lastIndexOf(" ");
      const breakAt = para > maxChars * 0.5 ? para : sentence > maxChars * 0.5 ? sentence + 1 : space > maxChars * 0.5 ? space : -1;
      if (breakAt > 0) end = start + breakAt;
    }
    const piece = normalized.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

/**
 * Chunk + embed a document's text and insert one `business_doc` embedding row per chunk.
 * Returns the number of chunks stored. Throws on embed/insert failure so the upload route
 * can mark the document `failed`.
 */
export async function upsertDocEmbeddings(params: {
  supabase: SupabaseClient;
  teamId: string;
  workspaceId: string | null;
  sourceId: string;
  fileName: string;
  text: string;
}): Promise<number> {
  const { supabase, teamId, workspaceId, sourceId, fileName, text } = params;
  const chunks = chunkText(text);
  if (chunks.length === 0) return 0;

  const vectors = await embedBatch(chunks);
  const rows = chunks.map((content, i) => ({
    team_id: teamId,
    workspace_id: workspaceId,
    kind: "business_doc" as const,
    source_id: sourceId,
    content,
    metadata: { file_name: fileName, chunk_index: i },
    embedding: toVectorLiteral(vectors[i]),
  }));

  const { error } = await supabase.from("embeddings").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

/** Remove every embedding row that belongs to a given source (document / session / conversation). */
export async function deleteEmbeddingsForSource(params: {
  supabase: SupabaseClient;
  teamId: string;
  sourceId: string;
}): Promise<void> {
  const { supabase, teamId, sourceId } = params;
  await supabase
    .from("embeddings")
    .delete()
    .eq("team_id", teamId)
    .eq("source_id", sourceId);
}

/**
 * Retrieve the most relevant knowledge chunks for a query string. Embeds the query, then calls
 * the match_embeddings RPC. Returns [] on any failure or when the RPC isn't available (keeps the
 * chat resilient and the fake test client working).
 */
export async function matchKnowledge(params: {
  supabase: SupabaseClient;
  teamId: string;
  queryText: string;
  kinds?: EmbeddingKind[];
  limit?: number;
}): Promise<KnowledgeChunk[]> {
  const { supabase, teamId, queryText } = params;
  const kinds = params.kinds ?? ["business_doc", "summary", "conversation"];
  const limit = params.limit ?? 6;

  if (typeof (supabase as { rpc?: unknown }).rpc !== "function") return [];
  const trimmed = queryText.trim();
  if (!trimmed) return [];

  try {
    const queryEmbedding = await embedText(trimmed);
    // Overfetch 2× so the threshold + kind re-rank still have `limit` good rows to pick from.
    const { data, error } = await supabase.rpc("match_embeddings", {
      p_team_id: teamId,
      p_kinds: kinds,
      p_query: toVectorLiteral(queryEmbedding),
      p_match_count: limit * 2,
    });
    if (error || !Array.isArray(data)) return [];
    const floor = minSimilarity();
    return (data as { content: string; kind: EmbeddingKind; similarity: number }[])
      .map((r) => ({
        content: r.content,
        kind: r.kind,
        similarity: typeof r.similarity === "number" ? r.similarity : 0,
      }))
      .filter((r) => r.similarity >= floor)
      .sort(
        (a, b) =>
          b.similarity * (KIND_WEIGHTS[b.kind] ?? 1) -
          a.similarity * (KIND_WEIGHTS[a.kind] ?? 1),
      )
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Replace the single rolling `summary` embedding for a source (e.g. a chat session).
 * Deletes any prior summary for that source, then inserts the new one. Best-effort.
 */
export async function upsertSummaryEmbedding(params: {
  supabase: SupabaseClient;
  teamId: string;
  workspaceId: string | null;
  sourceId: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { supabase, teamId, workspaceId, sourceId, content, metadata } = params;
  const trimmed = content.trim();
  if (!trimmed) return;
  try {
    const embedding = await embedText(trimmed);
    await deleteSummaryForSource({ supabase, teamId, sourceId });
    await supabase.from("embeddings").insert({
      team_id: teamId,
      workspace_id: workspaceId,
      kind: "summary",
      source_id: sourceId,
      content: trimmed,
      metadata: metadata ?? {},
      embedding: toVectorLiteral(embedding),
    });
  } catch {
    /* best-effort: never break the caller */
  }
}

async function deleteSummaryForSource(params: {
  supabase: SupabaseClient;
  teamId: string;
  sourceId: string;
}): Promise<void> {
  const { supabase, teamId, sourceId } = params;
  await supabase
    .from("embeddings")
    .delete()
    .eq("team_id", teamId)
    .eq("kind", "summary")
    .eq("source_id", sourceId);
}

/**
 * Embed a short summary of an inbound customer message so the analyst can retrieve it
 * semantically. Best-effort; a failure never blocks conversation ingest.
 */
export async function upsertConversationEmbedding(params: {
  supabase: SupabaseClient;
  teamId: string;
  workspaceId: string | null;
  sourceId: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { supabase, teamId, workspaceId, sourceId, content, metadata } = params;
  const trimmed = content.trim();
  if (!trimmed) return;
  try {
    const embedding = await embedText(trimmed);
    await supabase.from("embeddings").insert({
      team_id: teamId,
      workspace_id: workspaceId,
      kind: "conversation",
      source_id: sourceId,
      content: trimmed.slice(0, 2000),
      metadata: metadata ?? {},
      embedding: toVectorLiteral(embedding),
    });
  } catch {
    /* best-effort */
  }
}
