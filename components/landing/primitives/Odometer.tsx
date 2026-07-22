"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { EASE } from "@/lib/landing/motion";
import { cn } from "@/lib/utils";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

function DigitColumn({
  digit,
  play,
  index,
}: {
  digit: number;
  play: boolean;
  index: number;
}) {
  return (
    <span
      className="relative inline-block h-[1em] overflow-hidden align-baseline"
      // Widest glyph in a tabular font — keeps the column from resizing mid-roll.
      style={{ width: "0.62em" }}
    >
      <motion.span
        className="absolute left-0 top-0 flex flex-col"
        initial={{ y: 0 }}
        animate={{ y: play ? `-${digit}em` : 0 }}
        transition={{ duration: 0.9, ease: EASE, delay: index * 0.07 }}
      >
        {DIGITS.map((d) => (
          <span key={d} className="block h-[1em] leading-[1em]">
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/**
 * Digit-roll counter. Each column translates to its target digit rather than
 * counting through every integer, so a 4-digit number costs 4 transforms.
 */
export function Odometer({
  value,
  suffix,
  className,
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });

  const digits = String(Math.trunc(Math.abs(value))).split("").map(Number);
  const play = inView && !reduce;

  return (
    <span
      ref={ref}
      className={cn("inline-flex items-baseline tabular-nums", className)}
    >
      <span className="sr-only">
        {value}
        {suffix}
      </span>
      <span aria-hidden className="inline-flex items-baseline">
        {reduce
          ? digits.map((d, i) => <span key={i}>{d}</span>)
          : digits.map((d, i) => (
              <DigitColumn key={i} digit={d} play={play} index={i} />
            ))}
        {suffix ? <span>{suffix}</span> : null}
      </span>
    </span>
  );
}
