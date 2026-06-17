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
          "shadow-[0_0_24px_rgba(18,116,249,0.18)] dark:shadow-[0_0_32px_rgba(18,116,249,0.22)]",
        selected
          ? "border border-selectable-edge-selected"
          : highlighted
            ? "border-ref-cta dark:border-[color:var(--trajectory-blue)]"
            : "border border-selectable-edge",
        disabled && "opacity-45 grayscale",
        !disabled && !selected && "hover:bg-[rgba(18,116,249,0.06)] dark:hover:bg-surface-elevated",
      )}
    >
      {topBadge ? (
        <span
          className={cn(
            "absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
            highlighted
              ? "border-ref-cta bg-ref-cta text-white dark:border-[color:var(--trajectory-blue)] dark:bg-[color:var(--trajectory-blue)]"
              : "border-border bg-nexus-approval text-white dark:border-border",
          )}
        >
          {topBadge}
        </span>
      ) : null}
      <div className="mb-3 text-center">
        <p className="font-sans text-base font-semibold tracking-normal text-black dark:text-white">{title}</p>
        <p className="mt-2 font-sans text-xl font-semibold tabular-nums text-black dark:text-white">{priceLabel}</p>
        <p className="mt-1 text-xs text-black/60 dark:text-white/55">{users}</p>
        <p className="text-xs text-black/60 dark:text-white/55">{emails}</p>
      </div>
      <ul className="mb-4 flex-1 space-y-1.5 border-t border-dashed border-border/40 pt-3 text-sm text-black/75 dark:border-border dark:text-white/75">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <span aria-hidden>
              <Check className="h-4 w-4 shrink-0 text-nexus-intake dark:text-nexus-intake" />
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
          "mt-auto inline-flex w-full cursor-pointer items-center justify-center rounded-full border border-border px-3 py-2 text-sm font-medium transition",
          disabled
            ? "cursor-not-allowed border-border/80 bg-black/[0.04] text-black/40 dark:border-border dark:text-white/40"
            : selected
              ? "bg-nexus-approval text-white hover:bg-[#2b82ff]"
              : "bg-white text-black hover:bg-[rgba(18,116,249,0.08)] dark:bg-surface-card dark:text-white dark:hover:bg-surface-elevated",
        )}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
