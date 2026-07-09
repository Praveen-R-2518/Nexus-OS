export interface Conversation {
  id: string;
  /** Owning workspace; used for ingest + compatibility. */
  workspace_id?: string | null;
  /** Tenant / organization; enforced by RLS. */
  team_id?: string | null;
  source: "gmail" | "email" | "imap" | "demo" | "webhook" | "manual" | "chat" | "form" | "whatsapp" | "instagram" | "facebook";
  customer_name: string;
  customer_email?: string;
  external_thread_id?: string | null;
  external_permalink?: string | null;
  /** Ingest/plain text column from Supabase. */
  message?: string;
  /** Legacy / mock inbox body (prefer `message` when both exist). */
  raw_message?: string;
  intent?:
    | "purchase"
    | "complaint"
    | "churn_risk"
    | "support"
    | "unknown"
    | null;
  urgency?: "critical" | "high" | "medium" | "low" | null;
  estimated_value: number;
  risk_score: number;
  confidence: number;
  status?:
    | "new"
    | "classified"
    | "draft_ready"
    | "approved"
    | "sent"
    | "rejected"
    | "unread"
    | string
    | null;
  created_at: string;
  updated_at: string;
}

export interface ReplyDraft {
  id: string;
  conversation_id: string;
  workspace_id?: string | null;
  team_id?: string | null;
  draft_text: string;
  tone: string;
  approval_status: "pending" | "approved" | "rejected";
  approved_at?: string;
  rejected_at?: string;
  rejection_reason?: string;
  created_at: string;
}

/** Reply draft row with joined conversation fields from GET /api/reply-drafts */
export type ReplyDraftWithConversation = ReplyDraft & {
  conversation: Pick<
    Conversation,
    "customer_name" | "risk_score" | "estimated_value"
  >;
};

export interface Lead {
  id: string;
  conversation_id: string;
  customer_name: string;
  customer_email?: string;
  estimated_value: number;
  stage: "new" | "contacted" | "negotiating" | "won" | "lost";
  created_at: string;
}

export interface DailyReport {
  id: string;
  workspace_id?: string | null;
  team_id?: string | null;
  report_date: string;
  total_revenue_at_risk: number;
  messages_processed: number;
  drafts_approved: number;
  summary_text: string;
  created_at: string;
}

export interface Metrics {
  revenue_at_risk: number;
  hot_leads: number;
  churn_risks: number;
  hours_saved: number;
}
