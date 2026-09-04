import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ChatLane } from "@/lib/chat/route-lane";
import { matchKnowledge, type EmbeddingKind, type KnowledgeChunk } from "@/lib/embeddings/store";
import {
  CANDIDATE_JOB_STAGES,
  EMPLOYMENT_STATUSES,
  JOB_STATUSES,
  type CandidateJobStage,
  type EmploymentStatus,
  type JobStatus,
} from "@/types";

/**
 * Read-only, tenant-scoped snapshot for the Revenue Analyst chat agent.
 *
 * The agent answers from this structured data AND, when a query is provided, from the tenant's
 * knowledge base (uploaded business docs + chat/inbox summaries) retrieved via pgvector. This
 * module NEVER writes business data; it issues SELECTs scoped by `team_id` and aggregates in JS
 * so the caller can inject a compact object into the system prompt in a single model call.
 *
 * Metric definitions intentionally mirror app/api/metrics/route.ts:
 *   - revenue at risk = Σ estimated_value over non-terminal conversations
 *   - hot leads       = intent purchase AND urgency high|critical
 *   - churn risks      = intent churn_risk
 *
 * People (G1): compact roster / job / candidate stats plus open jobs and stage=`new`
 * applications awaiting review. Candidate names and job titles only — no emails, phones, or notes.
 * J1: when `lane` is people/mixed, retrieval also includes `people_summary` embeddings.
 */

// Terminal conversation statuses are excluded from "at risk" pipeline exposure.
const TERMINAL_STATUSES = new Set(["approved", "sent", "rejected"]);

// Cost-aware caps: the analyst reasons over a compact recent window, not the full table.
const CONVERSATION_SCAN_LIMIT = 500;
const HOT_LEADS_LIMIT = 5;
const CHURN_LIMIT = 5;
const RECENT_CONVERSATIONS_LIMIT = 8;
const MESSAGE_SNIPPET_LEN = 160;
const EMPLOYEE_SCAN_LIMIT = 200;
const JOB_SCAN_LIMIT = 50;
const CANDIDATE_SCAN_LIMIT = 200;
const CANDIDATE_JOB_SCAN_LIMIT = 200;
const OPEN_JOBS_LIMIT = 5;
const AWAITING_REVIEW_LIMIT = 8;

export type UrgencyLevel = "critical" | "high" | "medium" | "low";
export type IntentLabel = "purchase" | "complaint" | "churn_risk" | "support" | "unknown";

export interface AnalystSnapshot {
  generatedAt: string;
  /** True when the tenant has no conversations at all — drives the graceful empty-state prompt. */
  isEmpty: boolean;
  totals: {
    conversations: number;
    revenueAtRisk: number;
    pendingDrafts: number;
    hotLeads: number;
    churnRisks: number;
  };
  byUrgency: Record<UrgencyLevel, number>;
  byIntent: Record<IntentLabel, number>;
  hotLeads: Array<{
    customerName: string;
    estimatedValue: number;
    intent: IntentLabel;
    urgency: UrgencyLevel | null;
    riskScore: number;
  }>;
  churnRisk: Array<{
    customerName: string;
    estimatedValue: number;
    riskScore: number;
    createdAt: string | null;
  }>;
  recentConversations: Array<{
    customerName: string;
    source: string;
    intent: IntentLabel;
    urgency: UrgencyLevel | null;
    estimatedValue: number;
    snippet: string;
    createdAt: string | null;
  }>;
  /** Compact People roster / jobs / candidates. Independent of inbox `isEmpty`. */
  people: PeopleSnapshot;
}

export interface PeopleSnapshot {
  /** True when there are no non-archived employees, jobs, or candidates. */
  isEmpty: boolean;
  totals: {
    employees: number;
    employeesByStatus: Record<EmploymentStatus, number>;
    jobs: number;
    jobsOpen: number;
    jobsByStatus: Record<JobStatus, number>;
    candidates: number;
    applications: number;
    byStage: Record<CandidateJobStage, number>;
    awaitingReview: number;
  };
  openJobs: Array<{
    title: string;
    location: string | null;
    candidateCount: number;
  }>;
  awaitingReview: Array<{
    candidateName: string;
    jobTitle: string;
    stage: "new";
    matchScore: number | null;
    dataQuality: string | null;
  }>;
}

export interface BusinessContext {
  name: string;
  industry: string;
  tone: string;
  services: string[];
  approvalMode: string;
  /** Founder-editable system-message persona; null = use DEFAULT_ANALYST_PERSONA. */
  persona: string | null;
  /** Whether the analyst may render charts/visuals in answers (settings toggle, default on). */
  chatVisualsEnabled: boolean;
}

