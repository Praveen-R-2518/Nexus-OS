import { NextResponse } from "next/server";
import { jsonError, rateLimit, requireApiTenantContext } from "@/lib/api-security";
import type { AiUsageSummary } from "@/types";

export const dynamic = "force-dynamic";

type UsageRow = {
  workflow_name: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
};

/**
 * GET /api/ai-usage — current-month AI token usage for the tenant, grouped by
 * workflow + model, plus the workspace's soft budget (business_profiles.
 * ai_monthly_token_budget). Reads the service-role-written `ai_usage` table
 * through the caller's own RLS-scoped client (SELECT policy: own team only).
 */
export async function GET(request: Request) {
  const limited = rateLimit(request, "api:ai-usage:get", 60, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;
  const { supabase, teamId } = tenant;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [usageResult, profileResult] = await Promise.all([
    supabase
      .from("ai_usage")
      .select("workflow_name, model, input_tokens, output_tokens")
      .eq("team_id", teamId)
      .gte("created_at", monthStart.toISOString())
      .limit(5000),
    supabase
      .from("business_profiles")
      .select("ai_monthly_token_budget")
      .eq("team_id", teamId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (usageResult.error) return jsonError(usageResult.error.message, 500);

  const grouped = new Map<
    string,
    { workflow_name: string; model: string; input_tokens: number; output_tokens: number }
  >();
  for (const raw of (usageResult.data ?? []) as UsageRow[]) {
    const workflow = (raw.workflow_name ?? "unknown").trim() || "unknown";
    const model = (raw.model ?? "unknown").trim() || "unknown";
    const key = `${workflow}::${model}`;
    const entry =
      grouped.get(key) ?? { workflow_name: workflow, model, input_tokens: 0, output_tokens: 0 };
    entry.input_tokens += typeof raw.input_tokens === "number" ? raw.input_tokens : 0;
    entry.output_tokens += typeof raw.output_tokens === "number" ? raw.output_tokens : 0;
    grouped.set(key, entry);
  }

  const rows = [...grouped.values()]
    .map((r) => ({ ...r, total_tokens: r.input_tokens + r.output_tokens }))
    .sort((a, b) => b.total_tokens - a.total_tokens);

  const budgetRaw = (profileResult.data as { ai_monthly_token_budget?: unknown } | null)
    ?.ai_monthly_token_budget;
  const budget = typeof budgetRaw === "number" && budgetRaw >= 0 ? budgetRaw : null;

  const summary: AiUsageSummary = {
    month_start: monthStart.toISOString(),
    total_tokens: rows.reduce((sum, r) => sum + r.total_tokens, 0),
    budget,
    rows,
  };

  return NextResponse.json({ usage: summary });
}
