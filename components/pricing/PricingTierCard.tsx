"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import type { BillingCycle } from "@/components/signup/types";
import { priceForTier, type PricingTier } from "@/lib/pricing/plans";
import { cn } from "@/lib/utils";

type PricingTierCardProps = {
  tier: PricingTier;
  cycle: BillingCycle;
};

export default function PricingTierCard({ tier, cycle }: PricingTierCardProps) {
  const { display, compareAt } = priceForTier(tier, cycle);
  const isMailto = tier.ctaHref.startsWith("mailto:");

  return (
    <article
      className={cn(
        "relative flex h-full flex-col rounded-[2rem] border bg-white p-8 shadow-card-halo-light backdrop-blur-md transition-all duration-300 dark:bg-[#161616]",
        tier.highlighted
          ? "border-nexus-approval shadow-[0_0_32px_rgba(18,116,249,0.18)] dark:border-nexus-approval dark:shadow-[0_0_36px_rgba(18,116,249,0.22)]"
          : "border-border hover:border-slate-300 dark:border-white/15 dark:hover:border-white/35",
      )}
    >
      {tier.badge ? (
        <span
          className={cn(
            "absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold tracking-normal",
            tier.highlighted
              ? "border-nexus-approval bg-nexus-approval text-white"
              : "border-nexus-discovery-border bg-nexus-discovery-soft text-nexus-discovery dark:border-white/20 dark:bg-[#252525] dark:text-white",
          )}
        >
          {tier.badge}
        </span>
      ) : null}

      <div className="text-center">
        <p className="nexus-meta text-muted dark:text-slate-400">
          {tier.title}
        </p>
        <div className="mt-4 flex flex-col items-center gap-1">
          {compareAt ? (
            <span className="font-mono text-sm text-muted line-through decoration-muted/60 dark:text-slate-400">
              {compareAt}
            </span>
          ) : null}
          <p className="font-sans text-3xl font-semibold tabular-nums tracking-normal text-atmospheric-grey dark:text-white">
            {display}
          </p>
          {cycle === "annual" && tier.annualMonthlyPrice !== null ? (
            <p className="text-xs font-medium tracking-normal text-muted dark:text-slate-400">
              Billed annually
            </p>
          ) : null}
        </div>
      </div>

      <ul className="mt-8 flex-1 space-y-3 border-t border-dashed border-border pt-6 dark:border-white/10">
        {tier.features.map((feature) => (
          <li key={feature} className="flex gap-3 text-sm text-muted dark:text-slate-300">
            <Check
              className="mt-0.5 h-4 w-4 shrink-0 text-nexus-intake"
              aria-hidden
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {isMailto ? (
        <a
          href={tier.ctaHref}
          className="mt-8 inline-flex w-full cursor-pointer items-center justify-center rounded-full border border-border bg-transparent px-6 py-3.5 text-[15px] font-medium tracking-normal text-atmospheric-grey transition hover:bg-nexus-approval-soft dark:border-white/20 dark:text-white dark:hover:bg-[#252525]"
        >
          {tier.ctaLabel}
        </a>
      ) : (
        <Link
          href={tier.ctaHref}
          className={cn(
            "mt-8 inline-flex w-full cursor-pointer items-center justify-center rounded-full px-6 py-3.5 text-[15px] font-medium tracking-normal transition",
            tier.highlighted
              ? "border border-nexus-approval bg-nexus-approval text-white hover:opacity-90"
              : "border border-border bg-nexus-approval text-white hover:bg-[#2b82ff] dark:border-white/20 dark:bg-[#252525] dark:hover:bg-[#2f2f2f]",
          )}
        >
          {tier.ctaLabel}
        </Link>
      )}
    </article>
  );
}
