"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { SPRING } from "@/lib/landing/motion";
import { cn } from "@/lib/utils";

type AuthMode = "signin" | "signup";

/**
 * Spring pill matching LandingBillingToggle — navigates between /login and
 * /signup while preserving query params that matter for each flow.
 */
export function AuthModeToggle({
  mode,
  className,
}: {
  mode: AuthMode;
  className?: string;
}) {
  const searchParams = useSearchParams();

  function hrefFor(target: AuthMode): string {
    const params = new URLSearchParams(searchParams.toString());
    if (target === "signin") {
      // Signup-only params should not linger on login.
      params.delete("plan");
      params.delete("step");
      params.delete("invite");
      const q = params.toString();
      return q ? `/login?${q}` : "/login";
    }
    const q = params.toString();
    return q ? `/signup?${q}` : "/signup";
  }

  return (
    <div
      className={cn(
        "relative inline-flex w-full max-w-sm rounded-full border border-[color:var(--apple-hairline)] bg-white p-1",
        className,
      )}
      role="group"
      aria-label="Authentication mode"
    >
      <motion.span
        aria-hidden
        className="absolute inset-y-1 rounded-full bg-[color:var(--nexus-approval)]"
        animate={{ left: mode === "signin" ? "4px" : "50%" }}
        style={{ width: "calc(50% - 4px)" }}
        transition={SPRING}
      />
      {(
        [
          { id: "signin" as const, label: "Sign In", href: hrefFor("signin") },
          {
            id: "signup" as const,
            label: "Create Account",
            href: hrefFor("signup"),
          },
        ] as const
      ).map((item) => {
        const active = mode === item.id;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative z-10 flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-full px-4 text-[14px] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nexus-approval)] focus-visible:ring-offset-2",
              active ? "text-white" : "text-[#6e6e73] hover:text-[#1d1d1f]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
