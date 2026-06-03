"use client";

import { useState } from "react";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import BillingToggle from "@/components/pricing/BillingToggle";
import PricingFAQ from "@/components/pricing/PricingFAQ";
import PricingTierCard from "@/components/pricing/PricingTierCard";
import { PRICING_TIERS } from "@/lib/pricing/plans";
import type { BillingCycle } from "@/components/signup/types";

export default function PricingPage() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  return (
    <div className="flex flex-1 flex-col">
      <ScrollReveal className="text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-muted">
          Pricing
        </p>
        <h1 className="mt-4 font-sans text-4xl font-black uppercase tracking-tight text-atmospheric-grey dark:text-white md:text-5xl">
          Simple, transparent pricing
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted dark:text-slate-300">
          Start with a free trial on Starter, scale to Professional as your team grows,
          or talk to us for Enterprise. No hidden fees — just clear plans built for
          revenue teams.
        </p>
      </ScrollReveal>

      <ScrollReveal className="mt-12 flex justify-center">
        <BillingToggle cycle={cycle} onChange={setCycle} />
      </ScrollReveal>

      <ScrollReveal className="mt-14">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
          {PRICING_TIERS.map((tier) => (
            <PricingTierCard key={tier.slug} tier={tier} cycle={cycle} />
          ))}
        </div>
      </ScrollReveal>

      <ScrollReveal className="mt-24 md:mt-32">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-sans text-3xl font-semibold tracking-tight text-atmospheric-grey dark:text-white md:text-4xl">
            Frequently asked questions
          </h2>
          <p className="mt-3 text-muted dark:text-slate-400">
            Everything you need to know before you launch.
          </p>
        </div>
        <div className="mt-10">
          <PricingFAQ />
        </div>
      </ScrollReveal>
    </div>
  );
}
