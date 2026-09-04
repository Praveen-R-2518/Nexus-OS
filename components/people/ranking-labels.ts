import type { MatchExplanation, MatchRecommendation } from "@/types";

export const MATCH_RECOMMENDATION_LABELS: Record<MatchRecommendation, string> = {
  strong_match: "Strong match (advisory)",
  possible_match: "Possible match (advisory)",
  weak_match: "Weak match (advisory)",
  insufficient_data: "Insufficient data",
};

export const DATA_QUALITY_LABELS = {
  pending: "Pending",
  sufficient: "Sufficient data",
  insufficient: "Insufficient data",
} as const;

export function isMatchExplanationError(
  value: MatchExplanation | { error?: string } | null,
): value is { error: string; message: string } {
  return Boolean(value && typeof value === "object" && "error" in value);
}

export function safeHttpUrl(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function roleLine(candidate: {
  headline: string | null;
  current_role: string | null;
}): string {
  return candidate.headline || candidate.current_role || "No role yet";
}
