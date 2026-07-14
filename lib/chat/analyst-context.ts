import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { matchKnowledge, type KnowledgeChunk } from "@/lib/embeddings/store";

/**
 * Read-only, tenant-scoped "inbox snapshot" for the Revenue Analyst chat agent.
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
 */

// Terminal conversation statuses are excluded from "at risk" pipeline exposure.
const TERMINAL_STATUSES = new Set(["approved", "sent", "rejected"]);

// Cost-aware caps: the analyst reasons over a compact recent window, not the full table.
const CONVERSATION_SCAN_LIMIT = 500;
const HOT_LEADS_LIMIT = 5;
const CHURN_LIMIT = 5;
const RECENT_CONVERSATIONS_LIMIT = 8;
const MESSAGE_SNIPPET_LEN = 160;

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
}

export interface BusinessContext {
  name: string;
  industry: string;
  tone: string;
  services: string[];
  approvalMode: string;
  /** Founder-editable system-message persona; null = use DEFAULT_ANALYST_PERSONA. */
  persona: string | null;
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
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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

/** The empty snapshot: a tenant with zero conversations. Never throws; drives the "nothing yet" copy. */
export function emptySnapshot(generatedAt: string = new Date().toISOString()): AnalystSnapshot {
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
  };
}

/**
 * Pure aggregation over already-fetched, tenant-scoped rows. Exported for direct unit testing.
 */
export function aggregateSnapshot(
  conversations: ConversationRow[],
  drafts: DraftRow[],
  generatedAt: string = new Date().toISOString(),
): AnalystSnapshot {
  if (conversations.length === 0) {
    const empty = emptySnapshot(generatedAt);
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
}): Promise<AnalystContext> {
  const { supabase, teamId, queryText } = params;
  const generatedAt = new Date().toISOString();

  const [conversationsResult, draftsResult, businessResult] = await Promise.all([
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
      .select("name, industry, tone, chat_persona, services, approval_mode")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (conversationsResult.error) throw new Error(conversationsResult.error.message);
  if (draftsResult.error) throw new Error(draftsResult.error.message);

  const conversations = (conversationsResult.data ?? []) as ConversationRow[];
  const drafts = (draftsResult.data ?? []) as DraftRow[];

  const snapshot = aggregateSnapshot(conversations, drafts, generatedAt);

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
    };
  }

  // Retrieve knowledge-base chunks relevant to the query. Best-effort: matchKnowledge swallows
  // its own errors and returns [] (missing RPC, no OPENAI key, fake test client, etc.).
  const knowledge = queryText
    ? await matchKnowledge({ supabase, teamId, queryText })
    : [];

  return { snapshot, business, knowledge };
}
