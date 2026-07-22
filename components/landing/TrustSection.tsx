"use client";

import { AnimatedHeading } from "@/components/landing/primitives/AnimatedHeading";
import { Eyebrow } from "@/components/landing/primitives/Eyebrow";
import { Reveal } from "@/components/landing/primitives/Reveal";
import { Section } from "@/components/landing/primitives/Section";
import { TRUST } from "@/lib/landing/content";

/**
 * A bare hairline grid rather than cards — the contrast with the bento above is
 * deliberate: this section should read as a specification, not a sales pitch.
 *
 * Every claim here is a property of the system as built. If one stops being
 * true, delete it rather than softening the wording.
 */
export function TrustSection() {
  return (
    <Section tone="alt" rule width="wide" id="architecture">
      <div className="max-w-[720px]">
        <Reveal>
          <Eyebrow>{TRUST.eyebrow}</Eyebrow>
        </Reveal>
        <AnimatedHeading
          text={TRUST.title}
          className="landing-section-headline mt-5 text-balance"
        />
        <Reveal delay={0.08}>
          <p className="mt-5 text-[17px] leading-[1.55] text-[#6e6e73]">
            {TRUST.body}
          </p>
        </Reveal>
      </div>

      <dl className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-[color:var(--apple-hairline)] bg-[color:var(--apple-hairline)] sm:grid-cols-2 lg:grid-cols-3">
        {TRUST.items.map((item, i) => (
          <Reveal
            key={item.id}
            delay={i * 0.04}
            className="bg-white p-7"
          >
            <dt className="flex items-baseline gap-3">
              <span className="font-mono text-[10px] tabular-nums text-[#b0b0b5]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[16px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">
                {item.title}
              </span>
            </dt>
            <dd className="mt-3 pl-[26px] text-[14px] leading-[1.6] text-[#6e6e73]">
              {item.body}
            </dd>
          </Reveal>
        ))}
      </dl>
    </Section>
  );
}
