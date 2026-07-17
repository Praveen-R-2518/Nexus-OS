import { NextResponse } from "next/server";
import { jsonError, rateLimit, requireApiTenantContext } from "@/lib/api-security";
import {
  buildDailyTimeseries,
  isMetricsTimeseriesRange,
  rangeStartDate,
  type ConversationTimeseriesRow,
  type MetricsTimeseriesRange,
} from "@/lib/metrics/timeseries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = rateLimit(request, "api:metrics:timeseries:get", 60, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const url = new URL(request.url);
  const rangeParam = url.searchParams.get("range") ?? "month";
  if (!isMetricsTimeseriesRange(rangeParam)) {
    return jsonError(
      "Invalid range (use week, month, 6m, year, or all)",
      400,
    );
  }
  const range: MetricsTimeseriesRange = rangeParam;

  const { supabase, teamId } = tenant;
  const start = rangeStartDate(range);

  const { data, error } = await supabase
    .from("conversations")
    .select("created_at, estimated_value, intent, urgency, status")
    .eq("team_id", teamId)
    .gte("created_at", start.toISOString())
    .order("created_at", { ascending: true })
    .limit(10000);

  if (error) return jsonError(error.message, 500);

  const rows = (data ?? []) as ConversationTimeseriesRow[];
  const points = buildDailyTimeseries(rows, range);

  return NextResponse.json({ range, points });
}
