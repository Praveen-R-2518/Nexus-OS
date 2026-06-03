"use client";

import { useState } from "react";
import Link from "next/link";
import PricingCard from "@/components/signup/PricingCard";
import BillingToggle from "@/components/pricing/BillingToggle";
import {
  PRICING_TIERS,
  planTierToSlug,
  priceForTier,
} from "@/lib/pricing/plans";
import type { BillingCycle, PlanTier, SignupSnapshot } from "@/components/signup/types";
import { cn } from "@/lib/utils";

type StepPlanSelectionProps = {
  snapshot: SignupSnapshot;
  onComplete: (patch: Partial<SignupSnapshot> & { planTier: PlanTier; billingCycle: BillingCycle }) => void;
};

export default function StepPlanSelection({ snapshot, onComplete }: StepPlanSelectionProps) {
  const [cycle, setCycle] = useState<BillingCycle>(snapshot.billingCycle || "monthly");
  const [selected, setSelected] = useState<PlanTier>(snapshot.planTier ?? "starter");

  function handleNext() {
    onComplete({ planTier: selected, billingCycle: cycle });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-sans text-xl font-black uppercase tracking-tight text-foreground">
            Choose your plan
          </h2>
          <p className="mt-1 font-mono text-sm text-gray-500 dark:text-gray-400">
            Select Starter or Professional to continue. Enterprise is sales-assisted.
          </p>
        </div>
        <BillingToggle cycle={cycle} onChange={setCycle} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PRICING_TIERS.map((tier) => {
          const { display, compareAt } = priceForTier(tier, cycle);
          const priceLabel =
            tier.monthlyPrice === null
              ? "Custom"
              : compareAt
                ? `${display} (was ${compareAt})`
                : display;

          if (!tier.selectable) {
            return (
              <div
                key={tier.slug}
                className="relative flex h-full flex-col rounded-xl border border-selectable-edge bg-white p-4 sm:p-5 dark:bg-surface-card"
              >
                <div className="mb-3 text-center">
                  <p className="font-sans text-sm font-black uppercase tracking-tight text-black dark:text-white">
                    {tier.title}
                  </p>
                  <p className="mt-2 font-mono text-xl font-bold tabular-nums text-black dark:text-white">
                    Custom pricing
                  </p>
                </div>
                <ul className="mb-4 flex-1 space-y-1.5 border-t border-dashed border-border/40 pt-3 font-mono text-xs text-black/80 dark:border-border dark:text-white/75">
                  {tier.features.slice(0, 4).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <Link
                  href={tier.ctaHref}
                  className="mt-auto inline-flex w-full cursor-pointer items-center justify-center border border-border bg-white px-3 py-2 font-mono text-xs font-medium uppercase tracking-widest text-black transition hover:bg-[#e3eef6] dark:border-border dark:bg-surface-card dark:text-white dark:hover:bg-surface-elevated"
                >
                  Contact Sales
                </Link>
              </div>
            );
          }

          const dbTier = tier.dbTier;
          const isSelected = selected === dbTier;

          return (
            <PricingCard
              key={tier.slug}
              plan={dbTier}
              title={tier.title}
              priceLabel={priceLabel}
              users={tier.features[0] ?? ""}
              emails={tier.features[1] ?? ""}
              features={tier.features.slice(2)}
              recommended={tier.highlighted}
              badge={tier.slug === "starter" ? "Free Trial" : tier.badge}
              highlighted={tier.highlighted}
              selected={isSelected}
              onSelect={(plan) => setSelected(plan)}
              ctaLabel={isSelected ? "Selected" : "Select"}
            />
          );
        })}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleNext}
          className="inline-flex cursor-pointer items-center justify-center border border-border bg-[#0f2336] px-8 py-2.5 font-mono text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-[#172f45] dark:border-border"
        >
          Next →
        </button>
      </div>

      <p className="text-center font-mono text-[10px] uppercase tracking-wider text-muted">
        Current selection:{" "}
        <span className={cn("text-foreground")}>
          {planTierToSlug(selected).replace(/^./, (c) => c.toUpperCase())}
        </span>
        {" · "}
        {cycle === "monthly" ? "Monthly billing" : "Annual billing (25% off)"}
      </p>
    </div>
  );
}
