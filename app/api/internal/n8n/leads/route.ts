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

const INTENTS = [
  "question",
  "complaint",
  "purchase_intent",
  "support",
  "other",
] as const;
const URGENCIES = ["low", "medium", "high"] as const;
const RISK_TYPES = ["none", "churn_risk", "escalation_risk"] as const;
const NEXT_ACTIONS = [
  "draft_reply",
  "request_approval",
  "schedule_followup",
  "escalate",
  "none",
] as const;

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function pickAllowed<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Channel-agnostic lead creation (Task A.3). WF2 (classification) currently writes `leads`
 * directly via a Supabase REST HTTP node (see `n8n_logic/exports/wf2_classification.json`,
 * `Create Lead`), which trusts whatever `conversation_id` the classifier was handed. This
 * endpoint hardens that path for any caller that adopts it: it verifies the conversation actually
 * exists AND belongs to the SAME tenant (`team_id`/`workspace_id`) the request claims, so a lead
 * can never be attached to another tenant's conversation. Token-guarded (N8N_INGEST_TOKEN).
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:internal:n8n:leads", 120, 60_000);
  if (limited) return limited;

  const unauthorized = requireN8nToken(request);
  if (unauthorized) return unauthorized;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.ingest);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const teamId = parseWorkspaceId(body.team_id);
  if (!teamId) {
    return NextResponse.json(
      { success: false, error: "team_id is required and must be a valid UUID" },
      { status: 400 },
    );
  }

  const conversationId = parseWorkspaceId(body.conversation_id);
  if (!conversationId) {
    return NextResponse.json(
      { success: false, error: "conversation_id is required and must be a valid UUID" },
      { status: 400 },
    );
  }

  const workspaceId = parseWorkspaceId(body.workspace_id);

  let supabase;
  try {
    supabase = createServerClient();
  } catch {
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500 },
    );
  }

  // Tenant-scoped existence check: the conversation must exist AND already carry this team_id.
  // A lead is only ever created for a conversation that was itself ingested for this tenant —
  // this is the durability gap Task A.3 closes (WF2's direct-REST path trusts the payload blindly).
  const { data: convRow, error: convErr } = await supabase
    .from("conversations")
    .select("id, team_id, workspace_id")
    .eq("id", conversationId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (convErr) {
    console.error("[internal n8n leads] conversation lookup error:", convErr);
    return NextResponse.json(
      { success: false, error: "Failed to verify conversation" },
      { status: 502 },
    );
  }
  if (!convRow) {
    return NextResponse.json(
      {
        success: false,
        error: "conversation_id does not reference an existing conversation for this team_id",
      },
      { status: 409 },
    );
  }

  const resolvedWorkspaceId =
    workspaceId ?? (convRow as { workspace_id: string | null }).workspace_id ?? null;

  const { data, error } = await supabase
    .from("leads")
    .insert({
      team_id: teamId,
      workspace_id: resolvedWorkspaceId,
      conversation_id: conversationId,
      customer_name: boundedString(body.customer_name, 250) ?? "",
      customer_email: boundedString(body.customer_email, 320) ?? "",
      intent: pickAllowed(body.intent, INTENTS, "other"),
      urgency: pickAllowed(body.urgency, URGENCIES, "medium"),
      estimated_value: numberOr(body.estimated_value, 0),
      risk_type: pickAllowed(body.risk_type, RISK_TYPES, "none"),
      risk_score: numberOr(body.risk_score, 0),
      status: "new",
      next_action: pickAllowed(body.recommended_action ?? body.next_action, NEXT_ACTIONS, "request_approval"),
      confidence: numberOr(body.confidence, 0),
    })
    .select("*")
    .single();

  if (error) {
    console.error("[internal n8n leads] Supabase error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create lead" },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, data }, { status: 201 });
}
