export interface Conversation {
  id: string;
  source: "email" | "whatsapp" | "chat" | "form";
  customer_name: string;
  customer_email?: string;
  raw_message: string;
  intent: "purchase" | "complaint" | "churn_risk" | "support" | "unknown";
  urgency: "critical" | "high" | "medium" | "low";
  estimated_value: number;
  risk_score: number;
  confidence: number;
  status:
    | "new"
    | "classified"
    | "draft_ready"
    | "approved"
    | "sent"
    | "rejected";
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

export interface Lead {
  id: string;
  conversation_id: string;
  customer_name: string;
  customer_email?: string;
  estimated_value: number;
  stage: "new" | "contacted" | "negotiating" | "won" | "lost";
  created_at: string;
}

export interface WorkflowLog {
  id: string;
  workflow_name: string;
  status: "success" | "failed" | "running";
  trigger: string;
  duration_ms?: number;
  error_message?: string;
  created_at: string;
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
