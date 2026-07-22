"use client";

import { motion, useReducedMotion } from "framer-motion";
import { DURATION, EASE, STAGGER, VIEWPORT } from "@/lib/landing/motion";
import { cn } from "@/lib/utils";

type AnimatedHeadingProps = {
  text: string;
  className?: string;
  as?: "h1" | "h2" | "h3";
  /** Words from this index on take the accent colour. */
  accentFrom?: number;
  accentColor?: string;
  delay?: number;
};

/**
 * Word-level stagger reveal.
 *
 * Deliberately not GSAP SplitText (a paid Club plugin) and deliberately not
 * per-character — character splitting on a headline this long would blow up the
 * DOM and break screen-reader phrasing. The full string stays readable because
 * each word keeps its own text node and the spaces are real.
 */
export function AnimatedHeading({
  text,
  className,
  as: Tag = "h2",
  accentFrom,
  accentColor,
  delay = 0,
}: AnimatedHeadingProps) {
  const reduce = useReducedMotion();
  const words = text.split(" ");

  const accentIndex = accentFrom ?? words.length;

  if (reduce) {
    return (
      <Tag className={cn("text-[#1d1d1f]", className)}>
        {words.map((word, i) => (
          <span
            key={`${word}-${i}`}
            style={i >= accentIndex && accentColor ? { color: accentColor } : undefined}
          >
            {word}
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </Tag>
    );
  }

  return (
    <Tag className={cn("text-[#1d1d1f]", className)}>
      <motion.span
        className="inline"
        initial="hidden"
        whileInView="visible"
        viewport={VIEWPORT}
        transition={{ staggerChildren: STAGGER.word, delayChildren: delay }}
      >
        {words.map((word, i) => (
          <motion.span
            key={`${word}-${i}`}
            className="inline-block whitespace-pre"
            style={i >= accentIndex && accentColor ? { color: accentColor } : undefined}
            variants={{
              hidden: { opacity: 0, y: 8 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { duration: DURATION.entrance, ease: EASE },
              },
            }}
          >
            {word}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        ))}
      </motion.span>
    </Tag>
  );
}
