import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  accent?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
  className?: string;
  variant?: "critical" | "support";
}

function TrendGlyph({ trend }: { trend: NonNullable<CardProps["trend"]> }) {
  if (trend === "up") {
    return (
      <span className="text-status-positive" aria-hidden>
        ↑
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span className="text-status-critical" aria-hidden>
        ↓
      </span>
    );
  }
  return (
    <span className="text-muted" aria-hidden>
      →
    </span>
  );
}

export function Card({
  title,
  value,
  subtitle,
  accent = "text-status-positive",
  icon,
  trend,
  className,
  variant = "support",
}: CardProps) {
  const isCritical = variant === "critical";

  return (
    <div
      className={cn(
        "relative overflow-hidden border border-black bg-white p-6 sm:p-7 dark:border-white dark:bg-[#0a1018]",
        isCritical ? "border-black dark:border-white" : "",
        className,
      )}
    >
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            {title}
          </p>
          <p
            className={cn(
              "mt-3 text-3xl font-bold tabular-nums tracking-tight sm:text-4xl",
              isCritical ? "text-atmospheric-grey" : accent,
            )}
          >
            {value}
          </p>
          {subtitle ? (
            <p className="mt-3 text-sm leading-relaxed text-muted">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-3">
          {icon ? (
            <span
              className={cn(
                "[&>svg]:h-5 [&>svg]:w-5",
                isCritical ? "text-ref-cta dark:text-emerald-300/90" : "text-muted",
              )}
            >
              {icon}
            </span>
          ) : null}
          {trend ? <TrendGlyph trend={trend} /> : null}
        </div>
      </div>
    </div>
  );
}
