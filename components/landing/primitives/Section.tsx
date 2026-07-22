"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionProps = {
  id?: string;
  children: ReactNode;
  /** Alternating page band. `alt` is the #f5f5f7 surface. */
  tone?: "page" | "alt";
  /** Hairline rule along the top edge — the page's structural grammar. */
  rule?: boolean;
  className?: string;
  /** Wider than the 980px text measure, for grids and the app window. */
  width?: "text" | "wide";
};

/**
 * The landing page's only vertical rhythm. Sections never set their own
 * padding — spacing lives here so the whole page stays on one scale.
 */
export function Section({
  id,
  children,
  tone = "page",
  rule = false,
  className,
  width = "text",
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "relative px-5 py-20 md:px-8 md:py-[104px]",
        tone === "alt" ? "bg-[#f5f5f7]" : "bg-white",
        rule && "border-t border-[color:var(--apple-hairline)]",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto w-full",
          width === "wide" ? "max-w-[1120px]" : "max-w-[980px]",
        )}
      >
        {children}
      </div>
    </section>
  );
}
