/**
 * Wave 1 D2 — Deterministic candidate–job scoring (pure; no DB, no LLM).
 * D3 wires this into the background worker.
 */

import { validateScoringWeights } from "@/lib/people/scoring-weights";
import {
  SCORING_WEIGHT_KEYS,
  type RemotePolicy,
  type ScoringWeightKey,
  type ScoringWeights,
} from "@/types";

export const SCORING_VERSION = "people.match.v1";

export interface ScoreCandidateInput {
  skills: string[];
  experience_years: number | null;
  current_role: string | null;
  headline: string | null;
  location: string | null;
}

export interface ScoreJobInput {
  required_skills: string[];
  preferred_skills: string[];
  experience_min_years: number | null;
  experience_max_years: number | null;
  seniority: string | null;
  location: string | null;
  remote_policy: RemotePolicy | null;
}

export interface ScoreEvidence {
  field: string;
  value: string;
  note: string;
}

export interface ScoreComponent {
  key: ScoringWeightKey;
  raw: number;
  weight: number;
  contribution: number;
  evidence: ScoreEvidence[];
}

export interface ScoreSufficient {
  data_quality: "sufficient";
  score: number;
  scoring_version: string;
  weights: ScoringWeights;
  components: ScoreComponent[];
}

export interface ScoreInsufficient {
  data_quality: "insufficient";
  reason: string;
  scoring_version: string;
  weights: ScoringWeights;
}

export type ScoreResult = ScoreSufficient | ScoreInsufficient;

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundScore(value: number): number {
  return clamp(0, 100, Math.round(value));
}

