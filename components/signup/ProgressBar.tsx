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
      <ol className="flex min-w-[640px] items-start justify-between gap-2 px-1 sm:min-w-0 sm:px-0">
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
                    "absolute left-[calc(50%+14px)] top-[14px] h-px w-[calc(100%-28px)]",
                    done ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700",
                  )}
                  aria-hidden
                />
              ) : null}
              <div
                className={cn(
                  "relative z-10 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold",
                  done &&
                    "border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-900/40",
                  active &&
                    !done &&
                    "border-emerald-500 bg-white dark:bg-slate-900 text-[#1B6B3A] dark:text-emerald-400 ring-2 ring-emerald-500/40",
                  !active &&
                    !done &&
                    "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : stepNumber}
              </div>
              <p
                className={cn(
                  "mt-2 max-w-[104px] text-[10px] font-medium uppercase leading-snug tracking-wide sm:text-xs",
                  active ? "text-[#1B6B3A] dark:text-emerald-400" : "text-slate-500 dark:text-slate-400",
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
