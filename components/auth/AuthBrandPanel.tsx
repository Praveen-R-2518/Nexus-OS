"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PipelineFlow } from "@/components/landing/PipelineFlow";
import type { AuthBrandCopy } from "@/lib/auth/brandCopy";
import { DURATION, EASE, STAGGER } from "@/lib/landing/motion";

/**
 * Left brand panel — Nexus product story + compact PipelineFlow loop.
 * Copy crossfades when signup step changes.
 */
export function AuthBrandPanel({ copy }: { copy: AuthBrandCopy }) {
  const reduce = useReducedMotion();

  return (
    <aside className="relative flex h-full flex-col justify-between overflow-hidden border-b border-[color:var(--apple-hairline)] bg-white px-6 py-8 lg:border-b-0 lg:border-r lg:px-10 lg:py-12 xl:px-14">
      <div>
        <Link
          href="/"
          className="inline-flex items-center font-sans text-lg font-semibold tracking-normal text-[#1d1d1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nexus-approval)] focus-visible:ring-offset-2"
        >
          <span className="logo-nexus">Nexus</span>
          <span className="logo-os"> OS</span>
        </Link>

        <AnimatePresence mode="wait">
          <motion.div
            key={copy.headline}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: DURATION.short, ease: EASE }}
            className="mt-10 lg:mt-14"
          >
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#6e6e73]">
              {copy.eyebrow}
            </p>
            <h1 className="mt-4 max-w-[20ch] text-[clamp(1.75rem,2.6vw,2.65rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-[#1d1d1f]">
              {copy.headline}
            </h1>

            <ul className="mt-8 max-w-md space-y-0 border-t border-[color:var(--apple-hairline)]">
              {copy.points.map((point, i) => (
                <motion.li
                  key={point}
                  initial={reduce ? false : { opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: DURATION.entrance,
                    ease: EASE,
                    delay: reduce ? 0 : 0.08 + i * STAGGER.item,
                  }}
                  className="border-b border-[color:var(--apple-hairline)] py-3.5 text-[15px] leading-[1.5] text-[#6e6e73]"
                >
                  {point}
                </motion.li>
              ))}
            </ul>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-10 hidden lg:block">
        <div className="overflow-hidden rounded-2xl border border-[color:var(--apple-hairline)] bg-[#f5f5f7] p-3 landing-elev-1">
          <PipelineFlow />
        </div>
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.14em] text-[#86868b]">
          {copy.footer}
        </p>
      </div>

      {/* Mobile: footer only — pipeline stays desktop to keep the form first. */}
      <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.14em] text-[#86868b] lg:hidden">
        {copy.footer}
      </p>
    </aside>
  );
}
