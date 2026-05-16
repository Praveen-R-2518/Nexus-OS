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
        "relative flex h-full flex-col rounded-xl border p-4 shadow-sm transition sm:p-5",
        disabled && "opacity-45 grayscale",
        selected
          ? "border-emerald-500 bg-emerald-500/5 ring-2 ring-emerald-500/40"
          : "border-gray-800 bg-gray-950/80",
        !disabled && !selected && "hover:border-gray-600 hover:bg-gray-900/60",
      )}
    >
      {recommended ? (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow">
          Recommended
        </span>
      ) : null}
      <div className="mb-3 text-center">
        <p className="text-sm font-semibold text-gray-100">{title}</p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-white">{priceLabel}</p>
        <p className="mt-1 text-xs text-gray-500">{users}</p>
        <p className="text-xs text-gray-500">{emails}</p>
      </div>
      <ul className="mb-4 flex-1 space-y-1.5 text-xs text-gray-400">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <span className="text-emerald-400" aria-hidden>
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
            ? "cursor-not-allowed bg-gray-800 text-gray-500"
            : selected
              ? "bg-emerald-600 text-white hover:bg-emerald-500"
              : "border border-gray-700 bg-gray-900 text-gray-100 hover:border-emerald-500/60 hover:bg-gray-800",
        )}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
