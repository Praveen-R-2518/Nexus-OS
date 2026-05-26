import { cn } from "@/lib/utils";

export interface BadgeProps {
  label: string;
  variant: "urgency" | "intent" | "status";
  /** DB rows may omit classification — null/undefined get neutral styling. */
  value: string | null | undefined;
  className?: string;
}

const badgeShell =
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold backdrop-blur-sm transition-colors duration-interaction sm:text-sm";

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

const intentColors: Record<string, string> = {
  purchase: cn(
    "border-status-positive-border bg-status-positive-surface text-status-positive",
  ),
  complaint: cn(
    "border-status-critical-border bg-status-critical-surface text-status-critical",
  ),
  churn_risk: cn(
    "border-status-warning-border bg-status-warning-surface text-status-warning",
  ),
  support: cn(
    "border-status-neutral-border bg-status-neutral-surface text-status-neutral",
  ),
  unknown: cn(
    "border-border-strong bg-surface-muted text-slate-600 dark:text-slate-400",
  ),
};

const statusColors: Record<string, string> = {
  approved: cn(
    "border-status-positive-border bg-status-positive-surface text-status-positive",
  ),
  pending: cn(
    "border-status-caution-border bg-status-caution-surface text-status-caution",
  ),
  rejected: cn(
    "border-status-critical-border bg-status-critical-surface text-status-critical",
  ),
  sent: cn(
    "border-status-neutral-border bg-status-neutral-surface text-status-neutral",
  ),
};

const fallback = cn(
  "border-border-strong bg-surface-muted text-slate-600 dark:text-slate-400",
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
