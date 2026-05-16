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
          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/5 ring-2 ring-emerald-500/40"
          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/80",
        !disabled && !selected && "hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900/60",
      )}
    >
      {recommended ? (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-trajectory-blue px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow">
          Recommended
        </span>
      ) : null}
      <div className="mb-3 text-center">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-foreground">{priceLabel}</p>
        <p className="mt-1 text-xs text-slate-500">{users}</p>
        <p className="text-xs text-slate-500">{emails}</p>
      </div>
      <ul className="mb-4 flex-1 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <span aria-hidden>
              <Check className="w-4 h-4 text-[#1B6B3A] dark:text-emerald-400" />
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
            ? "cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-500"
            : selected
              ? "bg-emerald-600 text-white hover:bg-emerald-500"
              : "border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 hover:border-emerald-500/60 hover:bg-slate-50 dark:hover:bg-slate-800",
        )}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
