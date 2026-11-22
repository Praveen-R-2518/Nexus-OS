import { cn } from "@/lib/utils";
import type { CandidateJobStage } from "@/types";
import { CANDIDATE_JOB_STAGE_LABELS } from "@/components/people/pipeline-labels";

const STAGE_STYLES: Record<CandidateJobStage, string> = {
  new: "border-border-strong bg-surface-muted text-muted",
  shortlisted:
    "border-nexus-intake-border bg-nexus-intake-soft text-nexus-intake",
  contacted:
    "border-nexus-approval-border bg-nexus-approval-soft text-nexus-approval",
  decision:
    "border-status-positive-border bg-status-positive-surface text-status-positive",
};

export function CandidateStagePill({
  stage,
  className,
}: {
  stage: CandidateJobStage;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-[1.5rem] items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        STAGE_STYLES[stage],
        className,
      )}
    >
      {CANDIDATE_JOB_STAGE_LABELS[stage]}
    </span>
  );
}
