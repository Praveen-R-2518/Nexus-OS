import { CANDIDATE_JOB_STAGES, type CandidateJobStage } from "@/types";

export const CANDIDATE_JOB_STAGE_LABELS: Record<CandidateJobStage, string> = {
  new: "New",
  shortlisted: "Shortlisted",
  contacted: "Contacted",
  decision: "Decision",
};

export function parseCandidateJobStage(
  value: string,
): CandidateJobStage | null {
  if ((CANDIDATE_JOB_STAGES as readonly string[]).includes(value)) {
    return value as CandidateJobStage;
  }
  return null;
}
