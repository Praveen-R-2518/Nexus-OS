import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-security";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { shouldUseDevelopmentMockFallback } from "@/lib/conversations-mock";
import type { WorkflowLog } from "@/types";

export const dynamic = "force-dynamic";

/** Query `?status=` filters the `result` column on `workflow_logs`. */
const WORKFLOW_LOG_RESULTS: ReadonlyArray<string> = [
  "success",
  "failed",
  "running",
];

const EMPTY_COUNTS = {
  success: 0,
  failed: 0,
  running: 0,
};

function emptyLogsResponse() {
  return NextResponse.json({
    logs: [],
    counts: EMPTY_COUNTS,
    source: "mock",
  });
}

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");

  if (
    statusParam !== null &&
    statusParam !== "" &&
    !WORKFLOW_LOG_RESULTS.includes(statusParam)
  ) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createSupabaseRouteHandlerClient();
  } catch (err) {
    if (shouldUseDevelopmentMockFallback()) {
      return emptyLogsResponse();
    }

    const message =
      err instanceof Error ? err.message : "Server configuration error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let logsQuery = supabase
    .from("workflow_logs")
    .select("*")
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
        .eq("result", "success"),
      supabase
        .from("workflow_logs")
        .select("*", { count: "exact", head: true })
        .eq("result", "failed"),
      supabase
        .from("workflow_logs")
        .select("*", { count: "exact", head: true })
        .eq("result", "running"),
    ]);

  if (logsResult.error) {
    if (shouldUseDevelopmentMockFallback()) {
      return emptyLogsResponse();
    }

    return NextResponse.json(
      { error: logsResult.error.message },
      { status: 500 },
    );
  }
  if (successCount.error) {
    if (shouldUseDevelopmentMockFallback()) {
      return emptyLogsResponse();
    }

    return NextResponse.json(
      { error: successCount.error.message },
      { status: 500 },
    );
  }
  if (failedCount.error) {
    if (shouldUseDevelopmentMockFallback()) {
      return emptyLogsResponse();
    }

    return NextResponse.json(
      { error: failedCount.error.message },
      { status: 500 },
    );
  }
  if (runningCount.error) {
    if (shouldUseDevelopmentMockFallback()) {
      return emptyLogsResponse();
    }

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
  });
}
