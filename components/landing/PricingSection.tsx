"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { LandingBillingToggle } from "@/components/landing/LandingBillingToggle";
import { AnimatedHeading } from "@/components/landing/primitives/AnimatedHeading";
import { Eyebrow } from "@/components/landing/primitives/Eyebrow";
import { Reveal } from "@/components/landing/primitives/Reveal";
import { Section } from "@/components/landing/primitives/Section";
import type { BillingCycle } from "@/components/signup/types";
import { PRICING } from "@/lib/landing/content";
import { DURATION, EASE } from "@/lib/landing/motion";
import { PRICING_TIERS, priceForTier, type PricingTier } from "@/lib/pricing/plans";
import { cn } from "@/lib/utils";

/**
 * Plans come from `lib/pricing/plans.ts`, the same source `/pricing` and signup
 * read — there is one price list in this codebase and this is not a second copy.
 * Only the presentation is landing-specific (the shared cards carry `dark:`
 * utilities that would fire on this light-locked page).
 */

function TierCard({ tier, cycle }: { tier: PricingTier; cycle: BillingCycle }) {
  const reduce = useReducedMotion();
  const { display, compareAt } = priceForTier(tier, cycle);
  const isMailto = tier.ctaHref.startsWith("mailto:");
  const featured = Boolean(tier.highlighted);

  const cta = cn(
    "mt-7 inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-full px-6 text-[15px] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nexus-approval)] focus-visible:ring-offset-2",
    featured
      ? "bg-[color:var(--nexus-approval)] text-white hover:bg-[#2b82ff]"
      : "border border-[color:var(--apple-hairline)] bg-white text-[#1d1d1f] hover:bg-black/[0.03]",
  );

  return (
    <motion.article
      className={cn(
        "relative flex h-full flex-col rounded-2xl bg-white p-7 sm:p-8",
        featured
          ? "border border-[color:var(--nexus-approval)] landing-elev-2"
          : "border border-[color:var(--apple-hairline)] landing-elev-1",
      )}
      whileHover={reduce ? undefined : { y: -2 }}
      transition={{ duration: 0.22, ease: EASE }}
    >
      {featured && tier.badge ? (
        /* The badge *is* the top border — a tab cut into the hairline ring. */
        <span className="absolute -top-px left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center rounded-full bg-[color:var(--nexus-approval)] px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-white">
          {tier.badge}
        </span>
      ) : tier.badge ? (
        <span className="absolute -top-3 left-7 rounded-full border border-[color:var(--apple-hairline)] bg-white px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6e6e73]">
          {tier.badge}
        </span>
      ) : null}

      <h3 className="text-[15px] font-semibold text-[#1d1d1f]">{tier.title}</h3>

      {/* Keyed remount rather than AnimatePresence: the old price should just
          go, and an exit animation that has to finish before the new one mounts
          can strand the card mid-swap. */}
      <div className="mt-5 flex min-h-[54px] items-baseline gap-2.5">
        <motion.span
          key={display}
          className="text-[34px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-[#1d1d1f]"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.short, ease: EASE }}
        >
          {display}
        </motion.span>
        {compareAt ? (
          <motion.span
            key={compareAt}
            className="font-mono text-[13px] text-[#b0b0b5] line-through"
            initial={reduce ? false : { opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: DURATION.short, ease: EASE, delay: 0.06 }}
          >
            {compareAt}
          </motion.span>
        ) : null}
      </div>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#86868b]">
        {tier.monthlyPrice === null
          ? "Talk to us"
          : cycle === "annual"
            ? "Billed annually"
            : "Billed monthly"}
      </p>

      <ul className="mt-7 flex-1 space-y-3 border-t border-[color:var(--apple-hairline)] pt-6">
        {tier.features.map((feature) => (
          <li key={feature} className="flex gap-2.5 text-[14px] leading-[1.5] text-[#6e6e73]">
            <Check
              className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--nexus-intake)]"
              aria-hidden
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {isMailto ? (
        <a href={tier.ctaHref} className={cta}>
          {tier.ctaLabel}
        </a>
      ) : (
        <Link href={tier.ctaHref} className={cta}>
          {tier.ctaLabel}
        </Link>
      )}
    </motion.article>
  );
}

export function PricingSection() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  return (
    <Section tone="page" rule width="wide" id="pricing">
      <div className="max-w-[720px]">
        <Reveal>
          <Eyebrow>{PRICING.eyebrow}</Eyebrow>
        </Reveal>
        <AnimatedHeading
          text={PRICING.title}
          className="landing-section-headline mt-5 text-balance"
        />
        <Reveal delay={0.08}>
          <p className="mt-5 text-[17px] leading-[1.55] text-[#6e6e73]">
            {PRICING.body}
          </p>
        </Reveal>
      </div>

      <Reveal delay={0.12} className="mt-10">
        <LandingBillingToggle cycle={cycle} onChange={setCycle} />
      </Reveal>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {PRICING_TIERS.map((tier, i) => (
          <Reveal key={tier.slug} delay={i * 0.06} className="h-full">
            <TierCard tier={tier} cycle={cycle} />
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.1}>
        <p className="mt-8 max-w-[640px] text-[13px] leading-[1.6] text-[#86868b]">
          {PRICING.footnote}{" "}
          <Link href="/pricing" className="landing-link text-[color:var(--nexus-approval)]">
            Full plan comparison
          </Link>
        </p>
      </Reveal>
    </Section>
  );
}
