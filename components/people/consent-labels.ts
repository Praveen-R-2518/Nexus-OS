import type { ConsentStatus } from "@/types";

export const CONSENT_STATUS_LABELS: Record<ConsentStatus, string> = {
  owner_imported: "Owner imported",
  candidate_applied: "Candidate applied",
  unknown: "Unknown",
};
