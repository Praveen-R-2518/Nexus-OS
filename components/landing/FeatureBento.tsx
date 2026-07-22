"use client";

import {
  Inbox,
  LineChart,
  PenLine,
  ShieldCheck,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { AnimatedHeading } from "@/components/landing/primitives/AnimatedHeading";
import { Eyebrow } from "@/components/landing/primitives/Eyebrow";
import { Reveal } from "@/components/landing/primitives/Reveal";
import { Section } from "@/components/landing/primitives/Section";
import { TracedCard } from "@/components/landing/primitives/TracedCard";
import { ACCENT_SOFT, ACCENT_VAR, FEATURES } from "@/lib/landing/content";
import { cn } from "@/lib/utils";

/**
 * Asymmetric 4-column bento: two wide cells carry the load-bearing claims, four
 * small ones fill in the rest. Each card keeps one tiny always-on micro-loop
 * that names its job; hover adds the border trace + 2px lift.
 */

const ICONS: Record<string, LucideIcon> = {
  filter: SlidersHorizontal,
  classify: Target,
  draft: PenLine,
  queue: ShieldCheck,
  inbox: Inbox,
  report: LineChart,
};

function MicroLoop({
  id,
  accent,
  soft,
}: {
  id: string;
  accent: string;
  soft: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <span
        className="mt-5 block h-8 w-full rounded-md"
        style={{ background: soft }}
        aria-hidden
      />
    );
  }

  switch (id) {
    case "filter":
      return (
        <svg viewBox="0 0 120 32" className="mt-5 h-8 w-full" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <motion.rect
              key={i}
              x={8 + i * 28}
              y={10}
              width={18}
              height={12}
              rx={3}
              fill={i === 0 || i === 2 ? accent : "rgba(0,0,0,0.08)"}
              animate={
                i === 1 || i === 3
                  ? { opacity: [1, 0.15, 1], y: [10, 18, 10] }
                  : { opacity: 1 }
              }
              transition={
                i === 1 || i === 3
                  ? { duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 }
                  : undefined
              }
            />
          ))}
        </svg>
      );
    case "classify":
      return (
        <svg viewBox="0 0 120 32" className="mt-5 h-8 w-full" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.circle
              key={i}
              cx={24 + i * 36}
              cy={16}
              r={5}
              fill={accent}
              animate={{ scale: [1, 1.25, 1], opacity: [0.45, 1, 0.45] }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.35,
              }}
            />
          ))}
        </svg>
      );
    case "draft":
      return (
        <svg viewBox="0 0 120 32" className="mt-5 h-8 w-full" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.rect
              key={i}
              x={12}
              y={6 + i * 8}
              height={3}
              rx={1.5}
              fill={accent}
              initial={{ width: 20 }}
              animate={{ width: [20, 88 - i * 18, 20] }}
              transition={{
                duration: 2.8,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.2,
              }}
            />
          ))}
        </svg>
      );
    case "queue":
      return (
        <svg viewBox="0 0 120 32" className="mt-5 h-8 w-full" aria-hidden>
          <motion.path
            d="M44 16 L54 24 L76 8"
            fill="none"
            stroke={accent}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: [0, 1, 1, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", times: [0, 0.35, 0.7, 1] }}
          />
        </svg>
      );
    case "inbox":
      return (
        <svg viewBox="0 0 120 32" className="mt-5 h-8 w-full" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.rect
              key={i}
              x={18}
              width={84}
              height={6}
              rx={2}
              fill={accent}
              animate={{ y: [4 + i * 8, 4 + ((i + 1) % 3) * 8, 4 + i * 8], opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
            />
          ))}
        </svg>
      );
    case "report":
      return (
        <svg viewBox="0 0 120 32" className="mt-5 h-8 w-full" aria-hidden>
          <motion.polyline
            points="8,24 32,18 56,22 80,10 112,14"
            fill="none"
            stroke={accent}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: [0, 1, 1, 0] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut", times: [0, 0.4, 0.75, 1] }}
          />
        </svg>
      );
    default:
      return null;
  }
}

export function FeatureBento() {
  return (
    <Section tone="page" rule width="wide" id="features">
      <div className="max-w-[720px]">
        <Reveal>
          <Eyebrow>{FEATURES.eyebrow}</Eyebrow>
        </Reveal>
        <AnimatedHeading
          text={FEATURES.title}
          className="landing-section-headline mt-5 text-balance"
        />
        <Reveal delay={0.08}>
          <p className="mt-5 max-w-[560px] text-[17px] leading-[1.55] text-[#6e6e73]">
            {FEATURES.body}
          </p>
        </Reveal>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.cards.map((card, i) => {
          const Icon = ICONS[card.id];
          const accent = ACCENT_VAR[card.accent];

          return (
            <Reveal
              key={card.id}
              delay={i * 0.05}
              className={cn(card.size === "wide" && "sm:col-span-2")}
            >
              <TracedCard accent={accent} className="h-full p-6 sm:p-7">
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[10px]"
                  style={{ background: ACCENT_SOFT[card.accent] }}
                >
                  <Icon className="h-4 w-4" style={{ color: accent }} aria-hidden />
                </span>
                <h3 className="mt-4 text-[16px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">
                  {card.title}
                </h3>
                <p className="mt-2 text-[14px] leading-[1.55] text-[#6e6e73]">
                  {card.body}
                </p>
                <MicroLoop
                  id={card.id}
                  accent={accent}
                  soft={ACCENT_SOFT[card.accent]}
                />
              </TracedCard>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
