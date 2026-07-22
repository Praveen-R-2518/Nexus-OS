"use client";

import { motion, useReducedMotion } from "framer-motion";
import { DURATION, EASE, VIEWPORT } from "@/lib/landing/motion";
import { cn } from "@/lib/utils";

/**
 * Mono section label with a hairline rule that draws out from it on reveal.
 * Mono is the engineering-credibility voice — it is already loaded as
 * --font-geist-mono, so it costs nothing.
 */
export function Eyebrow({
  children,
  className,
  align = "left",
}: {
  children: string;
  className?: string;
  align?: "left" | "center";
}) {
  const reduce = useReducedMotion();

  return (
    <div
      className={cn(
        "flex items-center gap-3",
        align === "center" && "justify-center",
        className,
      )}
    >
      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#6e6e73]">
        {children}
      </span>
      <motion.span
        aria-hidden
        className="h-px w-14 origin-left bg-[color:var(--apple-hairline)]"
        initial={reduce ? undefined : { scaleX: 0 }}
        whileInView={reduce ? undefined : { scaleX: 1 }}
        viewport={VIEWPORT}
        transition={{ duration: DURATION.entrance, ease: EASE, delay: 0.1 }}
      />
    </div>
  );
}
