"use client";

import Link from "next/link";
import { ArrowUpRight, Quote, ShieldCheck, Layers, Ban } from "lucide-react";
import { FinalCta } from "@/components/landing/FinalCta";
import { ChannelMarquee } from "@/components/landing/ChannelMarquee";
import { AnimatedHeading } from "@/components/landing/primitives/AnimatedHeading";
import { Eyebrow } from "@/components/landing/primitives/Eyebrow";
import { LiftButton } from "@/components/landing/primitives/LiftButton";
import { Odometer } from "@/components/landing/primitives/Odometer";
import { Reveal } from "@/components/landing/primitives/Reveal";
import { Section } from "@/components/landing/primitives/Section";
import { TracedCard } from "@/components/landing/primitives/TracedCard";
import { STAKES, TRUST } from "@/lib/landing/content";
import { TESTIMONIALS } from "@/lib/landing/testimonials";

/**
 * Honest social proof only — the same capability figures and architecture
 * guarantees as the landing page. Named customer quotes render when
 * `lib/landing/testimonials.ts` is filled in; until then this page still
 * reads complete without inventing outcomes.
 */

const capabilityStats = STAKES.stats;

function initialsOf(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function CustomersPage() {
  return (
    <div className="flex-1 bg-white text-[#1d1d1f]">
      <Section tone="page" width="wide">
        <Reveal>
          <Eyebrow>Customers</Eyebrow>
        </Reveal>
        <AnimatedHeading
          text="Built for teams who refuse to lose deals in the inbox"
          className="landing-section-headline mt-5 max-w-[720px] text-balance"
        />
        <Reveal delay={0.08}>
          <p className="mt-5 max-w-[560px] text-[17px] leading-[1.55] text-[#6e6e73]">
            Nexus OS is a revenue command center — every message triaged, every
            reply drafted, nothing sent without you. The figures below describe
            the system as built, not invented customer outcomes.
          </p>
        </Reveal>
      </Section>

      <Section tone="alt" rule width="wide">
        <dl className="grid grid-cols-1 border-t border-[color:var(--apple-hairline)] sm:grid-cols-3">
          {capabilityStats.map((stat, i) => (
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

      <ChannelMarquee />

      <Section tone="page" rule width="wide">
        <Reveal>
          <Eyebrow>Why teams switch</Eyebrow>
        </Reveal>
        <AnimatedHeading
          text="The boring guarantees, in writing."
          className="landing-section-headline mt-5 max-w-[640px] text-balance"
        />
        <div className="mt-12 grid grid-cols-1 gap-3 md:grid-cols-3">
          {TRUST.items.slice(0, 3).map((item, i) => {
            const Icon = i === 0 ? ShieldCheck : i === 1 ? Layers : Ban;
            return (
              <Reveal key={item.id} delay={i * 0.05} className="h-full">
                <TracedCard className="h-full p-7">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[color:var(--nexus-approval-soft)] text-[color:var(--nexus-approval)]">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-[16px] font-semibold text-[#1d1d1f]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[14px] leading-[1.55] text-[#6e6e73]">
                    {item.body}
                  </p>
                </TracedCard>
              </Reveal>
            );
          })}
        </div>
      </Section>

      {TESTIMONIALS.length > 0 ? (
        <Section tone="alt" rule width="wide">
          <Reveal>
            <Eyebrow>In their words</Eyebrow>
          </Reveal>
          <AnimatedHeading
            text="What teams say after the first week."
            className="landing-section-headline mt-5"
          />
          <ul className="mt-12 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <Reveal
                key={t.name}
                as="li"
                delay={i * 0.05}
                className="flex h-full flex-col rounded-2xl border border-[color:var(--apple-hairline)] bg-white p-7"
              >
                <Quote
                  className="h-5 w-5 text-[color:var(--nexus-approval)]"
                  aria-hidden
                />
                <blockquote className="mt-4 flex-1 text-[15px] leading-[1.6] text-[#1d1d1f]">
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
      ) : (
        <Section tone="alt" rule width="wide">
          <Reveal>
            <div className="rounded-2xl border border-[color:var(--apple-hairline)] bg-white p-8 md:p-10 landing-elev-1">
              <Eyebrow>Case studies</Eyebrow>
              <h2 className="mt-4 text-[22px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
                Real customer stories land here when we have permission to share them.
              </h2>
              <p className="mt-3 max-w-[520px] text-[15px] leading-[1.55] text-[#6e6e73]">
                We do not invent quotes or revenue outcomes. Until named
                references exist, the architecture guarantees above are the
                proof you can verify in the product.
              </p>
              <div className="mt-7">
                <LiftButton href="/signup">Start free trial</LiftButton>
              </div>
            </div>
          </Reveal>
        </Section>
      )}

      <Section tone="page" rule width="wide">
        <Reveal>
          <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-[color:var(--apple-hairline)] bg-[#f5f5f7] p-8 md:flex-row md:items-center md:p-10">
            <div>
              <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
                Your team could be next
              </h2>
              <p className="mt-2 max-w-[480px] text-[15px] leading-[1.55] text-[#6e6e73]">
                Connect one inbox and see what the last thirty days were hiding.
              </p>
            </div>
            <Link
              href="/signup"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-[color:var(--nexus-approval)] px-6 text-[15px] font-medium text-white transition-colors hover:bg-[#2b82ff]"
            >
              Start now
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </Reveal>
      </Section>

      <FinalCta />
    </div>
  );
}
