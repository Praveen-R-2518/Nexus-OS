"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanTier } from "./types";

export type PricingCardProps = {
  plan: PlanTier;
  title: string;
  priceLabel: string;
  users: string;
  emails: string;
  features?: string[];
  recommended?: boolean;
  badge?: string;
  highlighted?: boolean;
  disabled?: boolean;
  selected?: boolean;
  onSelect: (plan: PlanTier) => void;
  ctaLabel?: string;
};

export default function PricingCard({
  plan,
  title,
  priceLabel,
  users,
  emails,
  features = [],
  recommended,
  badge,
  highlighted,
  disabled,
  selected,
  onSelect,
  ctaLabel = "Select",
}: PricingCardProps) {
  const topBadge = badge ?? (recommended ? "Recommended" : undefined);

  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-xl border bg-white p-4 transition sm:p-5 dark:bg-surface-card",
        highlighted &&
          "shadow-[0_0_24px_rgba(12,74,110,0.28)] dark:shadow-[0_0_32px_rgba(12,74,110,0.4)]",
        selected
          ? "border border-selectable-edge-selected"
          : highlighted
            ? "border-ref-cta dark:border-[color:var(--trajectory-blue)]"
            : "border border-selectable-edge",
        disabled && "opacity-45 grayscale",
        !disabled && !selected && "hover:bg-[#eef6fb] dark:hover:bg-surface-elevated",
      )}
    >
      {topBadge ? (
        <span
          className={cn(
            "absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-widest",
            highlighted
              ? "border-ref-cta bg-ref-cta text-white dark:border-[color:var(--trajectory-blue)] dark:bg-[color:var(--trajectory-blue)]"
              : "border-border bg-[#0f2336] text-white dark:border-border",
          )}
        >
          {topBadge}
        </span>
      ) : null}
      <div className="mb-3 text-center">
        <p className="font-sans text-sm font-black uppercase tracking-tight text-black dark:text-white">{title}</p>
        <p className="mt-2 font-mono text-xl font-bold tabular-nums text-black dark:text-white">{priceLabel}</p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-black/60 dark:text-white/55">{users}</p>
        <p className="font-mono text-[10px] uppercase tracking-wider text-black/60 dark:text-white/55">{emails}</p>
      </div>
      <ul className="mb-4 flex-1 space-y-1.5 border-t border-dashed border-border/40 pt-3 font-mono text-xs text-black/80 dark:border-border dark:text-white/75">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <span aria-hidden>
              <Check className="h-4 w-4 shrink-0 text-[#0f2336] dark:text-muted" />
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onSelect(plan)}
        className={cn(
          "mt-auto inline-flex w-full cursor-pointer items-center justify-center border border-border px-3 py-2 font-mono text-xs font-medium uppercase tracking-widest transition",
          disabled
            ? "cursor-not-allowed border-border/80 bg-black/[0.04] text-black/40 dark:border-border dark:text-white/40"
            : selected
              ? "bg-[#0f2336] text-white hover:bg-[#172f45]"
              : "bg-white text-black hover:bg-[#e3eef6] dark:bg-surface-card dark:text-white dark:hover:bg-surface-elevated",
        )}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
