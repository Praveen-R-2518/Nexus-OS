import { cn } from "@/lib/utils";
import type { ConsentStatus } from "@/types";
import { CONSENT_STATUS_LABELS } from "@/components/people/consent-labels";

const STATUS_STYLES: Record<ConsentStatus, string> = {
  owner_imported:
    "border-nexus-approval-border bg-nexus-approval-soft text-nexus-approval",
  candidate_applied:
    "border-status-positive-border bg-status-positive-surface text-status-positive",
  unknown: "border-border-strong bg-surface-muted text-muted",
};

export function CandidateConsentPill({
  status,
  className,
}: {
  status: ConsentStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-[1.5rem] items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        STATUS_STYLES[status],
        className,
      )}
    >
      {CONSENT_STATUS_LABELS[status]}
    </span>
  );
}
