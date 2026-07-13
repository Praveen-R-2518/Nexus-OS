import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  rateLimit,
  readJsonObjectWithLimit,
  requireN8nToken,
} from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";
import { parseWorkspaceId } from "@/lib/workspace-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function optionalTokenCount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

/**
 * AI cost/usage recorder (Task 4.4).
 *
 * n8n workflows POST token counts from existing OpenAI/OpenRouter responses after classify/draft/report
 * steps. Token-guarded (N8N_INGEST_TOKEN); inserts via service role into tenant-scoped ai_usage.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:internal:n8n:ai-usage", 240, 60_000);
  if (limited) return limited;

  const unauthorized = requireN8nToken(request);
  if (unauthorized) return unauthorized;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const teamId = parseWorkspaceId(body.team_id);
  if (!teamId) {
    return NextResponse.json(
      { success: false, error: "team_id is required and must be a valid UUID" },
      { status: 400 },
    );
  }

  const workflowName = boundedString(body.workflow_name, 80);
  if (!workflowName) {
    return NextResponse.json(
      { success: false, error: "workflow_name is required" },
      { status: 400 },
    );
  }

  const model = boundedString(body.model, 200);
  if (!model) {
    return NextResponse.json(
      { success: false, error: "model is required" },
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

  const { data: teamRow, error: teamErr } = await supabase
    .from("teams")
    .select("id")
    .eq("id", teamId)
    .maybeSingle();

  if (teamErr || !teamRow) {
    return NextResponse.json(
      { success: false, error: "team_id does not reference an existing team" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("ai_usage")
    .insert({
      team_id: teamId,
      workflow_name: workflowName,
      model,
      input_tokens: optionalTokenCount(body.input_tokens),
      output_tokens: optionalTokenCount(body.output_tokens),
    })
    .select("id, team_id, workflow_name, model, input_tokens, output_tokens, created_at")
    .single();

  if (error) {
    console.error("[internal n8n ai-usage] Supabase error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to record AI usage" },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, data }, { status: 201 });
}
