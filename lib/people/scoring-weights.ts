import {
  SCORING_WEIGHT_KEYS,
  type ScoringWeightKey,
  type ScoringWeights,
} from "@/types";

export const WEIGHT_SUM_EPSILON = 1e-6;

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  technical_fit: 0.4,
  experience_fit: 0.25,
  seniority_fit: 0.15,
  location_fit: 0.05,
  nice_to_have: 0.1,
  data_quality: 0.05,
};

export type ScoringWeightsOk = { ok: true; weights: ScoringWeights };
export type ScoringWeightsErr = { ok: false; error: string };

function isWeightKey(value: string): value is ScoringWeightKey {
  return (SCORING_WEIGHT_KEYS as readonly string[]).includes(value);
}

export function sumWeights(weights: ScoringWeights): number {
  return SCORING_WEIGHT_KEYS.reduce((total, key) => total + weights[key], 0);
}

export function validateScoringWeights(
  value: unknown,
): ScoringWeightsOk | ScoringWeightsErr {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "scoring_weights must be an object" };
  }

  const raw = value as Record<string, unknown>;
  const incoming = Object.keys(raw);
  const extra = incoming.filter((key) => !isWeightKey(key));
  if (extra.length > 0) {
    return {
      ok: false,
      error: `Unexpected scoring_weights keys: ${extra.join(", ")}`,
    };
  }

  const missing = SCORING_WEIGHT_KEYS.filter((key) => !(key in raw));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing scoring_weights keys: ${missing.join(", ")}`,
    };
  }

  const weights = {} as ScoringWeights;
  for (const key of SCORING_WEIGHT_KEYS) {
    const entry = raw[key];
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      return {
        ok: false,
        error: `scoring_weights.${key} must be a number between 0 and 1`,
      };
    }
    if (entry < 0 || entry > 1) {
      return {
        ok: false,
        error: `scoring_weights.${key} must be a number between 0 and 1`,
      };
    }
    weights[key] = entry;
  }

  const sum = sumWeights(weights);
  if (Math.abs(sum - 1) > WEIGHT_SUM_EPSILON) {
    return { ok: false, error: "scoring_weights must sum to 1.0" };
  }

  return { ok: true, weights };
}

export function parseStoredWeights(value: unknown): ScoringWeights | null {
  const parsed = validateScoringWeights(value);
  return parsed.ok ? parsed.weights : null;
}

export function weightsChanged(a: ScoringWeights, b: ScoringWeights): boolean {
  return SCORING_WEIGHT_KEYS.some(
    (key) => Math.abs(a[key] - b[key]) > WEIGHT_SUM_EPSILON,
  );
}
