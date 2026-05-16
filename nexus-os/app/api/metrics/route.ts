import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import type { Conversation, Metrics } from "@/types";

export async function GET() {
  let supabase;
  try {
    supabase = createServerClient();
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

  if (revenueRowsResult.error) {
    return NextResponse.json(
      { error: revenueRowsResult.error.message },
      { status: 500 },
    );
  }
  if (hotLeadsResult.error) {
    return NextResponse.json(
      { error: hotLeadsResult.error.message },
      { status: 500 },
    );
  }
  if (churnRisksResult.error) {
    return NextResponse.json(
      { error: churnRisksResult.error.message },
      { status: 500 },
    );
  }
  if (approvedDraftsResult.error) {
    return NextResponse.json(
      { error: approvedDraftsResult.error.message },
      { status: 500 },
    );
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
