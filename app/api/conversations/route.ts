import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import type { Conversation } from "@/types";
import {
  mockConversationsListResult,
  shouldFallbackToMockAfterEmptyLiveData,
  shouldFallbackToMockAfterSupabaseError,
  shouldUseMockConversations,
} from "@/lib/conversations-mock";

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

export async function GET(request: Request) {
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

  if (shouldUseMockConversations()) {
    try {
      const { data, count } = mockConversationsListResult(searchParams);
      return NextResponse.json({ data, count, source: "mock" });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Invalid query parameters";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  let supabase;
  try {
    supabase = createServerClient();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Server configuration error";
    return NextResponse.json({ error: message }, { status: 500 });
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
    if (shouldFallbackToMockAfterSupabaseError(error)) {
      try {
        const { data: mockData, count: mockCount } =
          mockConversationsListResult(searchParams);
        return NextResponse.json({
          data: mockData,
          count: mockCount,
          source: "mock",
        });
      } catch {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Conversation[];

  if (rows.length === 0 && shouldFallbackToMockAfterEmptyLiveData()) {
    try {
      const { data: mockData, count: mockCount } =
        mockConversationsListResult(searchParams);
      return NextResponse.json({
        data: mockData,
        count: mockCount,
        source: "mock",
      });
    } catch {
      return NextResponse.json({
        data: rows,
        count: count ?? rows.length,
        source: "live",
      });
    }
  }

  return NextResponse.json({
    data: rows,
    count: count ?? rows.length,
    source: "live",
  });
}

export async function POST(request: Request) {
  const isDev = process.env.NODE_ENV === "development";

  let supabase;
  try {
    supabase = createServerClient();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Server configuration error";
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create conversation",
        ...(isDev && { details: message }),
      },
      { status: 500 },
    );
  }

  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid JSON body",
          ...(isDev && { details: "Request body must be JSON" }),
        },
        { status: 400 },
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body",
          ...(isDev && { details: "Body must be a JSON object" }),
        },
        { status: 400 },
      );
    }

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

    const source = typeof body.source === "string" ? body.source : "n8n";
    const customerName =
      typeof body.customer_name === "string" ? body.customer_name : null;
    const customerEmail =
      typeof body.customer_email === "string" ? body.customer_email : null;
    const customerPhone =
      typeof body.customer_phone === "string" ? body.customer_phone : null;
    const channel = typeof body.channel === "string" ? body.channel : "email";
    const status = typeof body.status === "string" ? body.status : "unread";

    const { data, error } = await supabase
      .from("conversations")
      .insert({
        source,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        channel,
        message: message.trim(),
        raw_payload: rawPayload,
        status,
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
