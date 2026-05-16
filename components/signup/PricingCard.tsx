"use client";

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
  disabled,
  selected,
  onSelect,
  ctaLabel = "Select",
}: PricingCardProps) {
  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-xl border p-4 shadow-sm transition sm:p-5 glass-panel",
        disabled && "opacity-45 grayscale",
        selected
          ? "border-trajectory-blue bg-trajectory-blue/5 ring-2 ring-trajectory-blue/40"
          : "border-white/10",
        !disabled && !selected && "hover:border-white/20 hover:bg-white/5",
      )}
    >
      {recommended ? (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-trajectory-blue px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow">
          Recommended
        </span>
      ) : null}
      <div className="mb-3 text-center">
        <p className="text-sm font-semibold text-atmospheric-grey">{title}</p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-white">{priceLabel}</p>
        <p className="mt-1 text-xs text-atmospheric-grey/60">{users}</p>
        <p className="text-xs text-atmospheric-grey/60">{emails}</p>
      </div>
      <ul className="mb-4 flex-1 space-y-1.5 text-xs text-atmospheric-grey/60">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <span className="text-trajectory-blue" aria-hidden>
              ✓
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
          "mt-auto inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition",
          disabled
            ? "cursor-not-allowed bg-white/5 text-atmospheric-grey/40"
            : selected
              ? "bg-trajectory-blue text-white hover:bg-blue-600"
              : "glass-button text-atmospheric-grey hover:text-trajectory-blue",
        )}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
