import type { JobStatus, RemotePolicy, ScoringWeightKey } from "@/types";

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
};

export const REMOTE_POLICY_LABELS: Record<RemotePolicy, string> = {
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
  flexible: "Flexible",
};

export const SCORING_WEIGHT_LABELS: Record<ScoringWeightKey, string> = {
  technical_fit: "Technical fit",
  experience_fit: "Experience fit",
  seniority_fit: "Seniority fit",
  location_fit: "Location fit",
  nice_to_have: "Nice to have",
  data_quality: "Data quality",
};