function normalizeSkill(skill: string): string {
  return skill
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function skillTokens(skill: string): string[] {
  return normalizeSkill(skill)
    .split(" ")
    .filter((token) => token.length >= 2);
}

function skillsMatch(candidateSkill: string, targetSkill: string): boolean {
  const a = normalizeSkill(candidateSkill);
  const b = normalizeSkill(targetSkill);
  if (!a || !b) return false;
  if (a === b) return true;

  const tokensA = skillTokens(candidateSkill);
  const tokensB = skillTokens(targetSkill);
  if (tokensA.length === 0 || tokensB.length === 0) return false;

  const shorter = tokensA.length <= tokensB.length ? tokensA : tokensB;
  const longer = tokensA.length <= tokensB.length ? tokensB : tokensA;
  return shorter.every((token) => longer.includes(token));
}

function candidateHasSkill(candidateSkills: string[], required: string): boolean {
  return candidateSkills.some((skill) => skillsMatch(skill, required));
}

function normalizeLocation(value: string | null): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function locationsMatch(a: string | null, b: string | null): boolean {
  const na = normalizeLocation(a);
  const nb = normalizeLocation(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function jobHasExperienceBounds(job: ScoreJobInput): boolean {
  return (
    typeof job.experience_min_years === "number" ||
    typeof job.experience_max_years === "number"
  );
}

function skillsUnevaluable(candidate: ScoreCandidateInput, job: ScoreJobInput): boolean {
  return job.required_skills.length > 0 && candidate.skills.length === 0;
}

function experienceUnevaluable(candidate: ScoreCandidateInput, job: ScoreJobInput): boolean {
  return jobHasExperienceBounds(job) && candidate.experience_years === null;
}

function insufficientReason(candidate: ScoreCandidateInput, job: ScoreJobInput): string {
  const parts: string[] = [];
  if (skillsUnevaluable(candidate, job)) {
    parts.push("candidate has no listed skills for required job skills");
  }
  if (experienceUnevaluable(candidate, job)) {
    parts.push("candidate experience years are missing for a job with experience bounds");
  }
  return parts.join("; ");
}

type SeniorityRank = 1 | 2 | 3 | 4 | 5;

const SENIORITY_PATTERNS: Array<{ rank: SeniorityRank; pattern: RegExp }> = [
  { rank: 1, pattern: /\b(intern|junior|entry)\b/i },
  { rank: 2, pattern: /\b(mid|middle|intermediate)\b/i },
  { rank: 3, pattern: /\bsenior\b/i },
  { rank: 4, pattern: /\b(staff|lead|principal)\b/i },
  { rank: 5, pattern: /\b(director|head|vp|vice president)\b/i },
];

function parseSeniorityRank(text: string | null): SeniorityRank | null {
  if (!text) return null;
  for (const { rank, pattern } of SENIORITY_PATTERNS) {
    if (pattern.test(text)) return rank;
  }
  return null;
}

function candidateSeniorityText(candidate: ScoreCandidateInput): string {
  return [candidate.current_role, candidate.headline].filter(Boolean).join(" ");
}

function scoreTechnicalFit(
  candidate: ScoreCandidateInput,
  job: ScoreJobInput,
): { raw: number; evidence: ScoreEvidence[] } {
  if (job.required_skills.length === 0) {
    return {
      raw: 100,
      evidence: [
        {
          field: "required_skills",
          value: "[]",
          note: "no required skills listed",
        },
      ],
    };
  }

  const evidence: ScoreEvidence[] = [];
  let matched = 0;
  for (const required of job.required_skills) {
    const hit = candidateHasSkill(candidate.skills, required);
    if (hit) matched += 1;
    evidence.push({
      field: "required_skills",
      value: required,
      note: hit ? "matched candidate skill" : "no matching candidate skill evidence",
    });
  }

  const raw = roundScore((matched / job.required_skills.length) * 100);
  return { raw, evidence };
}

function scoreExperienceFit(
  candidate: ScoreCandidateInput,
  job: ScoreJobInput,
): { raw: number; evidence: ScoreEvidence[] } {
  if (!jobHasExperienceBounds(job)) {
    return {
      raw: 100,
      evidence: [
        {
          field: "experience_years",
          value: candidate.experience_years?.toString() ?? "null",
          note: "job has no experience bounds",
        },
      ],
    };
  }

  const years = candidate.experience_years;
  if (years === null) {
    return {
      raw: 0,
      evidence: [
        {
          field: "experience_years",
          value: "null",
          note: "candidate experience years missing",
        },
      ],
    };
  }

  const min = job.experience_min_years;
  const max = job.experience_max_years;
  let raw = 100;
  let note = "within experience range";

  if (typeof min === "number" && years < min) {
    raw = roundScore((years / min) * 100);
    note = `below minimum (${years} < ${min})`;
  } else if (typeof max === "number" && years > max) {
    raw = roundScore(clamp(70, 100, 100 - 10 * (years - max)));
    note = `above maximum (${years} > ${max})`;
  }

  return {
    raw,
    evidence: [
      {
        field: "experience_years",
        value: String(years),
        note,
      },
    ],
  };
}

function seniorityDistanceScore(distance: number): number {
  if (distance <= 0) return 100;
  if (distance === 1) return 70;
  if (distance === 2) return 40;
  return 0;
}

function scoreSeniorityFit(
  candidate: ScoreCandidateInput,
  job: ScoreJobInput,
): { raw: number; evidence: ScoreEvidence[] } {
  if (!job.seniority) {
    return {
      raw: 100,
      evidence: [
        {
          field: "seniority",
          value: "null",
          note: "job has no seniority requirement",
        },
      ],
    };
  }

  const roleText = candidateSeniorityText(candidate);
  const jobRank = parseSeniorityRank(job.seniority);
  const candidateRank = parseSeniorityRank(roleText);

  if (jobRank === null) {
    const substringMatch = roleText.toLowerCase().includes(job.seniority.toLowerCase());
    return {
      raw: substringMatch ? 100 : 0,
      evidence: [
        {
          field: "seniority",
          value: job.seniority,
          note: substringMatch
            ? "job seniority text found in candidate role/headline"
            : "job seniority text not found in candidate role/headline",
        },
      ],
    };
  }

  if (candidateRank === null) {
    return {
      raw: 0,
      evidence: [
        {
          field: "current_role",
          value: roleText || "null",
          note: "candidate role/headline does not indicate seniority",
        },
      ],
    };
  }

  const distance = Math.abs(jobRank - candidateRank);
  return {
    raw: seniorityDistanceScore(distance),
    evidence: [
      {
        field: "seniority",
        value: `job=${jobRank}, candidate=${candidateRank}`,
        note: `rank distance ${distance}`,
      },
    ],
  };
}

function locationRequired(job: ScoreJobInput): boolean {
  if (job.remote_policy === "remote" || job.remote_policy === "flexible") {
    return false;
  }
  if (job.remote_policy === "onsite" || job.remote_policy === "hybrid") {
    return Boolean(job.location);
  }
  return Boolean(job.location);
}

function scoreLocationFit(
  candidate: ScoreCandidateInput,
  job: ScoreJobInput,
): { raw: number; evidence: ScoreEvidence[] } {
  if (job.remote_policy === "remote" || job.remote_policy === "flexible") {
    return {
      raw: 100,
      evidence: [
        {
          field: "remote_policy",
          value: job.remote_policy,
          note: "remote or flexible policy",
        },
      ],
    };
  }

  if (!job.location) {
    return {
      raw: 100,
      evidence: [
        {
          field: "location",
          value: "null",
          note: "job has no location constraint",
        },
      ],
    };
  }

  if (!candidate.location) {
    return {
      raw: 0,
      evidence: [
        {
          field: "location",
          value: "null",
          note: "candidate location missing for onsite/hybrid job",
        },
      ],
    };
  }

  const match = locationsMatch(candidate.location, job.location);
  return {
    raw: match ? 100 : 0,
    evidence: [
      {
        field: "location",
        value: `${candidate.location} vs ${job.location}`,
        note: match ? "locations match" : "locations do not match",
      },
    ],
  };
}

function scoreNiceToHave(
  candidate: ScoreCandidateInput,
  job: ScoreJobInput,
): { raw: number; evidence: ScoreEvidence[] } {
  if (job.preferred_skills.length === 0) {
    return {
      raw: 100,
      evidence: [
        {
          field: "preferred_skills",
          value: "[]",
          note: "no preferred skills listed",
        },
      ],
    };
  }

  const evidence: ScoreEvidence[] = [];
  let matched = 0;
  for (const preferred of job.preferred_skills) {
    const hit = candidateHasSkill(candidate.skills, preferred);
    if (hit) matched += 1;
    evidence.push({
      field: "preferred_skills",
      value: preferred,
      note: hit ? "matched candidate skill" : "no matching candidate skill evidence",
    });
  }

  const raw = roundScore((matched / job.preferred_skills.length) * 100);
  return { raw, evidence };
}

function scoreDataQualityComponent(
  candidate: ScoreCandidateInput,
  job: ScoreJobInput,
): { raw: number; evidence: ScoreEvidence[] } {
  const slots: Array<{ field: string; filled: boolean; note: string }> = [];

  if (job.required_skills.length > 0 || job.preferred_skills.length > 0) {
    slots.push({
      field: "skills",
      filled: candidate.skills.length > 0,
      note: "skills listed for skill-based job",
    });
  }

  if (jobHasExperienceBounds(job)) {
    slots.push({
      field: "experience_years",
      filled: candidate.experience_years !== null,
      note: "experience years for bounded job",
    });
  }

  if (locationRequired(job)) {
    slots.push({
      field: "location",
      filled: Boolean(candidate.location),
      note: "location for onsite/hybrid job with location",
    });
  }

  if (job.seniority) {
    slots.push({
      field: "current_role",
      filled: Boolean(candidate.current_role || candidate.headline),
      note: "role/headline for seniority-based job",
    });
  }

  if (slots.length === 0) {
    return {
      raw: 100,
      evidence: [
        {
          field: "data_quality",
          value: "n/a",
          note: "no relevant candidate slots for this job",
        },
      ],
    };
  }

  const filled = slots.filter((slot) => slot.filled).length;
  const raw = roundScore((filled / slots.length) * 100);
  return {
    raw,
    evidence: slots.map((slot) => ({
      field: slot.field,
      value: slot.filled ? "filled" : "missing",
      note: slot.note,
    })),
  };
}

function buildComponent(
  key: ScoringWeightKey,
  raw: number,
  weight: number,
  evidence: ScoreEvidence[],
): ScoreComponent {
  return {
    key,
    raw,
    weight,
    contribution: raw * weight,
    evidence,
  };
}

function assertValidWeights(weights: ScoringWeights): void {
  const parsed = validateScoringWeights(weights);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
}

export function scoreCandidate(
  candidate: ScoreCandidateInput,
  job: ScoreJobInput,
  weights: ScoringWeights,
): ScoreResult {
  assertValidWeights(weights);

  if (skillsUnevaluable(candidate, job) && experienceUnevaluable(candidate, job)) {
    return {
      data_quality: "insufficient",
      reason: insufficientReason(candidate, job),
      scoring_version: SCORING_VERSION,
      weights,
    };
  }

  const technical = scoreTechnicalFit(candidate, job);
  const experience = scoreExperienceFit(candidate, job);
  const seniority = scoreSeniorityFit(candidate, job);
  const location = scoreLocationFit(candidate, job);
  const niceToHave = scoreNiceToHave(candidate, job);
  const dataQuality = scoreDataQualityComponent(candidate, job);

  const components: ScoreComponent[] = [
    buildComponent("technical_fit", technical.raw, weights.technical_fit, technical.evidence),
    buildComponent("experience_fit", experience.raw, weights.experience_fit, experience.evidence),
    buildComponent("seniority_fit", seniority.raw, weights.seniority_fit, seniority.evidence),
    buildComponent("location_fit", location.raw, weights.location_fit, location.evidence),
    buildComponent("nice_to_have", niceToHave.raw, weights.nice_to_have, niceToHave.evidence),
    buildComponent("data_quality", dataQuality.raw, weights.data_quality, dataQuality.evidence),
  ];

  const total = roundScore(
    components.reduce((sum, component) => sum + component.contribution, 0),
  );

  return {
    data_quality: "sufficient",
    score: total,
    scoring_version: SCORING_VERSION,
    weights,
    components,
  };
}

export function isScoreSufficient(result: ScoreResult): result is ScoreSufficient {
  return result.data_quality === "sufficient";
}

export function componentRawByKey(
  result: ScoreSufficient,
  key: ScoringWeightKey,
): number | undefined {
  return result.components.find((component) => component.key === key)?.raw;
}

export { SCORING_WEIGHT_KEYS };
