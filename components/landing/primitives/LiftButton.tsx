"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const MotionLink = motion.create(Link);

type LiftButtonProps = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
};

/**
 * CTA button: lifts 1px with a shadow step on hover, presses to 0.98 on tap.
 * Min height 44px to satisfy the touch-target floor.
 */
export function LiftButton({
  href,
  children,
  variant = "primary",
  className,
}: LiftButtonProps) {
  const reduce = useReducedMotion();
  // Hash links stay plain anchors so the browser handles in-page scrolling.
  const external =
    href.startsWith("mailto:") || href.startsWith("http") || href.startsWith("#");

  const classes = cn(
    "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full px-6 text-[15px] font-medium tracking-normal transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nexus-approval)] focus-visible:ring-offset-2",
    variant === "primary"
      ? "bg-[color:var(--nexus-approval)] text-white hover:bg-[#2b82ff]"
      : "border border-[color:var(--apple-hairline)] bg-white text-[#1d1d1f] hover:bg-black/[0.03]",
    className,
  );

  const motionProps = reduce
    ? {}
    : {
        whileHover: {
          y: -1,
          boxShadow:
            variant === "primary"
              ? "0 8px 24px -8px rgba(18,116,249,0.45)"
              : "0 8px 24px -8px rgba(0,0,0,0.12)",
        },
        whileTap: { scale: 0.98, y: 0 },
        transition: { duration: 0.18 },
      };

  if (external) {
    return (
      <motion.a href={href} className={classes} {...motionProps}>
        {children}
      </motion.a>
    );
  }

  return (
    <MotionLink href={href} className={classes} {...motionProps}>
      {children}
    </MotionLink>
  );
}
