/**
 * J1 — deterministic People summary text for pgvector (no OpenAI, no DB).
 * G2 projection: names, roles, skills, scores. Never email, phone, notes, or URLs.
 */

import type {
  Candidate,
  CandidateJobDataQuality,
  CandidateJobStage,
  Employee,
  Job,
} from "@/types";

export const PEOPLE_SUMMARY_MAX_CHARS = 1500;
const JOB_DESCRIPTION_MAX_CHARS = 400;
const SKILL_LIST_MAX = 24;

function clip(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(max - 1, 1)).trimEnd()}…`;
}

function stripEmails(text: string): string {
  return text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]");
}

function boundSummary(text: string): string {
  return clip(stripEmails(text), PEOPLE_SUMMARY_MAX_CHARS);
}

function displayName(value: string | null | undefined, fallback: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || fallback;
}

function optionalField(label: string, value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return `${label}: ${trimmed}`;
}

function formatSkills(skills: unknown): string | null {
  if (!Array.isArray(skills)) return null;
  const items = skills
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, SKILL_LIST_MAX);
  if (items.length === 0) return null;
  return `Skills: ${items.join(", ")}`;
}

export function formatEmployeeSummary(employee: Employee): string {
  const parts = [
    `Employee: ${displayName(employee.full_name, "Unknown")}.`,
    optionalField("Role", employee.role_title),
    optionalField("Status", employee.employment_status),
    optionalField("Location", employee.location),
  ].filter((part): part is string => Boolean(part));
  return boundSummary(parts.join(" "));
}

export function formatJobSummary(job: Job): string {
  const parts = [
    `Job: ${displayName(job.title, "Untitled")}.`,
    optionalField("Status", job.status),
    optionalField("Location", job.location),
    optionalField("Remote", job.remote_policy),
    optionalField("Seniority", job.seniority),
  ].filter((part): part is string => Boolean(part));

  const required = formatSkills(job.required_skills);
  if (required) parts.push(`Required ${required}`);
  const preferred = formatSkills(job.preferred_skills);
  if (preferred) parts.push(`Preferred ${preferred}`);

  const description =
    typeof job.description === "string" ? job.description.trim() : "";
  if (description) {
    parts.push(`Description: ${clip(description, JOB_DESCRIPTION_MAX_CHARS)}`);
  }

  return boundSummary(parts.join(" "));
}

export function formatCandidateSummary(candidate: Candidate): string {
  const parts = [
    `Candidate: ${displayName(candidate.full_name, "Unknown")}.`,
    optionalField("Headline", candidate.headline),
    optionalField("Current role", candidate.current_role),
  ].filter((part): part is string => Boolean(part));

  if (
    typeof candidate.experience_years === "number" &&
    Number.isFinite(candidate.experience_years)
  ) {
    parts.push(`Experience years: ${candidate.experience_years}.`);
  }

  const skills = formatSkills(candidate.skills);
  if (skills) parts.push(skills);
  const location = optionalField("Location", candidate.location);
  if (location) parts.push(location);

  return boundSummary(parts.join(" "));
}

export type ApplicationSummaryInput = {
  candidateName: string;
  jobTitle: string;
  stage: CandidateJobStage | string;
  matchScore: number | null;
  dataQuality: CandidateJobDataQuality | string | null;
  insufficientReason: string | null;
  evidence: string[];
  explanationSummary: string | null;
};

export function formatApplicationSummary(input: ApplicationSummaryInput): string {
  const parts = [
    `Application: ${displayName(input.candidateName, "Candidate")} for ${displayName(input.jobTitle, "job")}.`,
    optionalField("Stage", typeof input.stage === "string" ? input.stage : null),
  ].filter((part): part is string => Boolean(part));

  if (input.dataQuality === "insufficient") {
    parts.push("Data quality: insufficient_data.");
    const reason =
      typeof input.insufficientReason === "string"
        ? input.insufficientReason.trim()
        : "";
    if (reason) parts.push(`Reason: ${clip(reason, 240)}`);
  } else if (
    typeof input.matchScore === "number" &&
    Number.isFinite(input.matchScore)
  ) {
    parts.push(`Match score: ${Math.round(input.matchScore)}.`);
    if (input.dataQuality) parts.push(`Data quality: ${input.dataQuality}.`);
  }

  const evidence = input.evidence
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => clip(item.trim(), 160))
    .slice(0, 6);
  if (evidence.length > 0) {
    parts.push(`Evidence: ${evidence.join("; ")}.`);
  }

  const explanation =
    typeof input.explanationSummary === "string"
      ? input.explanationSummary.trim()
      : "";
  if (explanation) {
    parts.push(`Summary: ${clip(explanation, 400)}`);
  }

  return boundSummary(parts.join(" "));
}
