export interface Conversation {
  id: string;
  source: "gmail" | "email" | "imap" | "webhook" | "manual" | "chat" | "form";
  customer_name: string;
  customer_email?: string;
  /** Ingest/plain text column from Supabase. */
  message?: string;
  /** Legacy inbox body (prefer `message` when both exist). */
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

/** Matches `public.workflow_logs` (see supabase/migrations/0001_initial_schema.sql). */
export interface WorkflowLog {
  id: string;
  workflow_name: string;
  step: string;
  /** Outcome label from workflows (e.g. success, failed, running). */
  result: string;
  payload: Record<string, unknown>;
  error: string | null;
  timestamp: string;
  created_at?: string;
}

export interface DailyReport {
  id: string;
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
