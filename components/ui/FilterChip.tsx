import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface FilterChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active: boolean;
  /** Accent used for the active state. Default "approval" (blue) matches most tab/status
   * filters; "intake" (teal) matches the Inbox urgency/intent filters. */
  accent?: "approval" | "intake";
}

const accentClasses: Record<NonNullable<FilterChipProps["accent"]>, string> = {
  approval: "border-nexus-approval-border bg-nexus-approval-soft text-nexus-approval",
  intake: "border-nexus-intake-border bg-nexus-intake-soft text-nexus-intake",
};

/** Toggle/tab pill used for filter and status controls. Unlike a plain glass-pill, the
 * inactive state is a solid neutral fill so it still reads as a real, clickable button. */
export function FilterChip({
  active,
  accent = "approval",
  className,
  type = "button",
  ...props
}: FilterChipProps) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-medium tracking-normal transition-colors duration-interaction disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? accentClasses[accent]
          : "border-border-strong bg-surface-muted text-atmospheric-grey/80 hover:bg-surface-elevated hover:text-atmospheric-grey",
        className,
      )}
      {...props}
    />
  );
}
