"use client";

import { motion } from "framer-motion";
import type { BillingCycle } from "@/components/signup/types";
import { cn } from "@/lib/utils";

type BillingToggleProps = {
  cycle: BillingCycle;
  onChange: (cycle: BillingCycle) => void;
  className?: string;
};

export default function BillingToggle({ cycle, onChange, className }: BillingToggleProps) {
  return (
    <div
      className={cn(
        "relative inline-flex rounded-full border border-border bg-white p-1 dark:border-white/15 dark:bg-[#161616]",
        className,
      )}
      role="group"
      aria-label="Billing cycle"
    >
      <motion.div
        layout
        className="absolute inset-y-1 rounded-full bg-[#0f2336] dark:bg-ref-cta"
        style={{
          left: cycle === "monthly" ? "4px" : "50%",
          width: "calc(50% - 4px)",
        }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        aria-hidden
      />
      <button
        type="button"
        onClick={() => onChange("monthly")}
        className={cn(
          "relative z-10 cursor-pointer rounded-full px-5 py-2 font-mono text-[11px] font-medium uppercase tracking-widest transition-colors duration-200",
          cycle === "monthly"
            ? "text-white"
            : "text-muted hover:text-atmospheric-grey dark:text-slate-400 dark:hover:text-white",
        )}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => onChange("annual")}
        className={cn(
          "relative z-10 cursor-pointer rounded-full px-5 py-2 font-mono text-[11px] font-medium uppercase tracking-widest transition-colors duration-200",
          cycle === "annual"
            ? "text-white"
            : "text-muted hover:text-atmospheric-grey dark:text-slate-400 dark:hover:text-white",
        )}
      >
        Annual
        <span className="ml-1.5 text-[9px] opacity-80">25% off</span>
      </button>
    </div>
  );
}
