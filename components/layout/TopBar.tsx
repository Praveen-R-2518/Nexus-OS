"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGroup, motion } from "framer-motion";
import { LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ThemeToggle } from "@/components/ThemeToggle";
import { prefetchNavRoute } from "@/lib/queries/nav-prefetch";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Command Center" },
  { href: "/inbox", label: "Inbox" },
  { href: "/approval", label: "Approval Queue" },
  { href: "/report", label: "Buy-Back Report" },
  { href: "/logs", label: "Workflow Logs" },
] as const;

export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="sticky top-0 z-50 w-full px-6 pb-2 pt-4">
      <header className="flex w-full items-center justify-between rounded-full border border-border bg-surface-sidebar/75 px-6 py-3 shadow-lg backdrop-blur-md transition-all duration-300 hover:bg-surface-sidebar/90 dark:bg-surface-card/40 dark:hover:bg-surface-card/55">
        <div className="flex items-center">
          <span className="font-mono text-lg font-bold tracking-[0.2em] sm:text-xl">
            <span className="logo-nexus">NEXUS</span>&thinsp;
            <span className="logo-os">OS</span>
          </span>
        </div>

        <div className="flex items-center gap-6 lg:gap-10">
          <nav className="relative flex max-w-[min(100vw-12rem,52rem)] flex-wrap items-center justify-end gap-x-4 gap-y-2 sm:gap-x-6 lg:gap-8">
            <LayoutGroup id="topbar-main-nav">
              {nav.map(({ href, label }) => {
                const active =
                  pathname === href ||
                  (href !== "/dashboard" && pathname.startsWith(href));
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onMouseEnter={() => prefetchNavRoute(queryClient, href)}
                    onFocus={() => prefetchNavRoute(queryClient, href)}
                    className={cn(
                      "relative inline-flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg px-1 text-sm font-semibold transition-colors duration-interaction lg:text-base",
                      active
                        ? "text-foreground"
                        : "text-foreground/55 hover:text-foreground",
                    )}
                  >
                    <span className="relative z-10 whitespace-nowrap">
                      {label}
                    </span>
                    {active ? (
                      <motion.span
                        layoutId="topNavActiveUnderline"
                        className="pointer-events-none h-[3px] w-8 shrink-0 rounded-full bg-gradient-to-r from-trajectory-blue via-sky-400 to-status-positive shadow-[0_0_14px_rgba(30,58,95,0.35)] dark:shadow-[0_0_18px_rgba(122,184,255,0.35)]"
                        transition={{
                          type: "spring",
                          stiffness: 380,
                          damping: 30,
                          mass: 0.55,
                        }}
                      />
                    ) : null}
                  </Link>
                );
              })}
            </LayoutGroup>
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-status-critical-border bg-transparent px-5 py-2.5 text-sm font-semibold text-status-critical transition-colors duration-interaction hover:bg-status-critical-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-critical-border focus-visible:ring-offset-2 focus-visible:ring-offset-surface-sidebar dark:focus-visible:ring-offset-surface-card"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden />
              Log out
            </button>
          </div>
        </div>
      </header>
    </div>
  );
}
