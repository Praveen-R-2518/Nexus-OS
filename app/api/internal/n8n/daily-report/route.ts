import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  rateLimitDurable,
  readJsonObjectWithLimit,
  requireN8nBootstrapToken,
} from "@/lib/api-security";
import { runDailyBuyBackReports } from "@/lib/reports/daily-buyback";
import { createServerClient } from "@/lib/supabase";
import { parseWorkspaceId } from "@/lib/workspace-id";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/internal/n8n/daily-report
 *
 * WF5: compute + persist today's Buy-Back report per tenant. Bootstrap/ingest token.
 * Optional `{ team_id }` to run a single tenant.
 */
export async function POST(request: Request) {
  const limited = await rateLimitDurable(
    request,
    "api:internal:n8n:daily-report",
    20,
    60_000,
  );
  if (limited) return limited;

  const unauthorized = requireN8nBootstrapToken(request);
  if (unauthorized) return unauthorized;

  let teamId: string | null = null;
  const contentLength = request.headers.get("content-length");
  const hasBody = contentLength ? Number.parseInt(contentLength, 10) > 0 : false;
  if (hasBody) {
    const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
    if (!parsed.ok) return parsed.response;
    teamId = parseWorkspaceId(parsed.body.team_id);
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

  try {
    const result = await runDailyBuyBackReports(supabase, { teamId });
    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (err) {
    console.error("[internal n8n daily-report]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { success: false, error: "Failed to build daily report" },
      { status: 502 },
    );
  }
}
