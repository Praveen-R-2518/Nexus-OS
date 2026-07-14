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

export type MetaChannelPlatform = "whatsapp" | "instagram" | "facebook";

export interface NotificationPrefs {
  buy_back_report_email: boolean;
  high_value_lead_alerts: boolean;
}

export interface MetaChannelStatus {
  connected: boolean;
  page_name: string | null;
  ig_username: string | null;
  wa_display_phone: string | null;
  sync_enabled: boolean;
  last_synced_at: string | null;
  credential_id: string | null;
}

export interface WorkspaceSettings {
  workspace: {
    id: string | null;
    name: string | null;
    industry: string | null;
  };
  business_profile: {
    id: string;
    name: string;
    industry: string;
    tone: string;
    services: string[];
    approval_mode: string;
    pricing_rules: Record<string, unknown>;
    timezone: string | null;
    notification_prefs: NotificationPrefs;
  } | null;
  channels: {
    gmail: {
      connected: boolean;
      email: string | null;
      last_synced_at: string | null;
      sync_enabled: boolean;
      credential_type: string | null;
      credential_id: string | null;
    };
    meta: {
      connected: boolean;
      platforms: Record<MetaChannelPlatform, MetaChannelStatus>;
    };
  };
  social: {
    connected: boolean;
    platforms: string[];
    platform_count: number;
  };
  billing: {
    plan_tier: string | null;
    billing_cycle: string | null;
    status: string | null;
    trial_ends_at: string | null;
    current_period_end: string | null;
    message_count: number;
    message_limit: number | null;
    period_start: string;
    period_end: string;
  };
  security: {
    gmail_credential_present: boolean;
    meta_credentials_count: number;
    tokens_encrypted: boolean;
    user_email: string | null;
  };
  policy: {
    high_value_threshold: number;
    high_risk_score: number;
    thresholds_editable: boolean;
  };
  fields: {
    timezone_supported: boolean;
    currency_from_pricing_rules: string | null;
    notifications_supported: boolean;
    common_timezones: string[];
  };
  editable: {
    workspace_profile: boolean;
    ai_rules: boolean;
    channels: boolean;
  };
}
