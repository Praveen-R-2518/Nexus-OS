import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-security";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import type { Conversation, Metrics } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  let supabase;
  try {
    supabase = createSupabaseRouteHandlerClient();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Server configuration error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

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
      .not("status", "in", terminalStatuses),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("intent", "purchase" as Conversation["intent"])
      .in("urgency", ["critical", "high"] as Conversation["urgency"][]),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("intent", "churn_risk" as Conversation["intent"]),
    supabase
      .from("reply_drafts")
      .select("*", { count: "exact", head: true })
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

  return NextResponse.json({ metrics });
}
