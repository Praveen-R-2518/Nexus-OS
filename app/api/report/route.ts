import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { shouldUseDevelopmentMockFallback } from "@/lib/conversations-mock";
import type { DailyReport } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  let supabase;
  try {
    supabase = createServerClient();
  } catch (err) {
    if (shouldUseDevelopmentMockFallback()) {
      return NextResponse.json({ report: null });
    }

    const message =
      err instanceof Error ? err.message : "Server configuration error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("daily_reports")
    .select("*")
    .order("report_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (shouldUseDevelopmentMockFallback()) {
      return NextResponse.json({ report: null });
    }

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
