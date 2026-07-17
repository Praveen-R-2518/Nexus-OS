import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  rateLimit,
  readJsonObjectWithLimit,
  requireN8nJobOrBootstrapToken,
} from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";
import { parseWorkspaceId } from "@/lib/workspace-id";

export const dynamic = "force-dynamic";

const TERMINAL_STATUSES = ["sent", "failed", "cancelled"] as const;
type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

function isTerminalStatus(value: unknown): value is TerminalStatus {
  return typeof value === "string" && (TERMINAL_STATUSES as readonly string[]).includes(value);
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

/**
 * Outbound job status writeback — the counterpart to
 * `/api/internal/n8n/outbound-jobs/claim`. Job-scoped: expects the single-use `send_reply`
 * token minted at claim time, bound to (resource: outbound_job, job_id); falls back to the
 * bootstrap/legacy `N8N_INGEST_TOKEN` (with a warning) during the transition. Only the claimer
 * of a given job holds a token that will validate here, so a stray/duplicate caller cannot
 * overwrite another job's terminal state.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:internal:n8n:outbound-jobs-result", 120, 60_000);
  if (limited) return limited;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const jobId = parseWorkspaceId(body.job_id);
  if (!jobId) {
    return NextResponse.json(
      { success: false, error: "job_id is required and must be a valid UUID" },
      { status: 400 },
    );
  }

  if (!isTerminalStatus(body.status)) {
    return NextResponse.json(
      { success: false, error: `status must be one of ${TERMINAL_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }
  const status = body.status;

  const unauthorized = await requireN8nJobOrBootstrapToken(
    request,
    "send_reply",
    { resourceType: "outbound_job", resourceId: jobId },
    "internal n8n outbound-jobs result",
  );
  if (unauthorized) return unauthorized;

  const providerMessageId = boundedString(body.provider_message_id, 500);
  const lastError = status === "failed" ? boundedString(body.error, 2_000) : null;

  let supabase;
  try {
    supabase = createServerClient();
  } catch {
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500 },
    );
  }

  const patch: Record<string, unknown> = {
    status,
    last_error: lastError,
    updated_at: new Date().toISOString(),
  };
  if (providerMessageId) patch.provider_message_id = providerMessageId;
  if (status === "sent") patch.sent_at = new Date().toISOString();

  const { error } = await supabase.from("outbound_jobs").update(patch).eq("id", jobId);
  if (error) {
    console.error("[internal n8n outbound-jobs result] Supabase error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update outbound job" },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