export interface AnalystContext {
  snapshot: AnalystSnapshot;
  business: BusinessContext | null;
  /** Knowledge-base chunks retrieved for the current query (empty when no query / no matches). */
  knowledge: KnowledgeChunk[];
}

type ConversationRow = {
  customer_name?: string | null;
  source?: string | null;
  status?: string | null;
  intent?: string | null;
  urgency?: string | null;
  estimated_value?: number | string | null;
  risk_score?: number | string | null;
  message?: string | null;
  created_at?: string | null;
};

type DraftRow = { approval_status?: string | null; status?: string | null };

type BusinessRow = {
  name?: string | null;
  industry?: string | null;
  tone?: string | null;
  chat_persona?: string | null;
  services?: unknown;
  approval_mode?: string | null;
  chat_visuals_enabled?: boolean | null;
};

type EmployeeRow = {
  full_name?: string | null;
  employment_status?: string | null;
  archived_at?: string | null;
};

type JobRow = {
  id?: string | null;
  title?: string | null;
  status?: string | null;
  location?: string | null;
  archived_at?: string | null;
};

type CandidateRow = {
  id?: string | null;
  full_name?: string | null;
  archived_at?: string | null;
};

type CandidateJobRow = {
  candidate_id?: string | null;
  job_id?: string | null;
  stage?: string | null;
  match_score?: number | string | null;
  data_quality?: string | null;
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function scoreOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isArchived(archivedAt: unknown): boolean {
  if (archivedAt == null) return false;
  if (typeof archivedAt === "string") return archivedAt.trim().length > 0;
  return true;
}

function zeroCounts<T extends string>(keys: readonly T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const key of keys) out[key] = 0;
  return out;
}

function normalizeEmploymentStatus(value: unknown): EmploymentStatus | null {
  if (
    value === "active" ||
    value === "onboarding" ||
    value === "resignation_pending" ||
    value === "offboarded"
  ) {
    return value;
  }
  return null;
}

function normalizeJobStatus(value: unknown): JobStatus | null {
  if (value === "draft" || value === "open" || value === "closed") {
    return value;
  }
  return null;
}

function normalizeStage(value: unknown): CandidateJobStage | null {
  if (
    value === "new" ||
    value === "shortlisted" ||
    value === "contacted" ||
    value === "decision"
  ) {
    return value;
  }
  return null;
}

function normalizeDataQuality(value: unknown): string | null {
  if (value === "pending" || value === "sufficient" || value === "insufficient") {
    return value;
  }
  return null;
}

function displayName(value: unknown, fallback: string): string {
  const s = typeof value === "string" ? value.trim() : "";
  return s || fallback;
}

