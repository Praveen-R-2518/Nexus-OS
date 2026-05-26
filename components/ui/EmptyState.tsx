import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center border border-dashed border-border/40 bg-ref-mint/50 px-8 py-14 text-center dark:border-border/35 dark:bg-surface-page/80",
        className,
      )}
    >
      {icon ? (
        <span className="mb-4 text-black/35 dark:text-white/35 [&>svg]:h-9 [&>svg]:w-9">
          {icon}
        </span>
      ) : null}
      <p className="font-mono text-xs font-semibold uppercase tracking-widest text-atmospheric-grey">
        {title}
      </p>
      {description ? (
        <p className="mt-2 max-w-sm font-mono text-[11px] leading-relaxed text-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
}
