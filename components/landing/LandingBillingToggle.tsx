"use client";

import { motion } from "framer-motion";
import type { BillingCycle } from "@/components/signup/types";
import { SPRING } from "@/lib/landing/motion";
import { cn } from "@/lib/utils";

/**
 * Landing-only billing switch.
 *
 * Deliberately not the shared `components/pricing/BillingToggle` — that one
 * carries `dark:` utilities, and <html> keeps the `dark` class even on this
 * light-locked page, so it would render as a dark pill here.
 */
export function LandingBillingToggle({
  cycle,
  onChange,
  className,
}: {
  cycle: BillingCycle;
  onChange: (cycle: BillingCycle) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative inline-flex rounded-full border border-[color:var(--apple-hairline)] bg-white p-1",
        className,
      )}
      role="group"
      aria-label="Billing cycle"
    >
      <motion.span
        aria-hidden
        className="absolute inset-y-1 rounded-full bg-[color:var(--nexus-approval)]"
        animate={{ left: cycle === "monthly" ? "4px" : "50%" }}
        style={{ width: "calc(50% - 4px)" }}
        transition={SPRING}
      />
      {(["monthly", "annual"] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={cycle === value}
          className={cn(
            "relative z-10 min-h-11 cursor-pointer rounded-full px-6 text-[14px] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nexus-approval)] focus-visible:ring-offset-2",
            cycle === value ? "text-white" : "text-[#6e6e73] hover:text-[#1d1d1f]",
          )}
        >
          {value === "monthly" ? "Monthly" : "Annual"}
          {value === "annual" ? (
            <span className="ml-1.5 font-mono text-[10px] opacity-80">−25%</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
