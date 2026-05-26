import { NextResponse } from "next/server";
import { requireApiTenantContext } from "@/lib/api-security";
import type { WorkflowLog } from "@/types";

export const dynamic = "force-dynamic";

/** Query `?status=` filters the `result` column on `workflow_logs`. */
const WORKFLOW_LOG_RESULTS: ReadonlyArray<string> = [
  "success",
  "failed",
  "running",
];

export async function GET(request: Request) {
  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const { supabase, teamId } = tenant;

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");

  if (
    statusParam !== null &&
    statusParam !== "" &&
    !WORKFLOW_LOG_RESULTS.includes(statusParam)
  ) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  let logsQuery = supabase
    .from("workflow_logs")
    .select("*")
    .eq("team_id", teamId)
    .order("timestamp", { ascending: false })
    .limit(50);

  if (statusParam && statusParam.length > 0) {
    logsQuery = logsQuery.eq("result", statusParam);
  }

  const [logsResult, successCount, failedCount, runningCount] =
    await Promise.all([
      logsQuery,
      supabase
        .from("workflow_logs")
        .select("*", { count: "exact", head: true })
        .eq("team_id", teamId)
        .eq("result", "success"),
      supabase
        .from("workflow_logs")
        .select("*", { count: "exact", head: true })
        .eq("team_id", teamId)
        .eq("result", "failed"),
      supabase
        .from("workflow_logs")
        .select("*", { count: "exact", head: true })
        .eq("team_id", teamId)
        .eq("result", "running"),
    ]);

  if (logsResult.error) {
    return NextResponse.json(
      { error: logsResult.error.message },
      { status: 500 },
    );
  }
  if (successCount.error) {
    return NextResponse.json(
      { error: successCount.error.message },
      { status: 500 },
    );
  }
  if (failedCount.error) {
    return NextResponse.json(
      { error: failedCount.error.message },
      { status: 500 },
    );
  }
  if (runningCount.error) {
    return NextResponse.json(
      { error: runningCount.error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    logs: (logsResult.data ?? []) as WorkflowLog[],
    counts: {
      success: successCount.count ?? 0,
      failed: failedCount.count ?? 0,
      running: runningCount.count ?? 0,
    },
    source: "live",
  });
}
