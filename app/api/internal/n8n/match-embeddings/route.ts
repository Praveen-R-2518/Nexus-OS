import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimitDurable,
  readJsonObjectWithLimit,
  requireN8nToken,
} from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";
import { matchKnowledge, type EmbeddingKind } from "@/lib/embeddings/store";

export const dynamic = "force-dynamic";

const KINDS: readonly EmbeddingKind[] = ["business_doc", "summary", "conversation"];
const MAX_QUERY_LEN = 4000;
const MAX_LIMIT = 12;

/**
 * POST /api/internal/n8n/match-embeddings — token-auth retrieval for n8n workflows
 * (WF3 reply drafting pulls "similar past context" through here; n8n never talks to
 * pgvector or OpenAI embeddings directly). Body: { team_id, query, kinds?, limit? }.
 * Returns team-scoped chunks via the same thresholded/weighted matchKnowledge path
 * the analyst chat uses.
 */
export async function POST(request: Request) {
  const limited = await rateLimitDurable(
    request,
    "api:internal:n8n:match-embeddings",
    120,
    60_000,
  );
  if (limited) return limited;

  const unauthorized = requireN8nToken(request);
  if (unauthorized) return unauthorized;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const teamId = typeof body.team_id === "string" ? body.team_id.trim() : "";
  const query =
    typeof body.query === "string" ? body.query.trim().slice(0, MAX_QUERY_LEN) : "";
  if (!teamId || !query) {
    return jsonError("team_id and query are required", 400);
  }

  const kinds = Array.isArray(body.kinds)
    ? body.kinds.filter(
        (k): k is EmbeddingKind =>
          typeof k === "string" && (KINDS as readonly string[]).includes(k),
      )
    : undefined;
  const limitRaw = typeof body.limit === "number" ? Math.floor(body.limit) : NaN;
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_LIMIT) : undefined;

  const supabase = createServerClient();

  // Reject unknown teams so a mistyped id fails loudly instead of returning [].
  const { data: team, error: teamErr } = await supabase
    .from("teams")
    .select("id")
    .eq("id", teamId)
    .maybeSingle();
  if (teamErr) return jsonError(teamErr.message, 500);
  if (!team) return jsonError("Unknown team_id", 404);

  const chunks = await matchKnowledge({
    supabase,
    teamId,
    queryText: query,
    kinds: kinds && kinds.length > 0 ? kinds : undefined,
    limit,
  });

  return NextResponse.json({
    team_id: teamId,
    count: chunks.length,
    chunks: chunks.map((c) => ({
      kind: c.kind,
      similarity: c.similarity,
      content: c.content,
    })),
  });
}
