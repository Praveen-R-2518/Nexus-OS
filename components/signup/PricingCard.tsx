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
        "relative flex h-full flex-col rounded-2xl border bg-white p-5 transition sm:p-6",
        selected
          ? "border-[color:var(--nexus-approval)] landing-elev-2"
          : highlighted
            ? "border-[color:var(--nexus-approval)] landing-elev-1"
            : "border-[color:var(--apple-hairline)]",
        disabled && "opacity-45 grayscale",
        !disabled && !selected && "hover:bg-black/[0.02]",
      )}
    >
      {topBadge ? (
        <span
          className={cn(
            "absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]",
            highlighted || selected
              ? "bg-[color:var(--nexus-approval)] text-white"
              : "border border-[color:var(--apple-hairline)] bg-white text-[#6e6e73]",
          )}
        >
          {topBadge}
        </span>
      ) : null}
      <div className="mb-3 text-center">
        <p className="text-[15px] font-semibold tracking-normal text-[#1d1d1f]">{title}</p>
        <p className="mt-2 text-[22px] font-semibold tabular-nums text-[#1d1d1f]">{priceLabel}</p>
        <p className="mt-1 text-[12px] text-[#86868b]">{users}</p>
        <p className="text-[12px] text-[#86868b]">{emails}</p>
      </div>
      <ul className="mb-4 flex-1 space-y-1.5 border-t border-[color:var(--apple-hairline)] pt-3 text-[14px] text-[#6e6e73]">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <span aria-hidden>
              <Check className="h-4 w-4 shrink-0 text-[color:var(--nexus-intake)]" />
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
          "mt-auto inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-full border px-3 py-2 text-[14px] font-medium transition-colors",
          disabled
            ? "cursor-not-allowed border-[color:var(--apple-hairline)] bg-[#f5f5f7] text-[#86868b]"
            : selected
              ? "border-[color:var(--nexus-approval)] bg-[color:var(--nexus-approval)] text-white"
              : "border-[color:var(--apple-hairline)] bg-white text-[#1d1d1f] hover:bg-black/[0.03]",
        )}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
