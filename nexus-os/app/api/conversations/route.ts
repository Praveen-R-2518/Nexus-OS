import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import type { Conversation } from "@/types";
import {
  mockConversationsListResult,
  shouldFallbackToMockAfterSupabaseError,
  shouldUseMockConversations,
} from "@/lib/conversations-mock";

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
        return NextResponse.json(
          { error: error.message },
          { status: 500 },
        );
      }
    }
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as Conversation[];

  return NextResponse.json({
    data: rows,
    count: count ?? rows.length,
    source: "live",
  });
}
