"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Plus } from "lucide-react";
import { AnimatedHeading } from "@/components/landing/primitives/AnimatedHeading";
import { Eyebrow } from "@/components/landing/primitives/Eyebrow";
import { Reveal } from "@/components/landing/primitives/Reveal";
import { Section } from "@/components/landing/primitives/Section";
import { FAQ_SECTION } from "@/lib/landing/content";
import { DURATION, EASE } from "@/lib/landing/motion";
import { PRICING_FAQ } from "@/lib/pricing/plans";

/**
 * Hairline accordion over the same FAQ copy `/pricing` uses. A rotating plus
 * rather than a chevron, so the closed state reads as "there is more here".
 */
export function FaqSection() {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <Section tone="alt" rule id="faq">
      <div className="max-w-[640px]">
        <Reveal>
          <Eyebrow>{FAQ_SECTION.eyebrow}</Eyebrow>
        </Reveal>
        <AnimatedHeading
          text={FAQ_SECTION.title}
          className="landing-section-headline mt-5"
        />
      </div>

      <div className="mt-10 border-t border-[color:var(--apple-hairline)]">
        {PRICING_FAQ.map((item, i) => {
          const isOpen = open === i;
          return (
            <div
              key={item.question}
              className="border-b border-[color:var(--apple-hairline)]"
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                aria-controls={`faq-${i}`}
                className="group flex w-full cursor-pointer items-center justify-between gap-6 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nexus-approval)]"
              >
                <span className="text-[16px] font-medium text-[#1d1d1f]">
                  {item.question}
                </span>
                <motion.span
                  className="shrink-0 text-[#86868b] transition-colors group-hover:text-[#1d1d1f]"
                  animate={{ rotate: isOpen ? 45 : 0 }}
                  transition={{ duration: DURATION.micro, ease: EASE }}
                  aria-hidden
                >
                  <Plus className="h-4 w-4" />
                </motion.span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen ? (
                  <motion.div
                    id={`faq-${i}`}
                    className="overflow-hidden"
                    initial={reduce ? false : { height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={reduce ? undefined : { height: 0, opacity: 0 }}
                    transition={{ duration: DURATION.short, ease: EASE }}
                  >
                    <p className="max-w-[58ch] pb-6 pr-10 text-[15px] leading-[1.6] text-[#6e6e73]">
                      {item.answer}
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
