"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { AuthAmbientField } from "@/components/auth/AuthAmbientField";
import { AuthBrandPanel } from "@/components/auth/AuthBrandPanel";
import { AuthModeToggle } from "@/components/auth/AuthModeToggle";
import type { AuthBrandCopy } from "@/lib/auth/brandCopy";
import { cn } from "@/lib/utils";

type AuthSplitLayoutProps = {
  mode: "signin" | "signup";
  brand: AuthBrandCopy;
  children: ReactNode;
  /** Widen the form column for signup wizard grids (plans). */
  formWidth?: "default" | "wide";
};

/**
 * Chromeless split: brand left (~42%), form right. On mobile the form stacks
 * first so the primary action is never below the fold.
 */
export function AuthSplitLayout({
  mode,
  brand,
  children,
  formWidth = "default",
}: AuthSplitLayoutProps) {
  return (
    <div className="grid min-h-dvh w-full grid-cols-1 lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]">
      {/* Mobile order: form first, brand strip after. Desktop: brand left. */}
      <div className="order-2 lg:order-1 lg:min-h-dvh">
        <AuthBrandPanel copy={brand} />
      </div>

      <div className="relative order-1 flex min-h-dvh flex-col justify-center bg-[#f5f5f7] px-5 py-10 sm:px-8 lg:order-2 lg:px-12 xl:px-16">
        <AuthAmbientField />
        <div
          className={cn(
            "relative z-10 mx-auto w-full",
            formWidth === "wide" ? "max-w-5xl" : "max-w-[32rem]",
          )}
        >
          <Suspense
            fallback={
              <div className="mb-8 h-11 w-full max-w-sm rounded-full border border-[color:var(--apple-hairline)] bg-white" />
            }
          >
            <AuthModeToggle mode={mode} className="mb-8" />
          </Suspense>
          {children}
        </div>
      </div>
    </div>
  );
}
