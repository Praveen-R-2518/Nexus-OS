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
      <ol className="flex min-w-[640px] items-start justify-between gap-2 px-1 text-[11px] sm:min-w-0 sm:px-0">
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
                    done
                      ? "border-[color:var(--nexus-approval)]"
                      : "border-[color:var(--apple-hairline)]",
                  )}
                  aria-hidden
                />
              ) : null}
              <div
                className={cn(
                  "relative z-10 flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-bold tabular-nums",
                  done &&
                    "border-[color:var(--nexus-approval)] bg-[color:var(--nexus-approval)] text-white",
                  active &&
                    !done &&
                    "border-[color:var(--nexus-approval)] bg-[color:var(--nexus-approval-soft)] text-[color:var(--nexus-approval)]",
                  !active &&
                    !done &&
                    "border-[color:var(--apple-hairline)] bg-white text-[#86868b]",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : stepNumber}
              </div>
              <p
                className={cn(
                  "mt-2 max-w-[104px] text-[11px] font-medium leading-snug",
                  active ? "text-[#1d1d1f]" : "text-[#86868b]",
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