function normalizeUrgency(value: unknown): UrgencyLevel | null {
  if (value === "critical" || value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return null;
}

function normalizeIntent(value: unknown): IntentLabel {
  if (
    value === "purchase" ||
    value === "complaint" ||
    value === "churn_risk" ||
    value === "support"
  ) {
    return value;
  }
  return "unknown";
}

function snippet(text: unknown): string {
  const s = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  if (s.length <= MESSAGE_SNIPPET_LEN) return s;
  return `${s.slice(0, MESSAGE_SNIPPET_LEN).trimEnd()}…`;
}

/** The empty People snapshot: no roster, jobs, or candidates. */
export function emptyPeopleSnapshot(): PeopleSnapshot {
  return {
    isEmpty: true,
    totals: {
      employees: 0,
      employeesByStatus: zeroCounts(EMPLOYMENT_STATUSES),
      jobs: 0,
      jobsOpen: 0,
      jobsByStatus: zeroCounts(JOB_STATUSES),
      candidates: 0,
      applications: 0,
      byStage: zeroCounts(CANDIDATE_JOB_STAGES),
      awaitingReview: 0,
    },
    openJobs: [],
    awaitingReview: [],
  };
}

/** The empty snapshot: a tenant with zero conversations. Never throws; drives the "nothing yet" copy. */
export function emptySnapshot(
  generatedAt: string = new Date().toISOString(),
  people: PeopleSnapshot = emptyPeopleSnapshot(),
): AnalystSnapshot {
  return {
    generatedAt,
    isEmpty: true,
    totals: {
      conversations: 0,
      revenueAtRisk: 0,
      pendingDrafts: 0,
      hotLeads: 0,
      churnRisks: 0,
    },
    byUrgency: { critical: 0, high: 0, medium: 0, low: 0 },
    byIntent: { purchase: 0, complaint: 0, churn_risk: 0, support: 0, unknown: 0 },
    hotLeads: [],
    churnRisk: [],
    recentConversations: [],
    people,
  };
}

/**
 * Pure People aggregation over already-fetched, tenant-scoped rows. Exported for unit tests.
 * Archived employees, jobs, and candidates are excluded. Applications must sit on an
 * active candidate AND an active job. Awaiting review is stage `new` only.
 */
export function aggregatePeopleSnapshot(
  employees: EmployeeRow[],
  jobs: JobRow[],
  candidates: CandidateRow[],
  candidateJobs: CandidateJobRow[],
): PeopleSnapshot {
  const employeesByStatus = zeroCounts(EMPLOYMENT_STATUSES);
  const jobsByStatus = zeroCounts(JOB_STATUSES);
  const byStage = zeroCounts(CANDIDATE_JOB_STAGES);

  const activeEmployees = employees.filter((row) => !isArchived(row.archived_at));
  for (const row of activeEmployees) {
    const status = normalizeEmploymentStatus(row.employment_status);
    if (status) employeesByStatus[status] += 1;
  }

  const activeJobs: Array<{
    id: string;
    title: string;
    location: string | null;
    status: JobStatus | null;
  }> = [];
  const jobById = new Map<
    string,
    { title: string; location: string | null; status: JobStatus | null }
  >();
  for (const row of jobs) {
    if (isArchived(row.archived_at)) continue;
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    const status = normalizeJobStatus(row.status);
    if (status) jobsByStatus[status] += 1;
    const title = displayName(row.title, "Untitled job");
    const location =
      typeof row.location === "string" && row.location.trim()
        ? row.location.trim()
        : null;
    activeJobs.push({ id, title, location, status });
    jobById.set(id, { title, location, status });
  }

  const activeCandidates = new Map<string, string>();
  for (const row of candidates) {
    if (isArchived(row.archived_at)) continue;
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    activeCandidates.set(id, displayName(row.full_name, "Unknown"));
  }

  const applicationsOnActive: Array<{
    candidateId: string;
    jobId: string;
    stage: CandidateJobStage;
    matchScore: number | null;
    dataQuality: string | null;
  }> = [];
  const candidateCountByJob = new Map<string, number>();

  for (const row of candidateJobs) {
    const candidateId = typeof row.candidate_id === "string" ? row.candidate_id : "";
    const jobId = typeof row.job_id === "string" ? row.job_id : "";
    if (!candidateId || !jobId) continue;
    if (!activeCandidates.has(candidateId) || !jobById.has(jobId)) continue;
    const stage = normalizeStage(row.stage);
    if (!stage) continue;
    byStage[stage] += 1;
    candidateCountByJob.set(jobId, (candidateCountByJob.get(jobId) ?? 0) + 1);
    applicationsOnActive.push({
      candidateId,
      jobId,
      stage,
      matchScore: scoreOrNull(row.match_score),
      dataQuality: normalizeDataQuality(row.data_quality),
    });
  }

  const openJobs = activeJobs
    .filter((job) => job.status === "open")
    .map((job) => ({
      title: job.title,
      location: job.location,
      candidateCount: candidateCountByJob.get(job.id) ?? 0,
    }))
    .sort((a, b) => {
      if (b.candidateCount !== a.candidateCount) return b.candidateCount - a.candidateCount;
      return a.title.localeCompare(b.title);
    })
    .slice(0, OPEN_JOBS_LIMIT);

  const awaitingReview = applicationsOnActive
    .filter((row) => row.stage === "new")
    .map((row) => ({
      candidateName: activeCandidates.get(row.candidateId) ?? "Unknown",
      jobTitle: jobById.get(row.jobId)?.title ?? "Untitled job",
      stage: "new" as const,
      matchScore: row.matchScore,
      dataQuality: row.dataQuality,
    }))
    .sort((a, b) => {
      if (a.matchScore == null && b.matchScore == null) return 0;
      if (a.matchScore == null) return 1;
      if (b.matchScore == null) return -1;
      return b.matchScore - a.matchScore;
    })
    .slice(0, AWAITING_REVIEW_LIMIT);

  const employeesCount = activeEmployees.length;
  const jobsCount = activeJobs.length;
  const candidatesCount = activeCandidates.size;
  const isEmpty = employeesCount === 0 && jobsCount === 0 && candidatesCount === 0;

  return {
    isEmpty,
    totals: {
      employees: employeesCount,
      employeesByStatus,
      jobs: jobsCount,
      jobsOpen: jobsByStatus.open,
      jobsByStatus,
      candidates: candidatesCount,
      applications: applicationsOnActive.length,
      byStage,
      awaitingReview: byStage.new,
    },
    openJobs,
    awaitingReview,
  };
}

/**
 * Pure aggregation over already-fetched, tenant-scoped rows. Exported for direct unit testing.
 */
export function aggregateSnapshot(
  conversations: ConversationRow[],
  drafts: DraftRow[],
  generatedAt: string = new Date().toISOString(),
  people: PeopleSnapshot = emptyPeopleSnapshot(),
): AnalystSnapshot {
  if (conversations.length === 0) {
    const empty = emptySnapshot(generatedAt, people);
    // A tenant can have pending drafts even with the scan window empty; still surface them.
    empty.totals.pendingDrafts = drafts.filter(
      (d) => (d.approval_status ?? d.status) === "pending",
    ).length;
    return empty;
  }

  const byUrgency: Record<UrgencyLevel, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  const byIntent: Record<IntentLabel, number> = {
    purchase: 0,
    complaint: 0,
    churn_risk: 0,
    support: 0,
    unknown: 0,
  };

  let revenueAtRisk = 0;
  let hotLeadsCount = 0;
  let churnRisksCount = 0;

  const normalized = conversations.map((c) => {
    const urgency = normalizeUrgency(c.urgency);
    const intent = normalizeIntent(c.intent);
    const estimatedValue = num(c.estimated_value);
    const riskScore = num(c.risk_score);
    const status = typeof c.status === "string" ? c.status : "";

    if (urgency) byUrgency[urgency] += 1;
    byIntent[intent] += 1;

    if (!TERMINAL_STATUSES.has(status)) {
      revenueAtRisk += estimatedValue;
    }
    if (intent === "purchase" && (urgency === "high" || urgency === "critical")) {
      hotLeadsCount += 1;
    }
    if (intent === "churn_risk") churnRisksCount += 1;

    return {
      customerName: (c.customer_name ?? "").trim() || "Unknown",
      source: (typeof c.source === "string" && c.source) || "unknown",
      status,
      intent,
      urgency,
      estimatedValue,
      riskScore,
      snippet: snippet(c.message),
      createdAt: typeof c.created_at === "string" ? c.created_at : null,
    };
  });

  const hotLeads = normalized
    .filter((c) => c.estimatedValue > 0 && !TERMINAL_STATUSES.has(c.status))
    .sort((a, b) => b.estimatedValue - a.estimatedValue)
    .slice(0, HOT_LEADS_LIMIT)
    .map((c) => ({
      customerName: c.customerName,
      estimatedValue: c.estimatedValue,
      intent: c.intent,
      urgency: c.urgency,
      riskScore: c.riskScore,
    }));

  const churnRisk = normalized
    .filter((c) => c.intent === "churn_risk")
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, CHURN_LIMIT)
    .map((c) => ({
      customerName: c.customerName,
      estimatedValue: c.estimatedValue,
      riskScore: c.riskScore,
      createdAt: c.createdAt,
    }));

  const recentConversations = normalized
    .slice(0, RECENT_CONVERSATIONS_LIMIT)
    .map((c) => ({
      customerName: c.customerName,
      source: c.source,
      intent: c.intent,
      urgency: c.urgency,
      estimatedValue: c.estimatedValue,
      snippet: c.snippet,
      createdAt: c.createdAt,
    }));

  return {
    generatedAt,
    isEmpty: false,
    totals: {
      conversations: conversations.length,
      revenueAtRisk,
      pendingDrafts: drafts.filter((d) => (d.approval_status ?? d.status) === "pending")
        .length,
      hotLeads: hotLeadsCount,
      churnRisks: churnRisksCount,
    },
    byUrgency,
    byIntent,
    hotLeads,
    churnRisk,
    recentConversations,
    people,
  };
}

