import { cn } from "@/lib/utils";
import type { EmploymentStatus } from "@/types";
import { EMPLOYMENT_STATUS_LABELS } from "@/components/people/status-labels";

const STATUS_STYLES: Record<EmploymentStatus, string> = {
  active:
    "border-status-positive-border bg-status-positive-surface text-status-positive",
  onboarding:
    "border-nexus-approval-border bg-nexus-approval-soft text-nexus-approval",
  resignation_pending:
    "border-status-warning-border bg-status-warning-surface text-status-warning",
  offboarded: "border-border-strong bg-surface-muted text-muted",
};

export function EmployeeStatusPill({
  status,
  className,
}: {
  status: EmploymentStatus;
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
      {EMPLOYMENT_STATUS_LABELS[status]}
    </span>
  );
}
