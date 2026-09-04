import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { assertPeopleAiAllowed, peopleAiBudgetErrorMessage } from "./budget";
import { loadPrompt } from "./prompts";
import {
  AI_MODELS,
  extractTokenUsage,
  getOpenAiClient,
  isMockMode,
  isOpenAiConfigured,
  recordAiUsage,
} from "./provider";
import {
  buildExplainUserPayload,
  parseMatchExplanation,
  PEOPLE_MATCH_EXPLAIN_PROMPT_VERSION,
  type ExplainCandidateContext,
  type ExplainJobContext,
  type ExplainScoringContext,
  type MatchExplanation,
  type MatchExplanationErrorCode,
} from "@/lib/people/match-explanation";

export { PEOPLE_MATCH_EXPLAIN_PROMPT_VERSION };

export type ExplainMatchScoreParams = {
  job: ExplainJobContext;
  candidate: ExplainCandidateContext;
  scoring: ExplainScoringContext;
  teamId: string;
  workspaceId?: string | null;
  supabase?: SupabaseClient;
};

export type ExplainMatchScoreSuccess = {
  status: "success";
  explanation: MatchExplanation;
  model: string;
  source: "openai" | "mock";
};

export type ExplainMatchScoreFailure = {
  status: "error";
  error: MatchExplanationErrorCode;
  message: string;
  model: string | null;
};

export type ExplainMatchScoreResult = ExplainMatchScoreSuccess | ExplainMatchScoreFailure;

const MOCK_EXPLANATION: MatchExplanation = {
  summary:
    "Mock advisory summary: candidate skills align with required TypeScript and React; experience fits the job bounds.",
  strengths: ["TypeScript listed in candidate skills", "React listed in candidate skills"],
  gaps: [],
  evidence: ["technical_fit component reflects required skill coverage"],
  concerns: [],
  recommendation: "possible_match",
};

function parseModelJson(
  raw: string,
  dataQuality: ExplainScoringContext["data_quality"],
): MatchExplanation | null {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    const result = parseMatchExplanation(parsed, dataQuality);
    return result.ok ? result.explanation : null;
  } catch {
    return null;
  }
}

/**
 * Explain an already-computed People match score. Never throws for missing AI config;
 * returns a structured error the worker persists on the row.
 */
export async function explainMatchScore(
  params: ExplainMatchScoreParams,
): Promise<ExplainMatchScoreResult> {
  const model = AI_MODELS.PEOPLE_EXPLAIN;

  if (params.supabase) {
    const gate = await assertPeopleAiAllowed(params.supabase, params.teamId);
    if (!gate.allowed) {
      return {
        status: "error",
        error: "budget_exceeded",
        message: peopleAiBudgetErrorMessage(gate),
        model: null,
      };
    }
  }

  if (isMockMode()) {
    const recommendation =
      params.scoring.data_quality === "insufficient"
        ? "insufficient_data"
        : MOCK_EXPLANATION.recommendation;
    return {
      status: "success",
      explanation: { ...MOCK_EXPLANATION, recommendation },
      model,
      source: "mock",
    };
  }

  if (!isOpenAiConfigured()) {
    return {
      status: "error",
      error: "ai_not_configured",
      message: "OPENAI_API_KEY is not set",
      model: null,
    };
  }

  const client = getOpenAiClient();
  if (!client) {
    return {
      status: "error",
      error: "ai_not_configured",
      message: "OpenAI client unavailable",
      model: null,
    };
  }

  const system = loadPrompt("people_match_explanation_prompt.txt");
  const user = buildExplainUserPayload({
    job: params.job,
    candidate: params.candidate,
    scoring: params.scoring,
  });

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const text = completion.choices?.[0]?.message?.content;
    if (!text) {
      return {
        status: "error",
        error: "malformed_output",
        message: "empty model response",
        model,
      };
    }

    const explanation = parseModelJson(text, params.scoring.data_quality);
    if (!explanation) {
      return {
        status: "error",
        error: "malformed_output",
        message: "invalid explanation JSON",
        model,
      };
    }

    if (params.supabase) {
      const { inputTokens, outputTokens } = extractTokenUsage(completion.usage);
      await recordAiUsage(params.supabase, {
        teamId: params.teamId,
        workspaceId: params.workspaceId,
        model,
        operation: "people_explain",
        inputTokens,
        outputTokens,
      });
    }

    return { status: "success", explanation, model, source: "openai" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "provider_error";
    return {
      status: "error",
      error: "provider_error",
      message: message.slice(0, 240),
      model,
    };
  }
}
