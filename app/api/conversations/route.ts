import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-security";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import type { Conversation } from "@/types";
import { parseListQuery } from "@/lib/conversations-query";

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
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);

  const parsed = parseListQuery(searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const { limit, offset, status: statusParam, intent: intentParam, urgency: urgencyParam } =
    parsed.query;

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

  let supabase;
  try {
    supabase = createSupabaseRouteHandlerClient();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Server configuration error";
    return NextResponse.json({ error: message }, { status: 500 });
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Conversation[];

  return NextResponse.json({
    data: rows,
    count: count ?? rows.length,
  });
}
