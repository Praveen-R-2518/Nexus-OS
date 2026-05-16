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
                    done ? "bg-trajectory-blue" : "bg-white/10",
                  )}
                  aria-hidden
                />
              ) : null}
              <div
                className={cn(
                  "relative z-10 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold",
                  done &&
                    "border-trajectory-blue bg-trajectory-blue text-white shadow-sm shadow-trajectory-blue/40",
                  active &&
                    !done &&
                    "border-trajectory-blue bg-white/5 text-trajectory-blue ring-2 ring-trajectory-blue/40",
                  !active &&
                    !done &&
                    "border-white/10 bg-white/5 text-atmospheric-grey/40",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : stepNumber}
              </div>
              <p
                className={cn(
                  "mt-2 max-w-[104px] text-[10px] font-medium uppercase leading-snug tracking-wide sm:text-xs",
                  active ? "text-trajectory-blue" : "text-atmospheric-grey/40",
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
