import { NextResponse } from "next/server";
import { rateLimit, requireApiTenantContext } from "@/lib/api-security";

export const dynamic = "force-dynamic";

const WORKFLOW_LOG_RESULTS = ["success", "error", "skipped", "retry"] as const;

/**
 * Read-only tenant-scoped workflow observability (Task E.3). `workflow_logs` is written
 * server-side only by n8n via a service-role/custom-auth call (migration
 * 20260713160000_restore_workflow_logs) — this route never inserts, it just exposes the
 * authenticated team's own rows for the `/logs` dashboard page.
 */
export async function GET(request: Request) {
  const limited = rateLimit(request, "api:workflow-logs:get", 60, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const { supabase, teamId } = tenant;

  const { searchParams } = new URL(request.url);

  const workflowNameParam = searchParams.get("workflow_name");
  const resultParam = searchParams.get("result");

  if (
    resultParam !== null &&
    resultParam !== "" &&
    !(WORKFLOW_LOG_RESULTS as readonly string[]).includes(resultParam)
  ) {
    return NextResponse.json(
      { error: `Invalid result; must be one of: ${WORKFLOW_LOG_RESULTS.join(", ")}` },
      { status: 400 },
    );
  }

  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");

  const limit = limitParam === null || limitParam === "" ? 50 : Number.parseInt(limitParam, 10);
  const offset = offsetParam === null || offsetParam === "" ? 0 : Number.parseInt(offsetParam, 10);

  if (!Number.isFinite(limit) || limit < 1) {
    return NextResponse.json({ error: "limit must be a positive integer" }, { status: 400 });
  }
  if (!Number.isFinite(offset) || offset < 0) {
    return NextResponse.json({ error: "offset must be a non-negative integer" }, { status: 400 });
  }
  if (limit > 200) {
    return NextResponse.json({ error: "limit must not exceed 200" }, { status: 400 });
  }

  let query = supabase
    .from("workflow_logs")
    .select("id, workflow_name, step, result, payload, error, timestamp, created_at", {
      count: "exact",
    })
    .eq("team_id", teamId)
    .order("timestamp", { ascending: false });

  if (workflowNameParam && workflowNameParam.trim()) {
    query = query.eq("workflow_name", workflowNameParam.trim().slice(0, 200));
  }
  if (resultParam && resultParam.length > 0) {
    query = query.eq("result", resultParam);
  }

  const rangeEnd = offset + limit - 1;
  query = query.range(offset, rangeEnd);

  const { data, error, count } = await query;

  if (error) {
    console.error("[GET /api/workflow-logs] Supabase error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: data ?? [],
    count: count ?? (data ?? []).length,
    limit,
    offset,
  });
}
