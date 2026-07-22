"use client";

import { motion, useReducedMotion } from "framer-motion";
import { PipelineFlow } from "@/components/landing/PipelineFlow";
import { AnimatedHeading } from "@/components/landing/primitives/AnimatedHeading";
import { Eyebrow } from "@/components/landing/primitives/Eyebrow";
import { LiftButton } from "@/components/landing/primitives/LiftButton";
import { HERO } from "@/lib/landing/content";
import { DURATION, EASE } from "@/lib/landing/motion";

/**
 * One idea, one call to action, nothing competing. The pipeline animation below
 * the fold-line is the page's peak moment — everything above it is quiet on
 * purpose so the eye lands there.
 */
export function Hero() {
  const reduce = useReducedMotion();

  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: DURATION.entrance, ease: EASE, delay },
        };

  return (
    <section className="relative overflow-hidden bg-white px-5 pb-16 pt-12 md:px-8 md:pb-20 md:pt-14">
      <div className="mx-auto w-full max-w-[1120px]">
        <div className="mx-auto flex max-w-[900px] flex-col items-center text-center">
          <motion.div {...rise(0)}>
            <Eyebrow align="center">{HERO.eyebrow}</Eyebrow>
          </motion.div>

          <AnimatedHeading
            as="h1"
            text={HERO.headline}
            /* Two-tone: the first two promises are context, the third is the
               product's actual differentiator — so it gets the ink. */
            className="landing-hero-headline mt-7 text-balance text-[#6e6e73]"
            accentFrom={6}
            accentColor="#1d1d1f"
            delay={0.1}
          />

          <motion.p
            className="mt-6 max-w-[600px] text-[17px] leading-[1.5] text-[#6e6e73]"
            {...rise(0.24)}
          >
            {HERO.subhead}
          </motion.p>

          <motion.div
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
            {...rise(0.32)}
          >
            <LiftButton href={HERO.primaryCta.href}>
              {HERO.primaryCta.label}
            </LiftButton>
            <LiftButton href={HERO.secondaryCta.href} variant="secondary">
              {HERO.secondaryCta.label}
            </LiftButton>
          </motion.div>

          <motion.p
            className="mt-5 font-mono text-[11px] tracking-[0.06em] text-[#86868b]"
            {...rise(0.38)}
          >
            {HERO.microcopy}
          </motion.p>
        </div>

        <motion.div
          className="mt-10 md:mt-12"
          {...(reduce
            ? {}
            : {
                initial: { opacity: 0, y: 24 },
                animate: { opacity: 1, y: 0 },
                transition: { duration: 0.8, ease: EASE, delay: 0.45 },
              })}
        >
          <PipelineFlow />
        </motion.div>
      </div>
    </section>
  );
}
