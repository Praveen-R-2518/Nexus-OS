import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  rateLimit,
  readJsonObjectWithLimit,
  requireN8nToken,
} from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const CONVERSATION_SOURCES = [
  "webhook",
  "manual",
  "gmail",
  "email",
  "imap",
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

export async function POST(request: Request) {
  const limited = rateLimit(request, "api:internal:n8n:conversations", 120, 60_000);
  if (limited) return limited;

  const unauthorized = requireN8nToken(request);
  if (unauthorized) return unauthorized;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.ingest);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const message = boundedString(body.message, 20_000);
  if (!message) {
    return NextResponse.json(
      { success: false, error: "message is required" },
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

  const rawPayload = Object.prototype.hasOwnProperty.call(body, "raw_payload")
    ? body.raw_payload
    : body;

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      source: pickAllowed(body.source, CONVERSATION_SOURCES, "webhook"),
      customer_name: boundedString(body.customer_name, 250),
      customer_email: boundedString(body.customer_email, 320),
      customer_phone: boundedString(body.customer_phone, 80),
      channel: boundedString(body.channel, 80) ?? "email",
      message,
      raw_payload: rawPayload,
      status: pickAllowed(body.status, POST_STATUSES, "unread"),
      received_at:
        typeof body.received_at === "string" ? body.received_at : new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    console.error("[internal n8n conversations] Supabase error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create conversation" },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, data }, { status: 201 });
}
