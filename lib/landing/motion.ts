/**
 * Shared motion tokens for the landing page.
 *
 * House rules (enforced by review, not by types):
 *  - Only `transform` and `opacity` animate. Never width/height/top/left.
 *  - Every animation explains something. No decorative motion.
 *  - Every animated component reads `useReducedMotion()` and renders the final
 *    composed frame when reduced motion is requested.
 */

/** The curve the rest of the marketing surface already uses (see ScrollReveal). */
export const EASE = [0.16, 1, 0.3, 1] as const;

/** Entering elements decelerate; exiting elements accelerate away. */
export const EASE_IN = [0.4, 0, 1, 1] as const;

export const DURATION = {
  /** Hovers, presses, colour swaps. */
  micro: 0.18,
  /** Panel crossfades, accordion open. */
  short: 0.24,
  /** Scroll-reveal entrances. */
  entrance: 0.52,
  /** Exits run ~65% of their entrance so the UI feels responsive. */
  exit: 0.34,
} as const;

export const STAGGER = {
  /** Word-level heading reveal. */
  word: 0.04,
  /** List and grid children. */
  item: 0.045,
} as const;

export const SPRING = {
  type: "spring",
  stiffness: 400,
  damping: 32,
  mass: 0.6,
} as const;

/** Viewport config for scroll-triggered reveals — reveal once, slightly early. */
export const VIEWPORT = { once: true, amount: 0.25, margin: "0px 0px -8% 0px" } as const;

type Variants = Record<string, Record<string, unknown>>;

/** Fade + short rise. `reduce` collapses it to a no-op so the frame renders composed. */
export function riseVariants(reduce: boolean | null, distance = 16): Variants {
  if (reduce) {
    return { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } };
  }
  return {
    hidden: { opacity: 0, y: distance },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: DURATION.entrance, ease: EASE },
    },
  };
}

/** Parent that staggers its children. Children should use `riseVariants`. */
export function staggerVariants(reduce: boolean | null, stagger = STAGGER.item): Variants {
  return {
    hidden: {},
    visible: {
      transition: reduce
        ? {}
        : { staggerChildren: stagger, delayChildren: 0.04 },
    },
  };
}
