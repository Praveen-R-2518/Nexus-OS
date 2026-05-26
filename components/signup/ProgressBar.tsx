"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProgressBarProps = {
  currentStep: number;
  steps: readonly string[];
};

export default function ProgressBar({ currentStep, steps }: ProgressBarProps) {
  return (
    <div className="w-full overflow-x-auto pb-2">
      <ol className="flex min-w-[640px] items-start justify-between gap-2 px-1 font-mono text-[10px] uppercase tracking-widest sm:min-w-0 sm:px-0">
        {steps.map((label, index) => {
          const stepNumber = index + 1;
          const done = stepNumber < currentStep;
          const active = stepNumber === currentStep;

          return (
            <li
              key={label}
              className="relative flex flex-1 flex-col items-center text-center"
            >
              {index < steps.length - 1 ? (
                <div
                  className={cn(
                    "absolute left-[calc(50%+14px)] top-[15px] h-0 w-[calc(100%-28px)] border-t border-dashed",
                    done ? "border-border dark:border-border" : "border-border/80 dark:border-border",
                  )}
                  aria-hidden
                />
              ) : null}
              <div
                className={cn(
                  "relative z-10 flex h-7 w-7 items-center justify-center border text-[10px] font-bold tabular-nums",
                  done &&
                    "border-border bg-[#0f2336] text-white dark:border-border dark:bg-surface-elevated dark:text-white",
                  active &&
                    !done &&
                    "border-2 border-ref-cta bg-[#e3eef6] text-black dark:border-border-strong dark:bg-surface-elevated dark:text-white",
                  !active &&
                    !done &&
                    "border-border bg-white text-black/45 dark:border-border dark:bg-surface-card dark:text-white/45",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : stepNumber}
              </div>
              <p
                className={cn(
                  "mt-2 max-w-[104px] text-[10px] font-medium uppercase leading-snug tracking-wide sm:text-[10px]",
                  active ? "text-black dark:text-white" : "text-black/50 dark:text-white/50",
                )}
              >
                {label}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
