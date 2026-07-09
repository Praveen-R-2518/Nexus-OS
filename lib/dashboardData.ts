import type { SupabaseClient } from "@supabase/supabase-js";

export type ConversationRow = {
  id: string;
  source: string;
  customer_name: string;
  customer_email: string;
  message: string;
  status: string;
  raw_payload?: Record<string, unknown>;
  created_at: string;
  received_at: string;
};

export type LeadRow = {
  id: string;
  conversation_id: string | null;
  customer_name: string;
  customer_email: string;
  intent: string;
  urgency: string;
  estimated_value: number;
  risk_type: string;
  risk_score: number;
  status: string;
  next_action: string;
  confidence: number;
  created_at: string;
  updated_at: string;
};

export type ReplyDraftRow = {
  id: string;
  lead_id: string | null;
  conversation_id?: string | null;
  draft_text: string;
  status?: string;
  approval_status?: string;
  confidence: number;
  created_at: string;
  updated_at: string;
};

export type FollowupRow = {
  id: string;
  lead_id: string | null;
  conversation_id?: string | null;
  scheduled_for: string;
  action?: string;
  message: string | null;
  status: string;
  created_at: string;
};

export type DailyReportRow = {
  id: string;
  date?: string;
  report_date?: string;
  revenue_at_risk?: number;
  revenue_rescued?: number;
  hot_leads_count?: number;
  churn_risks_count?: number;
  replies_drafted?: number;
  followups_scheduled?: number;
  hours_saved: number;
  summary: string | Record<string, unknown>;
  created_at: string;
};

export type DashboardSnapshot = {
  conversations: ConversationRow[];
  leads: LeadRow[];
  drafts: ReplyDraftRow[];
  followups: FollowupRow[];
  reports: DailyReportRow[];
  errors: string[];
};

export const emptyDashboardSnapshot: DashboardSnapshot = {
  conversations: [],
  leads: [],
  drafts: [],
  followups: [],
  reports: [],
  errors: [],
};

type QueryError = { message: string } | null;

function errorMessages(errors: QueryError[]) {
  return errors
    .filter((error): error is { message: string } => Boolean(error))
    .map((error) => error.message);
}

export async function fetchDashboardSnapshot(
  supabase: SupabaseClient,
): Promise<DashboardSnapshot> {
  const [conversations, leads, drafts, followups, reports] = await Promise.all([
    supabase
      .from("conversations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("leads")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("reply_drafts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("followups")
      .select("*")
      .order("scheduled_for", { ascending: true })
      .limit(20),
    supabase
      .from("daily_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(7),
  ]);

  return {
    conversations: (conversations.data || []) as ConversationRow[],
    leads: (leads.data || []) as LeadRow[],
    drafts: (drafts.data || []) as ReplyDraftRow[],
    followups: (followups.data || []) as FollowupRow[],
    reports: (reports.data || []) as DailyReportRow[],
    errors: errorMessages([
      conversations.error,
      leads.error,
      drafts.error,
      followups.error,
      reports.error,
    ]),
  };
}

export function formatMoney(value: number | null | undefined) {
  return `LKR ${Math.round(Number(value || 0)).toLocaleString("en-US")}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function reportSummaryText(summary: DailyReportRow["summary"]) {
  if (!summary) return "";
  if (typeof summary === "string") return summary;
  return JSON.stringify(summary);
}

export function displayConversationSource(conversation: ConversationRow) {
  const raw = conversation.raw_payload || {};
  const ingestSource = raw.ingest_source || raw.source;
  if (typeof ingestSource === "string" && ingestSource) return ingestSource;
  return conversation.source;
}
