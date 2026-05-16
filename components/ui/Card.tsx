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
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-700 bg-gray-800 p-6 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-400">{title}</p>
          <p className={cn("mt-2 text-3xl font-semibold tabular-nums", accent)}>
            {value}
          </p>
          {subtitle ? (
            <p className="mt-2 text-sm text-gray-500">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {icon ? (
            <span className="text-gray-400 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
          ) : null}
          {trend ? <TrendGlyph trend={trend} /> : null}
        </div>
      </div>
    </div>
  );
}
