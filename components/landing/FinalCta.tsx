"use client";

import { AnimatedHeading } from "@/components/landing/primitives/AnimatedHeading";
import { LiftButton } from "@/components/landing/primitives/LiftButton";
import { Reveal } from "@/components/landing/primitives/Reveal";
import { FINAL_CTA } from "@/lib/landing/content";

/**
 * The end of the page is the other half of the peak-end rule: one idea, one
 * primary action, and nothing else competing for the click.
 */
export function FinalCta() {
  return (
    <section className="relative overflow-hidden border-t border-[color:var(--apple-hairline)] bg-[#f5f5f7] px-5 py-24 md:px-8 md:py-32">
      <div className="mx-auto flex w-full max-w-[720px] flex-col items-center text-center">
        <AnimatedHeading
          text={FINAL_CTA.title}
          className="landing-section-headline text-balance"
        />
        <Reveal delay={0.16}>
          <div className="mt-9">
            <LiftButton href={FINAL_CTA.primaryCta.href}>
              {FINAL_CTA.primaryCta.label}
            </LiftButton>
          </div>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-5 font-mono text-[11px] tracking-[0.06em] text-[#86868b]">
            {FINAL_CTA.microcopy}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
