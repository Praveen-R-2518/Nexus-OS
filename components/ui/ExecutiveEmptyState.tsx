import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ExecutiveEmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
}

/**
 * Minimal glass-adjacent empty panel — uses existing tokens only (no new radii/glow vocabulary).
 */
export function ExecutiveEmptyState({
  title,
  description,
  icon,
  className,
}: ExecutiveEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-white/50 px-8 py-12 text-center dark:border-border/45 dark:bg-surface-card/50",
        className,
      )}
    >
      {icon ? (
        <span className="mb-4 text-black/25 dark:text-white/25 [&>svg]:h-9 [&>svg]:w-9">
          {icon}
        </span>
      ) : null}
      <p className="font-mono text-xs font-semibold uppercase tracking-widest text-atmospheric-grey">
        {title}
      </p>
      {description ? (
        <p className="mt-2 max-w-md font-mono text-[11px] leading-relaxed text-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
}
