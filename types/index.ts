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

export type MetricsTimeseriesRange = "week" | "month" | "6m" | "year" | "all";

export interface MetricsTimeseriesPoint {
  date: string;
  revenue_at_risk: number;
  hot_leads: number;
  churn_risks: number;
}

export interface MetricsTimeseries {
  range: MetricsTimeseriesRange;
  points: MetricsTimeseriesPoint[];
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

/** Current-month AI token usage summary (GET /api/ai-usage). */
export interface AiUsageSummary {
  month_start: string;
  total_tokens: number;
  /** Monthly AI budget in total tokens; null = no cap. People AI pauses at 100%. */
  budget: number | null;
  rows: Array<{
    workflow_name: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  }>;
}

export interface WorkspaceSettings {
  account: {
    full_name: string | null;
    email: string | null;
  };
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
    chat_persona: string | null;
    services: string[];
    approval_mode: string;
    pricing_rules: Record<string, unknown>;
    timezone: string | null;
    notification_prefs: NotificationPrefs;
    /** Revenue Analyst may render charts in chat (uses more tokens). Default true. */
    chat_visuals_enabled: boolean;
    /** Monthly AI budget in total tokens; null = no cap. People AI pauses at 100%. */
    ai_monthly_token_budget: number | null;
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

export const EMPLOYMENT_STATUSES = [
  "active",
  "onboarding",
  "resignation_pending",
  "offboarded",
] as const;

export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

/** A row from `employees` (People roster). Soft-archive via `archived_at`. */
export interface Employee {
  id: string;
  team_id: string;
  workspace_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_title: string | null;
  employment_status: EmploymentStatus;
  started_on: string | null;
  ended_on: string | null;
  location: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export const JOB_STATUSES = ["draft", "open", "closed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const REMOTE_POLICIES = [
  "onsite",
  "hybrid",
  "remote",
  "flexible",
] as const;
export type RemotePolicy = (typeof REMOTE_POLICIES)[number];

export const SCORING_WEIGHT_KEYS = [
  "technical_fit",
  "experience_fit",
  "seniority_fit",
  "location_fit",
  "nice_to_have",
  "data_quality",
] as const;
export type ScoringWeightKey = (typeof SCORING_WEIGHT_KEYS)[number];
export type ScoringWeights = Record<ScoringWeightKey, number>;

/** A row from `jobs` (open roles). Soft-archive via `archived_at`. */
export interface Job {
  id: string;
  team_id: string;
  workspace_id: string | null;
  title: string;
  description: string | null;
  status: JobStatus;
  required_skills: string[];
  preferred_skills: string[];
  experience_min_years: number | null;
  experience_max_years: number | null;
  seniority: string | null;
  location: string | null;
  remote_policy: RemotePolicy | null;
  scoring_weights: ScoringWeights;
  scoring_weights_version: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export const CONSENT_STATUSES = [
  "owner_imported",
  "candidate_applied",
  "unknown",
] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

/** Consent values allowed when the founder pastes one GitHub profile (H2). */
export const GITHUB_IMPORT_CONSENT_STATUSES = [
  "owner_imported",
  "unknown",
] as const;
export type GithubImportConsentStatus =
  (typeof GITHUB_IMPORT_CONSENT_STATUSES)[number];

/** Closed CandidateSource adapter ids (H1). Unknown ids fail closed. */
export const CANDIDATE_SOURCE_IDS = ["manual", "csv", "github"] as const;
export type CandidateSourceId = (typeof CANDIDATE_SOURCE_IDS)[number];

/** A row from `candidates` (founder-owned). Soft-archive via `archived_at`. */
export interface Candidate {
  id: string;
  team_id: string;
  workspace_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  headline: string | null;
  current_role: string | null;
  experience_years: number | null;
  skills: string[];
  location: string | null;
  source: string | null;
  source_url: string | null;
  source_metadata: Record<string, unknown>;
  consent_status: ConsentStatus;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}


export const CANDIDATE_JOB_STAGES = [
  "new",
  "shortlisted",
  "contacted",
  "decision",
] as const;
export type CandidateJobStage = (typeof CANDIDATE_JOB_STAGES)[number];

export type CandidateJobStageCounts = Record<CandidateJobStage, number>;

/** Workspace member that may be set as `candidate_jobs.assigned_to`. */
export type TeamAssignee = {
  id: string;
  full_name: string | null;
};

export const CANDIDATE_JOB_DATA_QUALITIES = [
  "pending",
  "sufficient",
  "insufficient",
] as const;
export type CandidateJobDataQuality = (typeof CANDIDATE_JOB_DATA_QUALITIES)[number];

export const MATCH_RECOMMENDATIONS = [
  "strong_match",
  "possible_match",
  "weak_match",
  "insufficient_data",
] as const;
export type MatchRecommendation = (typeof MATCH_RECOMMENDATIONS)[number];

export type MatchExplanation = {
  summary: string;
  strengths: string[];
  gaps: string[];
  evidence: string[];
  concerns: string[];
  recommendation: MatchRecommendation;
};

export type MatchExplanationError = {
  error: "malformed_output" | "ai_not_configured" | "provider_error";
  message: string;
};

/** A row from `candidate_jobs` (application + scoring columns). */
export interface CandidateJob {
  id: string;
  team_id: string;
  workspace_id: string | null;
  candidate_id: string;
  job_id: string;
  stage: CandidateJobStage;
  match_score: number | null;
  match_components: unknown | null;
  match_weights_used: {
    weights: ScoringWeights;
    weights_version: number;
  } | null;
  scoring_version: string | null;
  data_quality: CandidateJobDataQuality;
  insufficient_reason: string | null;
  ai_explanation: MatchExplanation | MatchExplanationError | null;
  ai_model: string | null;
  ai_prompt_version: string | null;
  manual_rank_override: number | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

/** Candidate identity fields joined onto a job application list row (D5). */
export type JobCandidateCandidateSummary = {
  id: string;
  full_name: string;
  headline: string | null;
  current_role: string | null;
  location: string | null;
  source: string | null;
  source_url: string | null;
  consent_status: ConsentStatus;
  notes_preview: string | null;
};

/** Ranked application row for the job dashboard (D5). */
export type JobCandidateListItem = {
  id: string;
  candidate_id: string;
  job_id: string;
  stage: CandidateJobStage;
  match_score: number | null;
  match_components: Array<{
    key: ScoringWeightKey;
    raw: number;
    weight: number;
    contribution: number;
    evidence: Array<{ field: string; value: string; note: string }>;
  }> | null;
  match_weights_used: CandidateJob["match_weights_used"];
  scoring_version: string | null;
  data_quality: CandidateJobDataQuality;
  insufficient_reason: string | null;
  ai_explanation: MatchExplanation | MatchExplanationError | null;
  ai_model: string | null;
  ai_prompt_version: string | null;
  manual_rank_override: number | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  candidate: JobCandidateCandidateSummary;
};

export const PEOPLE_EMAIL_RECIPIENT_TYPES = ["employee", "candidate"] as const;
export type PeopleEmailRecipientType =
  (typeof PEOPLE_EMAIL_RECIPIENT_TYPES)[number];

export const PEOPLE_EMAIL_TONES = [
  "professional",
  "warm",
  "concise",
  "formal",
] as const;
export type PeopleEmailTone = (typeof PEOPLE_EMAIL_TONES)[number];

export const PEOPLE_EMAIL_PURPOSES = [
  "follow_up",
  "scheduling",
  "outreach",
  "interview_invite",
  "operational_update",
  "other",
] as const;
export type PeopleEmailPurpose = (typeof PEOPLE_EMAIL_PURPOSES)[number];

export const PEOPLE_MESSAGE_DRAFT_STATUSES = [
  "draft",
  "sent",
  "discarded",
] as const;
export type PeopleMessageDraftStatus =
  (typeof PEOPLE_MESSAGE_DRAFT_STATUSES)[number];

export const PEOPLE_EMAIL_TRANSPORTS = ["gmail", "smtp", "sandbox"] as const;
export type PeopleEmailTransport = (typeof PEOPLE_EMAIL_TRANSPORTS)[number];

/** A row from `people_message_drafts` (People composer; send is explicit). */
export interface PeopleMessageDraft {
  id: string;
  team_id: string;
  workspace_id: string | null;
  recipient_type: PeopleEmailRecipientType;
  employee_id: string | null;
  candidate_id: string | null;
  recipient_name: string | null;
  recipient_email: string;
  purpose: PeopleEmailPurpose | null;
  tone: PeopleEmailTone | null;
  situation: string | null;
  facts: string[];
  related_date: string | null;
  subject: string;
  body: string;
  status: PeopleMessageDraftStatus;
  sent_at: string | null;
  provider_message_id: string | null;
  transport: PeopleEmailTransport | null;
  ai_model: string | null;
  ai_prompt_version: string | null;
  ai_metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const PEOPLE_EMAIL_FOLLOW_UP_KINDS = [
  "set_employment_status",
  "set_candidate_job_stage",
] as const;
export type PeopleEmailFollowUpKind =
  (typeof PEOPLE_EMAIL_FOLLOW_UP_KINDS)[number];

export const PEOPLE_EMAIL_FOLLOW_UP_EMPLOYMENT_STATUSES = [
  "resignation_pending",
  "offboarded",
] as const;
export type PeopleEmailFollowUpEmploymentStatus =
  (typeof PEOPLE_EMAIL_FOLLOW_UP_EMPLOYMENT_STATUSES)[number];

export const PEOPLE_EMAIL_FOLLOW_UP_STAGE = "contacted" as const;
export type PeopleEmailFollowUpStage = typeof PEOPLE_EMAIL_FOLLOW_UP_STAGE;

export type PeopleEmailFollowUpProposal =
  | {
      kind: "set_employment_status";
      employee_id: string;
      from_status: EmploymentStatus;
      employment_status: PeopleEmailFollowUpEmploymentStatus;
    }
  | {
      kind: "set_candidate_job_stage";
      candidate_job_id: string;
      candidate_id: string;
      job_id: string;
      job_title: string;
      from_stage: CandidateJobStage;
      stage: PeopleEmailFollowUpStage;
    };

export type PeopleEmailFollowUpList = {
  draft_id: string;
  proposals: PeopleEmailFollowUpProposal[];
};

export type PeopleEmailFollowUpApplyResult = {
  draft_id: string;
  kind: PeopleEmailFollowUpKind;
  skipped: boolean;
  employee: Employee | null;
  candidate_job: JobCandidateListItem | null;
};

export const CHAT_PROPOSED_ACTION_KINDS = [
  "set_pipeline_stage",
  "set_employment_status",
] as const;
export type ChatProposedActionKind =
  (typeof CHAT_PROPOSED_ACTION_KINDS)[number];

export const CHAT_PROPOSED_ACTION_STATUSES = [
  "pending",
  "confirmed",
  "cancelled",
  "expired",
  "failed",
] as const;
export type ChatProposedActionStatus =
  (typeof CHAT_PROPOSED_ACTION_STATUSES)[number];

export const CHAT_ACTION_DECISIONS = ["confirm", "cancel"] as const;
export type ChatActionDecision = (typeof CHAT_ACTION_DECISIONS)[number];

export type ChatProposedEmploymentPayload = {
  employee_id: string;
  employee_name: string;
  from_status: EmploymentStatus;
  employment_status: EmploymentStatus;
};

export type ChatProposedPipelinePayload = {
  candidate_job_id: string;
  candidate_id: string;
  job_id: string;
  candidate_name: string;
  job_title: string;
  from_stage: CandidateJobStage;
  stage: CandidateJobStage;
};

export type ChatProposedActionPayload =
  | ChatProposedEmploymentPayload
  | ChatProposedPipelinePayload;

/** Public Chat confirmation card. Entity UUIDs stay on the server row. */
export type ChatProposedAction = {
  id: string;
  kind: ChatProposedActionKind;
  status: ChatProposedActionStatus;
  summary: string;
  subject_name: string;
  job_title: string | null;
  from_label: string;
  to_label: string;
  requires_destructive_confirm: boolean;
  error: string | null;
  created_at: string;
  confirmed_at: string | null;
};

/** A row from `workflow_logs` (n8n observability, restored by migration 20260713160000). */
export interface WorkflowLogRow {
  id: string;
  workflow_name: string;
  step: string;
  result: "success" | "error" | "skipped" | "retry" | string;
  payload: Record<string, unknown>;
  error: string | null;
  timestamp: string;
  created_at: string;
}
