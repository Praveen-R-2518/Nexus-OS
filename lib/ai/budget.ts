import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type PeopleAiBudgetAllowed = {
  allowed: true;
  used: number;
  budget: number | null;
};

export type PeopleAiBudgetBlocked = {
  allowed: false;
  used: number;
  budget: number;
};

export type PeopleAiBudgetDecision = PeopleAiBudgetAllowed | PeopleAiBudgetBlocked;

const USAGE_ROW_CAP = 5000;

function utcMonthStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function sumTokens(
  rows: Array<{ input_tokens?: unknown; output_tokens?: unknown }>,
): number {
  let total = 0;
  for (const row of rows) {
    total += typeof row.input_tokens === "number" ? row.input_tokens : 0;
    total += typeof row.output_tokens === "number" ? row.output_tokens : 0;
  }
  return total;
}

function peopleBudgetMessage(used: number, budget: number): string {
  return `People AI is paused: monthly token budget reached (${used}/${budget}). Chat and Revenue send are not blocked. Raise the budget in Profile → AI & Approval Rules.`;
}

/**
 * Hard-stop for People AI only (match explain, People email draft, people_summary embed).
 * NULL budget = no cap. Lookup failures fail open so a telemetry outage cannot brick matching.
 */
export async function assertPeopleAiAllowed(
  supabase: SupabaseClient,
  teamId: string,
): Promise<PeopleAiBudgetDecision> {
  try {
    const monthStart = utcMonthStart();
    const [usageResult, profileResult] = await Promise.all([
      supabase
        .from("ai_usage")
        .select("input_tokens, output_tokens")
        .eq("team_id", teamId)
        .gte("created_at", monthStart)
        .limit(USAGE_ROW_CAP),
      supabase
        .from("business_profiles")
        .select("ai_monthly_token_budget")
        .eq("team_id", teamId)
        .limit(1)
        .maybeSingle(),
    ]);

    if (usageResult.error) {
      return { allowed: true, used: 0, budget: null };
    }

    const used = sumTokens(
      (usageResult.data ?? []) as Array<{
        input_tokens?: unknown;
        output_tokens?: unknown;
      }>,
    );
    const budgetRaw = (
      profileResult.data as { ai_monthly_token_budget?: unknown } | null
    )?.ai_monthly_token_budget;
    const budget =
      typeof budgetRaw === "number" && Number.isFinite(budgetRaw) && budgetRaw >= 0
        ? Math.floor(budgetRaw)
        : null;

    if (budget === null) {
      return { allowed: true, used, budget: null };
    }
    if (used >= budget) {
      return { allowed: false, used, budget };
    }
    return { allowed: true, used, budget };
  } catch {
    return { allowed: true, used: 0, budget: null };
  }
}

export function peopleAiBudgetErrorMessage(decision: PeopleAiBudgetBlocked): string {
  return peopleBudgetMessage(decision.used, decision.budget);
}
