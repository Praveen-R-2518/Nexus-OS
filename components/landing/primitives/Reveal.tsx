"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { DURATION, EASE, VIEWPORT } from "@/lib/landing/motion";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Rise distance in px. Keep it small — this should read as a fade. */
  distance?: number;
  as?: "div" | "li";
};

/**
 * Scroll-triggered fade + short rise, on the shared motion tokens.
 *
 * Reveals once (not on every direction change) and collapses to a no-op under
 * `prefers-reduced-motion`, so the composed frame is what renders.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  distance = 16,
  as = "div",
}: RevealProps) {
  const reduce = useReducedMotion();
  const Component = as === "li" ? motion.li : motion.div;

  if (reduce) {
    return <Component className={className}>{children}</Component>;
  }

  return (
    <Component
      className={className}
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: DURATION.entrance, ease: EASE, delay }}
    >
      {children}
    </Component>
  );
}