function parseServices(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((s) => (typeof s === "string" ? s.trim() : typeof s === "object" && s ? String((s as { name?: unknown }).name ?? "").trim() : ""))
      .filter((s) => s.length > 0)
      .slice(0, 12);
  }
  return [];
}

/**
 * Lane-aware RAG kinds. Omitting `lane` in buildAnalystContext keeps the default
 * (no people_summary) so n8n and older callers cannot pull People embeddings.
 */
export function knowledgeKindsForLane(lane: ChatLane): EmbeddingKind[] {
  switch (lane) {
    case "people":
      return ["business_doc", "summary", "people_summary"];
    case "mixed":
      return ["business_doc", "summary", "conversation", "people_summary"];
    case "revenue":
      return ["business_doc", "summary", "conversation"];
    case "smalltalk":
      return ["business_doc", "summary"];
    default: {
      const _exhaustive: never = lane;
      return _exhaustive;
    }
  }
}

/**
 * Build the full analyst context (snapshot + business profile) for a tenant.
 *
 * READ-ONLY: only SELECTs, every one scoped by `team_id`. The passed `supabase` client is the
 * caller's RLS-scoped route-handler client, so tenant isolation is enforced twice (explicit
 * `.eq('team_id', ...)` + RLS). Never fabricates data — an empty tenant yields the empty snapshot.
 */
