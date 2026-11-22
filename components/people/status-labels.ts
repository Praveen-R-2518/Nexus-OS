import type { EmploymentStatus } from "@/types";

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  active: "Active",
  onboarding: "Onboarding",
  resignation_pending: "Resignation pending",
  offboarded: "Offboarded",
};

export const SENSITIVE_EMPLOYMENT_STATUSES: readonly EmploymentStatus[] = [
  "resignation_pending",
  "offboarded",
];

export function isSensitiveEmploymentStatus(
  status: EmploymentStatus,
): boolean {
  return SENSITIVE_EMPLOYMENT_STATUSES.includes(status);
}
