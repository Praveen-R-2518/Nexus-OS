import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  rateLimit,
  readJsonObjectWithLimit,
  requireN8nBootstrapToken,
} from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";
import { parseWorkspaceId } from "@/lib/workspace-id";

export const dynamic = "force-dynamic";

const RESULTS = ["success", "error", "skipped"] as const;

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function pickResult(value: unknown): (typeof RESULTS)[number] {
  if (typeof value === "string" && (RESULTS as readonly string[]).includes(value)) {
    return value as (typeof RESULTS)[number];
  }
  return "success";
}

/**
 * Service-role workflow log insert for n8n error alerting and structured breadcrumbs.
 * Bootstrap-token-guarded — n8n never writes workflow_logs via Supabase REST directly.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:internal:n8n:workflow-logs", 120, 60_000);
  if (limited) return limited;

  const unauthorized = requireN8nBootstrapToken(request);
  if (unauthorized) return unauthorized;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.medium);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const workflowName = boundedString(body.workflow_name, 200);
  const step = boundedString(body.step, 200);
  if (!workflowName || !step) {
    return NextResponse.json(
      { success: false, error: "workflow_name and step are required" },
      { status: 400 },
    );
  }

  let supabase;
  try {
    supabase = createServerClient();
  } catch {
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500 },
    );
  }

  const teamId = parseWorkspaceId(body.team_id);
  const workspaceId = parseWorkspaceId(body.workspace_id);
  const result = pickResult(body.result);
  const errorText = boundedString(body.error, 2_000);
  const payload =
    body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? body.payload
      : {};

  const { data, error } = await supabase
    .from("workflow_logs")
    .insert({
      team_id: teamId,
      workspace_id: workspaceId,
      workflow_name: workflowName,
      step,
      result,
      payload,
      error: errorText,
      timestamp:
        typeof body.timestamp === "string" ? body.timestamp : new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[internal n8n workflow-logs] Supabase error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to write workflow log" },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, id: data?.id ?? null }, { status: 201 });
}
