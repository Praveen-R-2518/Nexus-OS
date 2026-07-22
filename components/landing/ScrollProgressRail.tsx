"use client";

import { motion, useReducedMotion, useScroll, useSpring } from "framer-motion";

/**
 * Reading-progress rail. Renders inside the sticky <header> and pins to its
 * bottom edge, so it needs no hard-coded nav height.
 *
 * Scales an element rather than animating width — no layout on scroll.
 */
export function ScrollProgressRail() {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 320,
    damping: 40,
    restDelta: 0.001,
  });

  if (reduce) return null;

  return (
    <motion.div
      aria-hidden
      className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[color:var(--nexus-approval)]"
      style={{ scaleX }}
    />
  );
}