export async function buildAnalystContext(params: {
  supabase: SupabaseClient;
  teamId: string;
  /** The founder's current message — embedded to retrieve relevant knowledge-base chunks. */
  queryText?: string;
  /** I1 lane. When set, retrieval includes people_summary only on people/mixed. */
  lane?: ChatLane;
}): Promise<AnalystContext> {
  const { supabase, teamId, queryText, lane } = params;
  const generatedAt = new Date().toISOString();

  const [
    conversationsResult,
    draftsResult,
    businessResult,
    employeesResult,
    jobsResult,
    candidatesResult,
    candidateJobsResult,
  ] = await Promise.all([
    supabase
      .from("conversations")
      .select(
        "customer_name, source, status, intent, urgency, estimated_value, risk_score, message, created_at",
      )
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(CONVERSATION_SCAN_LIMIT),
    supabase
      .from("reply_drafts")
      .select("approval_status, status")
      .eq("team_id", teamId)
      .limit(CONVERSATION_SCAN_LIMIT),
    supabase
      .from("business_profiles")
      .select(
        "name, industry, tone, chat_persona, services, approval_mode, chat_visuals_enabled",
      )
      .eq("team_id", teamId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("employees")
      .select("full_name, employment_status, archived_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(EMPLOYEE_SCAN_LIMIT),
    supabase
      .from("jobs")
      .select("id, title, status, location, archived_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(JOB_SCAN_LIMIT),
    supabase
      .from("candidates")
      .select("id, full_name, archived_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(CANDIDATE_SCAN_LIMIT),
    supabase
      .from("candidate_jobs")
      .select("candidate_id, job_id, stage, match_score, data_quality")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(CANDIDATE_JOB_SCAN_LIMIT),
  ]);

  if (conversationsResult.error) throw new Error(conversationsResult.error.message);
  if (draftsResult.error) throw new Error(draftsResult.error.message);
  if (employeesResult.error) throw new Error(employeesResult.error.message);
  if (jobsResult.error) throw new Error(jobsResult.error.message);
  if (candidatesResult.error) throw new Error(candidatesResult.error.message);
  if (candidateJobsResult.error) throw new Error(candidateJobsResult.error.message);

  const conversations = (conversationsResult.data ?? []) as ConversationRow[];
  const drafts = (draftsResult.data ?? []) as DraftRow[];
  const people = aggregatePeopleSnapshot(
    (employeesResult.data ?? []) as EmployeeRow[],
    (jobsResult.data ?? []) as JobRow[],
    (candidatesResult.data ?? []) as CandidateRow[],
    (candidateJobsResult.data ?? []) as CandidateJobRow[],
  );

  const snapshot = aggregateSnapshot(conversations, drafts, generatedAt, people);

  let business: BusinessContext | null = null;
  const bizRow = (businessResult?.data ?? null) as BusinessRow | null;
  if (bizRow && (bizRow.name || bizRow.industry)) {
    business = {
      name: (bizRow.name ?? "").trim() || "This business",
      industry: (bizRow.industry ?? "").trim() || "Unknown",
      tone: (bizRow.tone ?? "").trim() || "warm, concise, founder-led",
      services: parseServices(bizRow.services),
      approvalMode: (bizRow.approval_mode ?? "").trim() || "approval_queue",
      persona: (bizRow.chat_persona ?? "").trim() || null,
      chatVisualsEnabled: bizRow.chat_visuals_enabled !== false,
    };
  }

  // Retrieve knowledge-base chunks relevant to the query. Best-effort: matchKnowledge swallows
  // its own errors and returns [] (missing RPC, no OPENAI key, fake test client, etc.).
  // Lane-aware kinds: people_summary is only requested when the caller passes a people/mixed lane.
  const knowledge = queryText
    ? await matchKnowledge({
        supabase,
        teamId,
        queryText,
        ...(lane !== undefined ? { kinds: knowledgeKindsForLane(lane) } : {}),
      })
    : [];

  return { snapshot, business, knowledge };
}
