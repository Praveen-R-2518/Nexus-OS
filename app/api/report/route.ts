import { NextResponse } from "next/server";
import { requireApiTenantContext } from "@/lib/api-security";
import type { DailyReport } from "@/types";

export const dynamic = "force-dynamic";

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

  const report = data as DailyReport;

  return NextResponse.json({
    report,
    generated_at: report.created_at,
  });
}
