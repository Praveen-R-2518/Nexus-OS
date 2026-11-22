import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  readJsonObjectWithLimit,
  requireN8nBootstrapToken,
} from "@/lib/api-security";
import {
  MAX_CLAIM_LIMIT,
  runBackgroundJobBatch,
} from "@/lib/people/background-jobs";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * People background job worker (Wave 1 D1 + D3 + D4).
 *
 * Claims queued `background_jobs` rows and dispatches by `kind`. For `people.match`,
 * D3 runs deterministic D2 scoring in-process (`lib/people/match-worker.ts`), then D4
 * fills advisory `ai_explanation` via `lib/ai/people-explain.ts` without rewriting scores.
 * n8n/cron should only POST this route — do not compute match scores or call OpenAI in n8n.
 *
 * Scheduling (human): configure an n8n schedule or Vercel cron to POST this route with
 * `Authorization: Bearer <N8N_BOOTSTRAP_TOKEN>` (legacy `N8N_INGEST_TOKEN` accepted during
 * migration).
 */
export const maxDuration = 300;
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:internal:people:jobs-run", 30, 60_000);
  if (limited) return limited;

  const unauthorized = requireN8nBootstrapToken(request);
  if (unauthorized) return unauthorized;

  let limit: number | undefined;
  const contentLength = request.headers.get("content-length");
  const hasBody = contentLength ? Number.parseInt(contentLength, 10) > 0 : false;
  if (hasBody) {
    const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
    if (!parsed.ok) return parsed.response;
    const raw = parsed.body.limit;
    if (raw !== undefined) {
      if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1) {
        return jsonError("limit must be a positive number", 400);
      }
      limit = Math.min(Math.floor(raw), MAX_CLAIM_LIMIT);
    }
  }

  let supabase;
  try {
    supabase = createServerClient();
  } catch {
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500 },
    );
  }

  const batch = await runBackgroundJobBatch(supabase, { limit });
  if (batch.claimed === 0) {
    return NextResponse.json({ success: true, claimed: false }, { status: 200 });
  }

  return NextResponse.json(
    {
      success: true,
      claimed: true,
      processed: batch.claimed,
      completed: batch.completed,
      failed: batch.failed,
      jobs: batch.jobs,
    },
    { status: 200 },
  );
}
