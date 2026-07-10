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
        "relative flex h-full flex-col rounded-xl border bg-glass p-4 transition sm:p-5",
        highlighted &&
          "shadow-[0_0_24px_rgba(18,116,249,0.18)] dark:shadow-[0_0_32px_rgba(18,116,249,0.22)]",
        selected
          ? "border border-selectable-edge-selected"
          : highlighted
            ? "border-ref-cta dark:border-[color:var(--trajectory-blue)]"
            : "border border-glass-border",
        disabled && "opacity-45 grayscale",
        !disabled && !selected && "hover:bg-glass",
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
        <p className="font-sans text-base font-semibold tracking-normal text-atmospheric-grey">{title}</p>
        <p className="mt-2 font-sans text-xl font-semibold tabular-nums text-atmospheric-grey">{priceLabel}</p>
        <p className="mt-1 text-xs text-muted">{users}</p>
        <p className="text-xs text-muted">{emails}</p>
      </div>
      <ul className="mb-4 flex-1 space-y-1.5 hairline-t pt-3 text-sm text-muted">
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
          "mt-auto inline-flex w-full cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
          disabled
            ? "cursor-not-allowed border-glass-border bg-glass text-muted"
            : selected
              ? "border-nexus-approval-border bg-nexus-approval-soft text-nexus-approval"
              : "glass-pill text-atmospheric-grey hover:bg-glass",
        )}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
