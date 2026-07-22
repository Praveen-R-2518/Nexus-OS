"use client";

import { AnimatedHeading } from "@/components/landing/primitives/AnimatedHeading";
import { Eyebrow } from "@/components/landing/primitives/Eyebrow";
import { Odometer } from "@/components/landing/primitives/Odometer";
import { Reveal } from "@/components/landing/primitives/Reveal";
import { Section } from "@/components/landing/primitives/Section";
import { STAKES } from "@/lib/landing/content";

/**
 * The problem, stated once. The three figures describe the system's own
 * behaviour — never customer outcomes, which we have no right to claim.
 */
export function StakesSection() {
  return (
    <Section tone="alt" rule id="problem">
      <div className="max-w-[760px]">
        <Reveal>
          <Eyebrow>{STAKES.eyebrow}</Eyebrow>
        </Reveal>
        <AnimatedHeading
          text={STAKES.title}
          className="landing-section-headline mt-5 text-balance"
        />
        <Reveal delay={0.08}>
          <p className="mt-6 max-w-[620px] text-[17px] leading-[1.55] text-[#6e6e73]">
            {STAKES.body}
          </p>
        </Reveal>
      </div>

      <dl className="mt-14 grid grid-cols-1 border-t border-[color:var(--apple-hairline)] sm:grid-cols-3">
        {STAKES.stats.map((stat, i) => (
          <Reveal
            key={stat.label}
            delay={i * 0.08}
            className="border-b border-[color:var(--apple-hairline)] py-8 sm:border-b-0 sm:border-r sm:px-7 sm:first:pl-0 sm:last:border-r-0"
          >
            <dd className="flex items-baseline gap-1 text-[44px] font-semibold leading-none tracking-[-0.02em] text-[#1d1d1f]">
              <Odometer value={stat.value} suffix={stat.suffix} />
            </dd>
            <dt className="mt-3 text-[15px] font-medium text-[#1d1d1f]">
              {stat.label}
            </dt>
            <p className="mt-1.5 text-[13px] leading-[1.5] text-[#86868b]">
              {stat.note}
            </p>
          </Reveal>
        ))}
      </dl>
    </Section>
  );
}
