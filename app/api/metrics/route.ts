import { NextResponse } from "next/server";
import { requireApiTenantContext } from "@/lib/api-security";
import type { Conversation, Metrics } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const { supabase, teamId } = tenant;

  const terminalStatuses = '("approved","sent","rejected")';

  const [
    revenueRowsResult,
    hotLeadsResult,
    churnRisksResult,
    approvedDraftsResult,
  ] = await Promise.all([
    supabase
      .from("conversations")
      .select("estimated_value")
      .eq("team_id", teamId)
      .not("status", "in", terminalStatuses),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("intent", "purchase" as Conversation["intent"])
      .in("urgency", ["critical", "high"] as Conversation["urgency"][]),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("intent", "churn_risk" as Conversation["intent"]),
    supabase
      .from("reply_drafts")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("approval_status", "approved"),
  ]);

  const queryError =
    revenueRowsResult.error ??
    hotLeadsResult.error ??
    churnRisksResult.error ??
    approvedDraftsResult.error;

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const revenueRows = (revenueRowsResult.data ?? []) as Pick<
    Conversation,
    "estimated_value"
  >[];

  const revenue_at_risk = revenueRows.reduce(
    (sum, row) => sum + (Number(row.estimated_value) || 0),
    0,
  );

  const hot_leads = hotLeadsResult.count ?? 0;
  const churn_risks = churnRisksResult.count ?? 0;
  const approvedCount = approvedDraftsResult.count ?? 0;

  const hours_saved = approvedCount * 0.5;

  const metrics: Metrics = {
    revenue_at_risk,
    hot_leads,
    churn_risks,
    hours_saved,
  };

  return NextResponse.json({ metrics, source: "live" });
}
