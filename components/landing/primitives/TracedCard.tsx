"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { EASE } from "@/lib/landing/motion";
import { cn } from "@/lib/utils";

/**
 * Card whose 1px border traces itself on hover, then lifts 2px.
 *
 * The trace is an inset SVG rect layered over a static hairline border, so the
 * card never changes size and the effect degrades to a plain border when motion
 * is reduced.
 */
export function TracedCard({
  children,
  className,
  accent = "var(--nexus-approval)",
  radius = 20,
}: {
  children: ReactNode;
  className?: string;
  accent?: string;
  radius?: number;
}) {
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      className={cn(
        "group relative overflow-hidden border border-[color:var(--apple-hairline)] bg-white",
        className,
      )}
      style={{ borderRadius: radius }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      animate={
        reduce
          ? undefined
          : {
              y: hovered ? -2 : 0,
              boxShadow: hovered
                ? "0 8px 24px -8px rgba(0,0,0,0.10)"
                : "0 1px 2px rgba(0,0,0,0.04)",
            }
      }
      transition={{ duration: 0.22, ease: EASE }}
    >
      {reduce ? null : (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
        >
          <motion.rect
            x="0.5"
            y="0.5"
            width="calc(100% - 1px)"
            height="calc(100% - 1px)"
            rx={radius}
            fill="none"
            stroke={accent}
            strokeWidth="1"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{
              pathLength: hovered ? 1 : 0,
              opacity: hovered ? 1 : 0,
            }}
            transition={{
              pathLength: { duration: 0.55, ease: EASE },
              opacity: { duration: 0.15 },
            }}
          />
        </svg>
      )}
      {children}
    </motion.div>
  );
}
