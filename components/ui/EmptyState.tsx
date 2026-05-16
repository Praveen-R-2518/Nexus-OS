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
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-obsidian/40 px-8 py-16 text-center",
        className,
      )}
    >
      {icon ? (
      <span className="mb-4 text-slate-400 dark:text-slate-600 [&>svg]:h-10 [&>svg]:w-10">
        {icon}
      </span>
    ) : null}
    <p className="text-sm font-medium text-slate-900 dark:text-slate-200">{title}</p>
    {description ? (
      <p className="mt-2 max-w-sm text-sm text-slate-500">{description}</p>
    ) : null}
    </div>
  );
}
