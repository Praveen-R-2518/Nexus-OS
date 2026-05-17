import { cn } from "@/lib/utils";

export interface BadgeProps {
  label: string;
  variant: "urgency" | "intent" | "status";
  /** DB rows may omit classification — null/undefined get neutral styling. */
  value: string | null | undefined;
  className?: string;
}

const urgencyColors: Record<string, string> = {
  critical:
    "border-badge-critical-ring bg-badge-critical-bg dark:bg-red-500/15 text-badge-critical-text dark:text-red-300",
  high:
    "border-badge-high-ring bg-badge-high-bg dark:bg-orange-500/10 text-badge-high-text dark:text-orange-300",
  medium:
    "border-badge-medium-ring bg-badge-medium-bg dark:bg-yellow-500/10 text-badge-medium-text dark:text-yellow-300",
  low:
    "border-badge-low-ring bg-badge-low-bg dark:bg-green-500/10 text-badge-low-text dark:text-green-300",
};

const intentColors: Record<string, string> = {
  purchase:
    "border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-[#1B6B3A] dark:text-emerald-400",
  complaint:
    "border-badge-critical-ring bg-badge-critical-bg dark:bg-red-500/10 text-badge-critical-text dark:text-red-400",
  churn_risk:
    "border-badge-high-ring bg-badge-high-bg dark:bg-orange-500/10 text-badge-high-text dark:text-orange-400",
  support:
    "border-blue-500/40 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400",
  unknown:
    "border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
};

const statusColors: Record<string, string> = {
  approved:
    "border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-[#1B6B3A] dark:text-emerald-400",
  pending:
    "border-badge-pending-ring bg-badge-pending-bg dark:bg-yellow-500/10 text-badge-pending-text dark:text-yellow-400",
  rejected:
    "border-badge-critical-ring bg-badge-critical-bg dark:bg-red-500/10 text-badge-critical-text dark:text-red-400",
  sent:
    "border-blue-500/40 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400",
};

const fallback =
  "border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400";

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
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium backdrop-blur-md",
        stylesForVariant(variant, value),
        className,
      )}
    >
      {label}
    </span>
  );
}
