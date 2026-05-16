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
      <span className="text-emerald-400" aria-hidden>
        ↑
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span className="text-red-400" aria-hidden>
        ↓
      </span>
    );
  }
  return (
    <span className="text-gray-500" aria-hidden>
      →
    </span>
  );
}

export function Card({
  title,
  value,
  subtitle,
  accent = "text-emerald-400",
  icon,
  trend,
  className,
  variant = "support",
}: CardProps) {
  const isCritical = variant === "critical";

  return (
    <div
      className={cn(
        "relative rounded-xl p-6 overflow-hidden",
        isCritical
          ? "glass-panel"
          : "bg-obsidian border border-white/10",
        className,
      )}
    >
      {isCritical && (
        <div className="absolute -top-10 -left-10 w-32 h-32 bg-trajectory-blue/20 rounded-full blur-3xl pointer-events-none" />
      )}
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-atmospheric-grey/60 uppercase tracking-widest">{title}</p>
          <p className={cn("mt-2 text-4xl font-semibold tabular-nums tracking-tight", isCritical ? "text-atmospheric-grey" : accent)}>
            {value}
          </p>
          {subtitle ? (
            <p className="mt-2 text-sm text-atmospheric-grey/40">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {icon ? (
            <span className={cn("[&>svg]:h-5 [&>svg]:w-5", isCritical ? "text-trajectory-blue" : "text-atmospheric-grey/40")}>{icon}</span>
          ) : null}
          {trend ? <TrendGlyph trend={trend} /> : null}
        </div>
      </div>
    </div>
  );
}
