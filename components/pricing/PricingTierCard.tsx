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
        "relative flex h-full flex-col rounded-[2rem] border bg-white p-8 shadow-xl backdrop-blur-md transition-all duration-300 dark:bg-[#161616]",
        tier.highlighted
          ? "border-ref-cta shadow-[0_0_32px_rgba(12,74,110,0.35)] dark:border-[color:var(--trajectory-blue)] dark:shadow-[0_0_40px_rgba(12,74,110,0.45)]"
          : "border-border hover:border-slate-300 dark:border-white/15 dark:hover:border-white/35",
      )}
    >
      {tier.badge ? (
        <span
          className={cn(
            "absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border px-3 py-1 font-mono text-[9px] font-semibold uppercase tracking-widest",
            tier.highlighted
              ? "border-ref-cta bg-ref-cta text-white dark:border-[color:var(--trajectory-blue)] dark:bg-[color:var(--trajectory-blue)]"
              : "border-border bg-[#eef6fb] text-[#0f2336] dark:border-white/20 dark:bg-[#252525] dark:text-white",
          )}
        >
          {tier.badge}
        </span>
      ) : null}

      <div className="text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-muted">
          {tier.title}
        </p>
        <div className="mt-4 flex flex-col items-center gap-1">
          {compareAt ? (
            <span className="font-mono text-sm text-muted line-through decoration-muted/60">
              {compareAt}
            </span>
          ) : null}
          <p className="font-sans text-3xl font-black tabular-nums tracking-tight text-atmospheric-grey dark:text-white">
            {display}
          </p>
          {cycle === "annual" && tier.annualMonthlyPrice !== null ? (
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
              Billed annually
            </p>
          ) : null}
        </div>
      </div>

      <ul className="mt-8 flex-1 space-y-3 border-t border-dashed border-border pt-6 dark:border-white/10">
        {tier.features.map((feature) => (
          <li key={feature} className="flex gap-3 text-sm text-muted dark:text-slate-300">
            <Check
              className="mt-0.5 h-4 w-4 shrink-0 text-ref-cta dark:text-[color:var(--trajectory-blue)]"
              aria-hidden
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {isMailto ? (
        <a
          href={tier.ctaHref}
          className="mt-8 inline-flex w-full cursor-pointer items-center justify-center rounded-full border border-border bg-transparent px-6 py-3.5 font-mono text-xs font-semibold uppercase tracking-widest text-atmospheric-grey transition hover:bg-ref-mint dark:border-white/20 dark:text-white dark:hover:bg-[#252525]"
        >
          {tier.ctaLabel}
        </a>
      ) : (
        <Link
          href={tier.ctaHref}
          className={cn(
            "mt-8 inline-flex w-full cursor-pointer items-center justify-center rounded-full px-6 py-3.5 font-mono text-xs font-semibold uppercase tracking-widest transition",
            tier.highlighted
              ? "border border-ref-cta bg-ref-cta text-[#f4f8fc] hover:opacity-90 dark:border-[color:var(--trajectory-blue)] dark:bg-[color:var(--trajectory-blue)]"
              : "border border-border bg-[#0f2336] text-white hover:bg-[#172f45] dark:border-white/20 dark:bg-[#252525] dark:hover:bg-[#2f2f2f]",
          )}
        >
          {tier.ctaLabel}
        </Link>
      )}
    </article>
  );
}
