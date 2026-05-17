import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";
import { MOCK_CONVERSATIONS, MOCK_REPLY_DRAFTS } from "@/lib/mock-inbox-data";
import {
  shouldUseDevelopmentMockFallback,
  shouldUseMockConversations,
} from "@/lib/conversations-mock";
import type { Conversation, Metrics } from "@/types";

export const dynamic = "force-dynamic";

function mockMetrics(): Metrics {
  const terminalStatuses: Conversation["status"][] = [
    "approved",
    "sent",
    "rejected",
  ];
  const revenue_at_risk = MOCK_CONVERSATIONS.filter(
    (conversation) => !terminalStatuses.includes(conversation.status),
  ).reduce(
    (sum, conversation) => sum + (Number(conversation.estimated_value) || 0),
    0,
  );
  const hot_leads = MOCK_CONVERSATIONS.filter(
    (conversation) =>
      conversation.intent === "purchase" &&
      (conversation.urgency === "critical" || conversation.urgency === "high"),
  ).length;
  const churn_risks = MOCK_CONVERSATIONS.filter(
    (conversation) => conversation.intent === "churn_risk",
  ).length;
  const hours_saved =
    MOCK_REPLY_DRAFTS.filter((draft) => draft.approval_status === "approved")
      .length * 0.5;

  return {
    revenue_at_risk,
    hot_leads,
    churn_risks,
    hours_saved,
  };
}

function mockMetricsResponse() {
  return NextResponse.json({ metrics: mockMetrics(), source: "mock" });
}

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  if (shouldUseMockConversations()) {
    return mockMetricsResponse();
  }

  let supabase;
  try {
    supabase = createServerClient();
  } catch (err) {
    if (shouldUseDevelopmentMockFallback()) {
      return mockMetricsResponse();
    }

    const message =
      err instanceof Error ? err.message : "Server configuration error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const terminalStatuses = '("approved","sent","rejected")';

  const [
    revenueRowsResult,
    hotLeadsResult,
    churnRisksResult,
    approvedDraftsResult,
  ] = await Promise.all([
    supabase
      .from("conversations")
      .select("estimated_value")
      .not("status", "in", terminalStatuses),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("intent", "purchase" as Conversation["intent"])
      .in("urgency", ["critical", "high"] as Conversation["urgency"][]),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("intent", "churn_risk" as Conversation["intent"]),
    supabase
      .from("reply_drafts")
      .select("*", { count: "exact", head: true })
      .eq("approval_status", "approved"),
  ]);

  const queryError =
    revenueRowsResult.error ??
    hotLeadsResult.error ??
    churnRisksResult.error ??
    approvedDraftsResult.error;

  if (queryError) {
    if (shouldUseDevelopmentMockFallback()) {
      return mockMetricsResponse();
    }

    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const revenueRows = (revenueRowsResult.data ?? []) as Pick<
    Conversation,
    "estimated_value"
  >[];

  const revenue_at_risk = revenueRows.reduce(
    (sum, row) => sum + (Number(row.estimated_value) || 0),
    0,
  );

  const hot_leads = hotLeadsResult.count ?? 0;
  const churn_risks = churnRisksResult.count ?? 0;
  const approvedCount = approvedDraftsResult.count ?? 0;

  if (
    revenueRows.length === 0 &&
    hot_leads === 0 &&
    churn_risks === 0 &&
    approvedCount === 0 &&
    shouldUseDevelopmentMockFallback()
  ) {
    return mockMetricsResponse();
  }

  const hours_saved = approvedCount * 0.5;

  const metrics: Metrics = {
    revenue_at_risk,
    hot_leads,
    churn_risks,
    hours_saved,
  };

  return NextResponse.json({ metrics });
}
