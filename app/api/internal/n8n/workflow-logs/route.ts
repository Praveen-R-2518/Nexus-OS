import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  rateLimit,
  readJsonObjectWithLimit,
  requireN8nToken,
} from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";
import { parseWorkspaceId } from "@/lib/workspace-id";

export const dynamic = "force-dynamic";

const WORKFLOW_LOG_RESULTS = new Set([
  "success",
  "failed",
  "running",
  "error",
  "skipped",
]);

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "api:internal:n8n:workflow-logs", 180, 60_000);
  if (limited) return limited;

  const unauthorized = requireN8nToken(request);
  if (unauthorized) return unauthorized;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.medium);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const workflowName = boundedString(body.workflow_name, 160);
  const step = boundedString(body.step, 160);
  const result = boundedString(body.result, 40);

  if (!workflowName || !step || !result) {
    return NextResponse.json(
      { success: false, error: "workflow_name, step, and result are required" },
      { status: 400 },
    );
  }

  if (!WORKFLOW_LOG_RESULTS.has(result)) {
    return NextResponse.json(
      { success: false, error: "Invalid workflow log result" },
      { status: 400 },
    );
  }

  const workspaceId = parseWorkspaceId(body.workspace_id);
  if (!workspaceId) {
    return NextResponse.json(
      {
        success: false,
        error: "workspace_id is required and must be a valid UUID",
      },
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

  const payload =
    body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? body.payload
      : {};

  const { data: wsRow, error: wsErr } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (wsErr || !wsRow) {
    return NextResponse.json(
      { success: false, error: "workspace_id does not reference an existing workspace" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("workflow_logs")
    .insert({
      workspace_id: workspaceId,
      workflow_name: workflowName,
      step,
      result,
      payload,
      error: boundedString(body.error, 2_000),
    })
    .select("*")
    .single();

  if (error) {
    console.error("[internal n8n workflow-logs] Supabase error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create workflow log" },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, data }, { status: 201 });
}
