import { NextResponse } from "next/server";
import { requireApiTenantContext } from "@/lib/api-security";
import type { DailyReport } from "@/types";

export const dynamic = "force-dynamic";

type DailyReportRow = {
  id: string;
  team_id?: string | null;
  workspace_id?: string | null;
  report_date: string;
  summary?: string | null;
  revenue_at_risk?: number | null;
  hot_leads_count?: number | null;
  churn_risks_count?: number | null;
  replies_drafted?: number | null;
  followups_scheduled?: number | null;
  hours_saved?: number | null;
  created_at: string;
};

function mapDailyReport(row: DailyReportRow): DailyReport {
  const hotLeads = Number(row.hot_leads_count ?? 0);
  const churnRisks = Number(row.churn_risks_count ?? 0);
  const repliesDrafted = Number(row.replies_drafted ?? 0);

  return {
    id: row.id,
    team_id: row.team_id,
    workspace_id: row.workspace_id,
    report_date: row.report_date,
    summary_text: (row.summary ?? "").trim(),
    total_revenue_at_risk: Number(row.revenue_at_risk ?? 0),
    messages_processed: hotLeads + churnRisks + repliesDrafted,
    drafts_approved: repliesDrafted,
    created_at: row.created_at,
  };
}

export async function GET() {
  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const { supabase, teamId } = tenant;

  const { data, error } = await supabase
    .from("daily_reports")
    .select("*")
    .eq("team_id", teamId)
    .order("report_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ report: null });
  }

  const report = mapDailyReport(data as DailyReportRow);

  return NextResponse.json({
    report,
    generated_at: report.created_at,
  });
}
