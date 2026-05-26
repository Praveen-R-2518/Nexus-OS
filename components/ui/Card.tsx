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
        "relative overflow-hidden rounded-2xl border border-border p-7 sm:p-8",
        isCritical
          ? "glass-panel shadow-glow-positive dark:shadow-glow-positive"
          : "surface-card shadow-card-halo-light dark:shadow-card-halo",
        className,
      )}
    >
      {isCritical ? (
        <>
          <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-trajectory-blue/25 blur-3xl dark:bg-trajectory-blue/20" />
          <div className="pointer-events-none absolute -bottom-12 -right-10 h-44 w-44 rounded-full bg-trajectory-blue/10 blur-3xl dark:bg-status-positive-surface" />
        </>
      ) : (
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-trajectory-blue/10 blur-2xl dark:bg-status-neutral-surface" />
      )}
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-brand text-muted sm:text-sm">
            {title}
          </p>
          <p
            className={cn(
              "mt-3 text-4xl font-bold tabular-nums tracking-tight sm:text-5xl",
              isCritical ? "text-atmospheric-grey" : accent,
            )}
          >
            {value}
          </p>
          {subtitle ? (
            <p className="mt-3 text-base leading-relaxed text-muted">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-3">
          {icon ? (
            <span
              className={cn(
                "[&>svg]:h-6 [&>svg]:w-6",
                isCritical ? "text-trajectory-blue" : "text-muted",
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
