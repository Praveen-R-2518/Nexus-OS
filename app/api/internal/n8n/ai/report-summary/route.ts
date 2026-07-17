import { NextResponse } from "next/server";
import { summarizeReport, type ReportSummaryStyle } from "@/lib/ai/report-summary";
import {
  JSON_LIMITS,
  rateLimitDurable,
  readJsonObjectWithLimit,
  requireN8nToken,
} from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";
import { parseWorkspaceId } from "@/lib/workspace-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/n8n/ai/report-summary — summarizes daily stats for the Buy-Back Report
 * (WF4/WF5). Body: `{ team_id?, workspace_id?, stats, style? }` → `{ summary, source:
 * 'openai'|'fallback' }`.
 *
 * Unlike classify/draft, this endpoint never 503s: when OPENAI_API_KEY is unset (or the live
 * call fails), it returns a deterministic, clearly-labelled `source: 'fallback'` summary rather
 * than a fake AI success — reports must keep flowing even without a key.
 */
export async function POST(request: Request) {
  const limited = await rateLimitDurable(
    request,
    "api:internal:n8n:ai:report-summary",
    120,
    60_000,
  );
  if (limited) return limited;

  const unauthorized = requireN8nToken(request);
  if (unauthorized) return unauthorized;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.medium);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const stats =
    body.stats && typeof body.stats === "object" && !Array.isArray(body.stats)
      ? (body.stats as Record<string, unknown>)
      : (body as Record<string, unknown>);

  const teamId = parseWorkspaceId(body.team_id) ?? undefined;
  const workspaceId = parseWorkspaceId(body.workspace_id) ?? undefined;
  const style: ReportSummaryStyle = body.style === "markdown" ? "markdown" : "brief";

  const supabase = createServerClient();

  const { summary, source, model } = await summarizeReport({
    stats,
    style,
    teamId,
    workspaceId,
    supabase,
  });

  return NextResponse.json({ summary, source, model });
}
