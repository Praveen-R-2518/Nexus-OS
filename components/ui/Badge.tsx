import { cn } from "@/lib/utils";

export interface BadgeProps {
  label: string;
  variant: "urgency" | "intent" | "status";
  /** DB rows may omit classification — null/undefined get neutral styling. */
  value: string | null | undefined;
  className?: string;
}

const badgeShell =
  "inline-flex min-h-[1.75rem] items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-normal transition-colors duration-interaction sm:text-xs";

const urgencyColors: Record<string, string> = {
  critical: cn(
    "border-status-critical-border bg-status-critical-surface text-status-critical",
  ),
  high: cn(
    "border-nexus-rescue-border bg-nexus-rescue-soft text-nexus-rescue",
  ),
  medium: cn(
    "border-nexus-execution-border bg-nexus-execution-soft text-nexus-execution",
  ),
  low: cn(
    "border-nexus-intake-border bg-nexus-intake-soft text-nexus-intake",
  ),
};

const intentColors: Record<string, string> = {
  purchase: cn(
    "border-nexus-growth-border bg-nexus-growth-soft text-status-positive",
  ),
  complaint: cn(
    "border-status-critical-border bg-status-critical-surface text-status-critical",
  ),
  churn_risk: cn(
    "border-nexus-rescue-border bg-nexus-rescue-soft text-nexus-rescue",
  ),
  support: cn(
    "border-nexus-discovery-border bg-nexus-discovery-soft text-nexus-discovery",
  ),
  unknown: cn(
    "border-border-strong bg-surface-muted text-atmospheric-grey/70 dark:text-atmospheric-grey/60",
  ),
};

const statusColors: Record<string, string> = {
  approved: cn(
    "border-nexus-growth-border bg-nexus-growth-soft text-status-positive",
  ),
  pending: cn(
    "border-nexus-approval-border bg-nexus-approval-soft text-nexus-approval",
  ),
  rejected: cn(
    "border-status-critical-border bg-status-critical-surface text-status-critical",
  ),
  sent: cn(
    "border-nexus-execution-border bg-nexus-execution-soft text-nexus-execution",
  ),
};

const fallback = cn(
  "border-border-strong bg-surface-muted text-atmospheric-grey/70 dark:text-atmospheric-grey/60",
);

function stylesForVariant(
  variant: BadgeProps["variant"],
  value: string | null | undefined,
): string {
  if (value == null || typeof value !== "string" || value.trim() === "") {
    return fallback;
  }
  const key = value.toLowerCase();
  switch (variant) {
    case "urgency":
      return urgencyColors[key] ?? fallback;
    case "intent":
      return intentColors[key] ?? fallback;
    case "status":
      return statusColors[key] ?? fallback;
    default:
      return fallback;
  }
}

export function Badge({ label, variant, value, className }: BadgeProps) {
  return (
    <span
      className={cn(
        badgeShell,
        stylesForVariant(variant, value),
        className,
      )}
    >
      {label}
    </span>
  );
}
