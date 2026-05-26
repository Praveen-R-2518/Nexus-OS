"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGroup, motion } from "framer-motion";
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
    <div className="px-6 pt-4 pb-2 w-full z-50 sticky top-0">
      <header className="flex w-full items-center justify-between px-8 py-4 rounded-full bg-surface-sidebar/60 dark:bg-black/20 backdrop-blur-md border border-black/10 dark:border-white/10 shadow-lg transition-all duration-300 hover:bg-surface-sidebar/80 dark:hover:bg-black/40 hover:shadow-xl">
        {/* Left: Wordmark */}
        <div className="flex items-center">
          <span className="font-mono text-lg font-bold tracking-[0.2em]">
            <span className="logo-nexus">NEXUS</span>&thinsp;<span className="logo-os">OS</span>
          </span>
        </div>

        {/* Right: Nav Links + Actions */}
        <div className="flex items-center gap-8">
          <nav className="relative flex items-center gap-8">
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
                      "relative inline-flex flex-col items-center gap-1.5 text-sm font-medium transition-colors duration-200",
                      active
                        ? "text-foreground"
                        : "text-foreground/60 hover:text-foreground",
                    )}
                  >
                    <span className="relative z-10 whitespace-nowrap">{label}</span>
                    {active ? (
                      <motion.span
                        layoutId="topNavActiveUnderline"
                        className="pointer-events-none h-[3px] w-7 shrink-0 rounded-full bg-gradient-to-r from-trajectory-blue to-emerald-500 shadow-[0_0_12px_rgba(0,82,204,0.35)] dark:shadow-[0_0_14px_rgba(91,159,232,0.28)]"
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

          <div className="flex items-center gap-4">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex cursor-pointer items-center justify-center rounded-full bg-[#E54D2E] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#E54D2E]/90"
            >
              Logout <span className="ml-1">→</span>
            </button>
          </div>
        </div>
      </header>
    </div>
  );
}
