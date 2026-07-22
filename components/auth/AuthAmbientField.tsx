"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Soft ambient motion in the form panel margins — two slow pulses only.
 * Never competes with focus rings or primary actions.
 */
export function AuthAmbientField() {
  const reduce = useReducedMotion();
  if (reduce) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <motion.span
        className="absolute right-[12%] top-[18%] h-1.5 w-1.5 rounded-full bg-[color:var(--nexus-approval)]"
        animate={{ opacity: [0.15, 0.45, 0.15], y: [0, -8, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.span
        className="absolute bottom-[22%] left-[10%] h-1 w-1 rounded-full bg-[color:var(--apple-hairline)]"
        style={{ background: "rgba(0,0,0,0.18)" }}
        animate={{ opacity: [0.2, 0.5, 0.2], y: [0, 6, 0] }}
        transition={{
          duration: 7,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1.2,
        }}
      />
    </div>
  );
}
