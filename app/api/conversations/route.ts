import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiTenantContext,
} from "@/lib/api-security";
import type { Conversation } from "@/types";

export const dynamic = "force-dynamic";

const CONVERSATION_STATUSES: ReadonlyArray<Conversation["status"]> = [
  "new",
  "classified",
  "draft_ready",
  "approved",
  "sent",
  "rejected",
];

const CONVERSATION_INTENTS: ReadonlyArray<Conversation["intent"]> = [
  "purchase",
  "complaint",
  "churn_risk",
  "support",
  "unknown",
];

const CONVERSATION_URGENCIES: ReadonlyArray<Conversation["urgency"]> = [
  "critical",
  "high",
  "medium",
  "low",
];

const CONVERSATION_SOURCES = [
  "demo",
  "webhook",
  "manual",
  "gmail",
  "email",
  "imap",
  "whatsapp",
  "instagram",
  "facebook",
] as const;

const POST_STATUSES = [
  "unread",
  "new",
  "classified",
  "draft_ready",
  "approved",
  "sent",
  "rejected",
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
  if (typeof value !== "string") return fallback;
  if (value === "n8n" && (allowed as readonly string[]).includes("webhook")) {
    return "webhook" as T[number];
  }
  return (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : fallback;
}

function pickIntentForInsert(
  value: unknown,
): NonNullable<Conversation["intent"]> {
  if (
    typeof value === "string" &&
    CONVERSATION_INTENTS.includes(value as Conversation["intent"])
  ) {
    return value as NonNullable<Conversation["intent"]>;
  }
  return "unknown";
}

function pickUrgencyForInsert(
  value: unknown,
): NonNullable<Conversation["urgency"]> {
  if (
    typeof value === "string" &&
    CONVERSATION_URGENCIES.includes(value as Conversation["urgency"])
  ) {
    return value as NonNullable<Conversation["urgency"]>;
  }
  return "low";
}

function boundedNonNegativeNumber(
  value: unknown,
  max: number,
  fallback: number,
): number {
  const n =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}

function boundedRiskScore(value: unknown): number {
  return Math.round(boundedNonNegativeNumber(value, 100, 0));
}

/** Accepts 0–1 or 0–100 (percent) from clients; stores 0–1. */
function boundedConfidence(value: unknown): number {
  const n =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 1 && n <= 100) return Math.min(n / 100, 1);
  return Math.min(n, 1);
}

export async function GET(request: Request) {
  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const { supabase, teamId } = tenant;

  const { searchParams } = new URL(request.url);

  const statusParam = searchParams.get("status");
  const intentParam = searchParams.get("intent");
  const urgencyParam = searchParams.get("urgency");

  if (
    statusParam !== null &&
    statusParam !== "" &&
    !CONVERSATION_STATUSES.includes(statusParam as Conversation["status"])
  ) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (
    intentParam !== null &&
    intentParam !== "" &&
    !CONVERSATION_INTENTS.includes(intentParam as Conversation["intent"])
  ) {
    return NextResponse.json({ error: "Invalid intent" }, { status: 400 });
  }
  if (
    urgencyParam !== null &&
    urgencyParam !== "" &&
    !CONVERSATION_URGENCIES.includes(urgencyParam as Conversation["urgency"])
  ) {
    return NextResponse.json({ error: "Invalid urgency" }, { status: 400 });
  }

  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");

  const limit =
    limitParam === null || limitParam === ""
      ? 50
      : Number.parseInt(limitParam, 10);
  const offset =
    offsetParam === null || offsetParam === ""
      ? 0
      : Number.parseInt(offsetParam, 10);

  if (!Number.isFinite(limit) || limit < 1) {
    return NextResponse.json(
      { error: "limit must be a positive integer" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(offset) || offset < 0) {
    return NextResponse.json(
      { error: "offset must be a non-negative integer" },
      { status: 400 },
    );
  }
  if (limit > 100) {
    return NextResponse.json(
      { error: "limit must not exceed 100" },
      { status: 400 },
    );
  }

  let query = supabase
    .from("conversations")
    .select("*", { count: "exact" })
    .eq("team_id", teamId)
    .order("risk_score", { ascending: false })
    .order("created_at", { ascending: false });

  if (statusParam && statusParam.length > 0) {
    query = query.eq("status", statusParam);
  }
  if (intentParam && intentParam.length > 0) {
    query = query.eq("intent", intentParam);
  }
  if (urgencyParam && urgencyParam.length > 0) {
    query = query.eq("urgency", urgencyParam);
  }

  const rangeEnd = offset + limit - 1;
  query = query.range(offset, rangeEnd);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Conversation[];

  return NextResponse.json({
    data: rows,
    count: count ?? rows.length,
    source: "live",
  });
}

export async function POST(request: Request) {
  const isDev = process.env.NODE_ENV === "development";
  const limited = rateLimit(request, "api:conversations:post", 60, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const { supabase, teamId } = tenant;

  try {
    const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.ingest);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;

    const message = body.message;
    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "message is required",
          ...(isDev && {
            details: "Provide non-empty string field `message`",
          }),
        },
        { status: 400 },
      );
    }

    const rawPayload = Object.prototype.hasOwnProperty.call(body, "raw_payload")
      ? body.raw_payload
      : body;

    const source = pickAllowed(body.source, CONVERSATION_SOURCES, "webhook");
    const customerName = boundedString(body.customer_name, 250);
    const customerEmail = boundedString(body.customer_email, 320);
    const customerPhone = boundedString(body.customer_phone, 80);
    const channel = boundedString(body.channel, 80) ?? "email";
    const status = pickAllowed(body.status, POST_STATUSES, "unread");
    const externalThreadId = boundedString(body.external_thread_id, 500);
    const externalPermalink = boundedString(body.external_permalink, 2000);

    const intent = pickIntentForInsert(body.intent);
    const urgency = pickUrgencyForInsert(body.urgency);
    const estimated_value = boundedNonNegativeNumber(
      body.estimated_value,
      1e12,
      0,
    );
    const risk_score = boundedRiskScore(body.risk_score);
    const confidence = boundedConfidence(body.confidence);

    const { data, error } = await supabase
      .from("conversations")
      .insert({
        team_id: teamId,
        source,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        channel,
        message: message.trim().slice(0, 20_000),
        external_thread_id: externalThreadId,
        external_permalink: externalPermalink,
        raw_payload: rawPayload,
        status,
        intent,
        urgency,
        estimated_value,
        risk_score,
        confidence,
        received_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      console.error("[POST /api/conversations] Supabase error:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to create conversation",
          ...(isDev && { details: error.message }),
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/conversations] Unexpected error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create conversation",
        ...(isDev && { details: msg }),
      },
      { status: 500 },
    );
  }
}
