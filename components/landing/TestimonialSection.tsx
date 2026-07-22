"use client";

import { AnimatedHeading } from "@/components/landing/primitives/AnimatedHeading";
import { Eyebrow } from "@/components/landing/primitives/Eyebrow";
import { Reveal } from "@/components/landing/primitives/Reveal";
import { Section } from "@/components/landing/primitives/Section";
import { TESTIMONIAL_SECTION } from "@/lib/landing/content";
import { TESTIMONIALS } from "@/lib/landing/testimonials";

function initialsOf(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

/**
 * Renders nothing until there are real, permissioned quotes in
 * `lib/landing/testimonials.ts`. The page is designed to look complete without
 * this section — an empty testimonial wall is worse than none, and a fabricated
 * one is worse than both.
 */
export function TestimonialSection() {
  if (TESTIMONIALS.length === 0) return null;

  return (
    <Section tone="alt" rule width="wide" id="customers">
      <div className="max-w-[720px]">
        <Reveal>
          <Eyebrow>{TESTIMONIAL_SECTION.eyebrow}</Eyebrow>
        </Reveal>
        <AnimatedHeading
          text={TESTIMONIAL_SECTION.title}
          className="landing-section-headline mt-5 text-balance"
        />
      </div>

      <ul className="mt-12 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {TESTIMONIALS.map((t, i) => (
          <Reveal
            key={t.name}
            as="li"
            delay={i * 0.05}
            className="flex h-full flex-col rounded-2xl border border-[color:var(--apple-hairline)] bg-white p-7"
          >
            <blockquote className="flex-1 text-[15px] leading-[1.6] text-[#1d1d1f]">
              “{t.quote}”
            </blockquote>
            <figcaption className="mt-6 flex items-center gap-3 border-t border-[color:var(--apple-hairline)] pt-5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f5f5f7] font-mono text-[11px] font-semibold text-[#6e6e73]"
                aria-hidden
              >
                {initialsOf(t.name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium text-[#1d1d1f]">
                  {t.name}
                </span>
                <span className="block truncate text-[12px] text-[#86868b]">
                  {t.role}
                </span>
              </span>
            </figcaption>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
