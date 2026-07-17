import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPrompt } from "./prompts";
import {
  AI_MODELS,
  extractTokenUsage,
  getOpenAiClient,
  isMockMode,
  recordAiUsage,
} from "./provider";

export type ReportSummaryStyle = "brief" | "markdown";

export type ReportSummaryParams = {
  /** Free-form daily stats payload (field names vary by caller — WF4/WF5 use slightly different keys). */
  stats: Record<string, unknown>;
  /** "brief" = 3-4 plain-language sentences (daily brief). "markdown" = full 7-section report (`ai_prompts/buy_back_report_prompt.txt`). */
  style?: ReportSummaryStyle;
  teamId?: string;
  workspaceId?: string | null;
  supabase?: SupabaseClient;
};

export type ReportSummaryResponse = {
  summary: string;
  source: "openai" | "fallback";
  model?: string;
};

const BRIEF_SYSTEM_PROMPT =
  "You write a short, plain-language daily brief for a founder. 3-4 sentences, no markdown, " +
  "no preamble. Mention revenue at risk, hot leads, churn risks, reply drafts prepared, and " +
  "follow-ups scheduled (using only values present in the input), then end with one concrete " +
  "next action. Never invent numbers not present in the input.";

/** First present key among aliases, so WF4 and WF5's differently-named stats fields both resolve. */
function pick(stats: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (stats[key] !== undefined && stats[key] !== null) return stats[key];
  }
  return undefined;
}

/**
 * Deterministic, no-AI daily brief built directly from the stats payload. Used whenever OpenAI
 * is not configured, or the live call fails — always labelled `source: 'fallback'` so callers
 * never mistake it for a real model summary.
 */
function buildFallbackSummary(stats: Record<string, unknown>): string {
  const business = pick(stats, "business_name") ?? "Your business";
  const date = pick(stats, "date", "report_date") ?? "today";
  const totalConversations = Number(pick(stats, "total_conversations")) || 0;
  const revenueAtRisk = pick(stats, "revenue_at_risk") ?? 0;
  const repliesDrafted =
    Number(pick(stats, "reply_drafts_created", "replies_drafted")) || 0;
  const repliesApproved = Number(pick(stats, "replies_approved")) || 0;
  const followupsScheduled =
    Number(pick(stats, "follow_ups_scheduled", "followups_scheduled")) || 0;
  const hoursSaved = pick(stats, "estimated_hours_saved", "hours_saved") ?? 0;
  const hotLeads = Number(pick(stats, "hot_leads", "hot_leads_count")) || 0;
  const churnRisks = Number(pick(stats, "churn_risks", "churn_risks_count")) || 0;

  const parts = [
    `${business} daily brief for ${date}: ${totalConversations} conversation(s) processed, ${revenueAtRisk} revenue at risk.`,
    `${repliesDrafted} reply draft(s) prepared${
      repliesApproved ? ` and ${repliesApproved} approved` : ""
    }, ${followupsScheduled} follow-up(s) scheduled, saving about ${hoursSaved} hours.`,
  ];
  if (hotLeads || churnRisks) {
    parts.push(`${hotLeads} hot lead(s) and ${churnRisks} churn risk(s) still need attention.`);
  }
  parts.push("Not enough data yet for further detail — AI summary is not configured.");
  return parts.join(" ");
}

/**
 * Summarize daily stats into a founder-facing brief. Never throws: when OpenAI is not
 * configured (or the live call fails), returns a deterministic fallback labelled
 * `source: 'fallback'` rather than silently failing or faking a successful AI response.
 */
export async function summarizeReport(
  params: ReportSummaryParams,
): Promise<ReportSummaryResponse> {
  const model = AI_MODELS.REPORT;
  const style = params.style ?? "brief";

  if (isMockMode()) {
    return {
      summary: "Mock daily brief fixture for CI/tests. Revenue at risk and hot leads reviewed.",
      source: "openai",
      model,
    };
  }

  const client = getOpenAiClient();
  if (!client) {
    return { summary: buildFallbackSummary(params.stats), source: "fallback" };
  }

  try {
    const system = style === "markdown" ? loadPrompt("buy_back_report_prompt.txt") : BRIEF_SYSTEM_PROMPT;
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.3,
      max_tokens: style === "brief" ? 220 : undefined,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content:
            style === "markdown"
              ? `Here are the metrics JSON for today's Buy-Back Report. Use only these values.\n\n${JSON.stringify(params.stats, null, 2)}`
              : JSON.stringify(params.stats, null, 2),
        },
      ],
    });

    const text = completion.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("summarizeReport: empty model response");

    if (params.supabase && params.teamId) {
      const { inputTokens, outputTokens } = extractTokenUsage(completion.usage);
      await recordAiUsage(params.supabase, {
        teamId: params.teamId,
        workspaceId: params.workspaceId,
        model,
        operation: "report_summary",
        inputTokens,
        outputTokens,
      });
    }

    return { summary: text, source: "openai", model };
  } catch {
    return { summary: buildFallbackSummary(params.stats), source: "fallback" };
  }
}
