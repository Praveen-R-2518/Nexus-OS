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

/** Urgency is a severity scale — always the shared status-* ramp (green -> amber -> orange -> red),
 * matching getUrgencyBadgeClass() in lib/utils.ts. Never use decorative brand hues here. */
const urgencyColors: Record<string, string> = {
  critical: cn(
    "border-status-critical-border bg-status-critical-surface text-status-critical",
  ),
  high: cn(
    "border-status-warning-border bg-status-warning-surface text-status-warning",
  ),
  medium: cn(
    "border-status-caution-border bg-status-caution-surface text-status-caution",
  ),
  low: cn(
    "border-status-positive-border bg-status-positive-surface text-status-positive",
  ),
};

/** Intent is categorical, not a severity level, and renders next to an urgency badge in the
 * same row — keep it off the status-* severity ramp so a badge never gets misread as a risk
 * level. "complaint" is the one deliberate exception: a complaint genuinely is bad news, so it
 * reuses critical-red on purpose (reinforces, doesn't contradict, a co-occurring critical urgency). */
const intentColors: Record<string, string> = {
  purchase: cn(
    "border-nexus-discovery-border bg-nexus-discovery-soft text-nexus-discovery",
  ),
  complaint: cn(
    "border-status-critical-border bg-status-critical-surface text-status-critical",
  ),
  churn_risk: cn(
    "border-nexus-rescue-border bg-nexus-rescue-soft text-nexus-rescue",
  ),
  support: cn(
    "border-nexus-intake-border bg-nexus-intake-soft text-nexus-intake",
  ),
  unknown: cn(
    "border-border-strong bg-surface-muted text-atmospheric-grey/70 dark:text-atmospheric-grey/60",
  ),
};

const statusColors: Record<string, string> = {
  approved: cn(
    "border-status-positive-border bg-status-positive-surface text-status-positive",
  ),
  pending: cn(
    "border-nexus-approval-border bg-nexus-approval-soft text-nexus-approval",
  ),
  rejected: cn(
    "border-status-critical-border bg-status-critical-surface text-status-critical",
  ),
  sent: cn(
    "border-nexus-intake-border bg-nexus-intake-soft text-nexus-intake",
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
