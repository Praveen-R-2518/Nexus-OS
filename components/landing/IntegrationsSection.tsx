"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { AnimatedHeading } from "@/components/landing/primitives/AnimatedHeading";
import { Eyebrow } from "@/components/landing/primitives/Eyebrow";
import { Reveal } from "@/components/landing/primitives/Reveal";
import { Section } from "@/components/landing/primitives/Section";
import { INTEGRATIONS } from "@/lib/landing/content";
import { DURATION, EASE, VIEWPORT } from "@/lib/landing/motion";

/**
 * Where Nexus sits in a stack you already own. Three lanes, hairline arrows
 * between them — a diagram, not an illustration.
 */
export function IntegrationsSection() {
  const reduce = useReducedMotion();

  return (
    <Section tone="page" rule width="wide" id="integrations">
      <div className="grid gap-10 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-16">
        <div>
          <Reveal>
            <Eyebrow>{INTEGRATIONS.eyebrow}</Eyebrow>
          </Reveal>
          <AnimatedHeading
            text={INTEGRATIONS.title}
            className="landing-section-headline mt-5 text-balance"
          />
          <Reveal delay={0.08}>
            <p className="mt-5 text-[16px] leading-[1.6] text-[#6e6e73]">
              {INTEGRATIONS.body}
            </p>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {INTEGRATIONS.lanes.map((lane, laneIndex) => (
            <div key={lane.id} className="contents">
              <Reveal
                delay={laneIndex * 0.08}
                className="rounded-2xl border border-[color:var(--apple-hairline)] bg-white p-5"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#86868b]">
                  {lane.label}
                </p>
                <ul className="mt-4 space-y-2">
                  {lane.nodes.map((node) => (
                    <li
                      key={node}
                      className="flex items-center gap-2.5 text-[14px] text-[#1d1d1f]"
                    >
                      <span
                        className="h-1 w-1 shrink-0 rounded-full bg-[#c7c7cc]"
                        aria-hidden
                      />
                      {node}
                    </li>
                  ))}
                </ul>
              </Reveal>

              {laneIndex < INTEGRATIONS.lanes.length - 1 ? (
                <motion.div
                  aria-hidden
                  className="flex items-center justify-center py-1 sm:py-0"
                  initial={reduce ? undefined : { opacity: 0 }}
                  whileInView={reduce ? undefined : { opacity: 1 }}
                  viewport={VIEWPORT}
                  transition={{
                    duration: DURATION.entrance,
                    ease: EASE,
                    delay: 0.15 + laneIndex * 0.08,
                  }}
                >
                  <ArrowRight className="h-4 w-4 rotate-90 text-[#c7c7cc] sm:rotate-0" />
                </motion.div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
