"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AnimatedHeading } from "@/components/landing/primitives/AnimatedHeading";
import { Eyebrow } from "@/components/landing/primitives/Eyebrow";
import { Reveal } from "@/components/landing/primitives/Reveal";
import { Section } from "@/components/landing/primitives/Section";
import { STEP_DIAGRAMS } from "@/components/landing/stepDiagrams";
import { ACCENT_VAR, PROTOCOL } from "@/lib/landing/content";
import { DURATION, EASE } from "@/lib/landing/motion";

/**
 * The six-step protocol. The index column pins while the step column scrolls,
 * and a rail fills in each step's own colour as you pass it.
 *
 * Active state comes from IntersectionObserver (`onViewportEnter`), not a
 * scroll scrub — so it costs nothing per frame and behaves the same on a phone,
 * where the pinned column collapses away entirely.
 */
export function ProtocolStepper() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  // A diagram draws itself once, the first time its card is seen, and stays
  // drawn afterwards — otherwise five of six cards would sit as empty boxes.
  const [drawn, setDrawn] = useState<number[]>([0]);
  const total = PROTOCOL.steps.length;

  const markDrawn = (i: number) =>
    setDrawn((prev) => (prev.includes(i) ? prev : [...prev, i]));

  return (
    <Section tone="alt" rule width="wide" id="protocol">
      <div className="max-w-[720px]">
        <Reveal>
          <Eyebrow>{PROTOCOL.eyebrow}</Eyebrow>
        </Reveal>
        <AnimatedHeading
          text={PROTOCOL.title}
          className="landing-section-headline mt-5 text-balance"
        />
      </div>

      <div className="mt-14 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
        {/* Pinned index — desktop only; on mobile each step carries its own
            number, so nothing is lost. */}
        <div className="hidden lg:block">
          <div className="sticky top-28">
            <div className="relative pl-5">
              <span
                className="absolute left-0 top-1 h-[calc(100%-0.5rem)] w-px bg-[color:var(--apple-hairline)]"
                aria-hidden
              />
              <motion.span
                aria-hidden
                className="absolute left-0 top-1 w-px origin-top"
                style={{
                  height: "calc(100% - 0.5rem)",
                  background: ACCENT_VAR[PROTOCOL.steps[active].accent],
                }}
                animate={{ scaleY: (active + 1) / total }}
                transition={reduce ? { duration: 0 } : { duration: 0.45, ease: EASE }}
              />
              <ol>
                {PROTOCOL.steps.map((step, i) => {
                  const on = i === active;
                  return (
                    <li key={step.id}>
                      {/* py-3 keeps each jump link at a 44px touch target
                          without needing extra list spacing. */}
                      <a
                        href={`#step-${step.id}`}
                        className="group flex min-h-11 items-baseline gap-3 py-3 text-[15px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nexus-approval)]"
                      >
                        <span
                          className="font-mono text-[10px] tabular-nums transition-colors duration-200"
                          style={{ color: on ? ACCENT_VAR[step.accent] : "#b0b0b5" }}
                        >
                          {step.index}
                        </span>
                        <span
                          className="font-medium transition-colors duration-200"
                          style={{ color: on ? "#1d1d1f" : "#86868b" }}
                        >
                          {step.title}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>

        <ol className="space-y-6">
          {PROTOCOL.steps.map((step, i) => {
            const Diagram = STEP_DIAGRAMS[step.id];
            const on = i === active;
            const accent = ACCENT_VAR[step.accent];

            return (
              <motion.li
                key={step.id}
                id={`step-${step.id}`}
                className="scroll-mt-28 overflow-hidden rounded-2xl border border-[color:var(--apple-hairline)] bg-white"
                onViewportEnter={() => setActive(i)}
                viewport={{ amount: 0.55, margin: "-20% 0px -20% 0px" }}
                initial={reduce ? undefined : { opacity: 0, y: 18 }}
                whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                transition={{ duration: DURATION.entrance, ease: EASE }}
              >
                <div className="grid gap-6 p-6 sm:grid-cols-[minmax(0,1fr)_260px] sm:items-center sm:p-8">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span
                        className="font-mono text-[11px] font-semibold tabular-nums"
                        style={{ color: accent }}
                      >
                        {step.index}
                      </span>
                      <span
                        className="h-px w-6 transition-colors duration-300"
                        style={{ background: on ? accent : "var(--apple-hairline)" }}
                        aria-hidden
                      />
                      <h3 className="text-[20px] font-semibold tracking-[-0.015em] text-[#1d1d1f]">
                        {step.title}
                      </h3>
                    </div>
                    <p className="mt-3.5 max-w-[46ch] text-[15px] leading-[1.6] text-[#6e6e73]">
                      {step.body}
                    </p>
                  </div>

                  <motion.div
                    className="rounded-xl bg-[#fbfbfd] p-3"
                    onViewportEnter={() => markDrawn(i)}
                    viewport={{ once: true, amount: 0.4 }}
                    animate={{ opacity: on ? 1 : 0.5 }}
                    transition={reduce ? { duration: 0 } : { duration: 0.35, ease: EASE }}
                  >
                    <Diagram
                      active={drawn.includes(i) || Boolean(reduce)}
                      accent={step.accent}
                    />
                  </motion.div>
                </div>
              </motion.li>
            );
          })}
        </ol>
      </div>
    </Section>
  );
}
