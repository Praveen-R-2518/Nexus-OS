"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AppPanel, AppWindowFrame } from "@/components/landing/AppWindow";
import { AnimatedHeading } from "@/components/landing/primitives/AnimatedHeading";
import { Eyebrow } from "@/components/landing/primitives/Eyebrow";
import { Reveal } from "@/components/landing/primitives/Reveal";
import { Section } from "@/components/landing/primitives/Section";
import { ACCENT_VAR, TOUR } from "@/lib/landing/content";
import { DURATION, EASE } from "@/lib/landing/motion";

const DWELL_MS = 6000;

/**
 * Three stops through the product, on tabs rather than a tall pinned scroll.
 *
 * Tabs auto-advance, and the underline fills over the dwell so the rotation is
 * legible instead of surprising. Any interaction — hover, focus, a click —
 * stops the rotation for good; nothing should move under someone who is reading.
 */
export function ProductTour() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = TOUR.stops[active];
  const accent = ACCENT_VAR[stop.accent];

  const halt = useCallback(() => setAutoplay(false), []);

  useEffect(() => {
    if (!autoplay || reduce) return;
    timer.current = setInterval(() => {
      setActive((i) => (i + 1) % TOUR.stops.length);
    }, DWELL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [autoplay, reduce]);

  return (
    <Section tone="page" rule width="wide" id="product">
      <div className="max-w-[720px]">
        <Reveal>
          <Eyebrow>{TOUR.eyebrow}</Eyebrow>
        </Reveal>
        <AnimatedHeading
          text={TOUR.title}
          className="landing-section-headline mt-5 text-balance"
        />
      </div>

      <div
        className="mt-10"
        onMouseEnter={halt}
        onFocusCapture={halt}
        onTouchStart={halt}
      >
        <div
          className="flex flex-wrap gap-2 border-b border-[color:var(--apple-hairline)]"
          role="tablist"
          aria-label="Product tour"
        >
          {TOUR.stops.map((s, i) => {
            const on = i === active;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={`tour-panel-${s.id}`}
                id={`tour-tab-${s.id}`}
                onClick={() => {
                  setActive(i);
                  halt();
                }}
                className={`relative min-h-11 cursor-pointer px-1 pb-3.5 pt-3 text-[15px] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nexus-approval)] focus-visible:ring-offset-2 ${
                  on ? "text-[#1d1d1f]" : "text-[#86868b] hover:text-[#1d1d1f]"
                } ${i > 0 ? "ml-5" : ""}`}
              >
                {s.tab}
                {on ? (
                  <motion.span
                    aria-hidden
                    className="absolute inset-x-0 -bottom-px h-0.5 origin-left"
                    style={{ background: ACCENT_VAR[s.accent] }}
                    // Fills over the dwell so the rotation is predictable;
                    // once autoplay stops it is simply a full underline.
                    initial={reduce ? { scaleX: 1 } : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{
                      duration: reduce || !autoplay ? 0.28 : DWELL_MS / 1000,
                      ease: autoplay && !reduce ? "linear" : EASE,
                    }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-10">
          <div
            role="tabpanel"
            id={`tour-panel-${stop.id}`}
            aria-labelledby={`tour-tab-${stop.id}`}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={stop.id}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: DURATION.short, ease: EASE }}
              >
                <span
                  className="inline-block h-0.5 w-8 rounded-full"
                  style={{ background: accent }}
                  aria-hidden
                />
                <h3 className="mt-4 text-[22px] font-semibold tracking-[-0.015em] text-[#1d1d1f]">
                  {stop.title}
                </h3>
                <p className="mt-3 text-[15px] leading-[1.6] text-[#6e6e73]">
                  {stop.body}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          <AppWindowFrame stopId={stop.id}>
            <AnimatePresence mode="wait">
              <motion.div
                key={stop.id}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: DURATION.short, ease: EASE }}
              >
                <AppPanel stopId={stop.id} />
              </motion.div>
            </AnimatePresence>
          </AppWindowFrame>
        </div>
      </div>
    </Section>
  );
}
