import { cn } from "@/lib/utils";
import type { JobStatus } from "@/types";
import { JOB_STATUS_LABELS } from "@/components/people/job-labels";

const STATUS_STYLES: Record<JobStatus, string> = {
  draft: "border-border-strong bg-surface-muted text-muted",
  open: "border-status-positive-border bg-status-positive-surface text-status-positive",
  closed:
    "border-status-warning-border bg-status-warning-surface text-status-warning",
};

export function JobStatusPill({
  status,
  className,
}: {
  status: JobStatus;
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
      {JOB_STATUS_LABELS[status]}
    </span>
  );
}
