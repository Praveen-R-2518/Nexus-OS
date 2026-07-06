"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGroup, motion } from "framer-motion";
import { LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ThemeToggle } from "@/components/ThemeToggle";
import { prefetchNavRoute } from "@/lib/queries/nav-prefetch";
import { useTenantScopeOptional } from "@/components/tenant/TenantScope";
import { cn } from "@/lib/utils";

const appNav = [
  { href: "/dashboard", label: "Command Center" },
  { href: "/inbox", label: "Inbox" },
  { href: "/approval", label: "Approval Queue" },
  { href: "/report", label: "Buy-Back Report" },
  { href: "/logs", label: "Workflow Logs" },
] as const;

const marketingLinks = [
  { href: "/docs", label: "Docs" },
  { href: "/customers", label: "Customers" },
  { href: "/resources", label: "Resources" },
  { href: "/pricing", label: "Pricing" },
] as const;

function marketingNavLinkClass(active: boolean) {
  return cn(
    "relative inline-flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 px-1 text-[13px] font-medium tracking-normal transition-opacity duration-interaction",
    active ? "text-apple-text" : "text-apple-text/75 hover:text-apple-text",
  );
}

function appNavLinkClass(active: boolean) {
  return cn(
    "relative inline-flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 px-1 text-[13px] font-medium tracking-normal transition-opacity duration-interaction",
    active
      ? "text-atmospheric-grey"
      : "text-atmospheric-grey/75 hover:text-atmospheric-grey",
  );
}

export default function TopBar({ marketing }: { marketing: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const tenant = useTenantScopeOptional();

  async function signOut() {
    queryClient.clear();
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-50 font-sans",
        marketing ? "apple-chrome-bar font-chrome" : "app-chrome-bar rounded-b-xl font-chrome",
      )}
    >
      <div
        className={cn(
          "mx-auto max-w-[1024px]",
          marketing
            ? "flex items-center justify-between gap-3 px-4 py-3 md:gap-8 md:px-8"
            : "flex items-center justify-between gap-3 px-4 py-3 md:gap-8 md:px-8",
        )}
      >
        <Link
          href="/"
          className={cn(
            "shrink-0 text-[21px] font-semibold tracking-tight",
            marketing
              ? "font-sans text-base font-semibold tracking-normal text-apple-text md:text-lg"
              : "font-sans text-base font-semibold tracking-normal text-black dark:text-white md:text-lg",
          )}
        >
          <span className="logo-nexus">Nexus</span>
          <span className="logo-os"> OS</span>
        </Link>

        {marketing ? (
          <nav
            className="relative flex max-w-[min(100vw-10rem,40rem)] flex-1 flex-wrap items-center justify-center gap-x-4 gap-y-2 overflow-x-auto sm:gap-x-6 lg:gap-x-8"
            aria-label="Primary"
          >
            <LayoutGroup id="topbar-marketing-nav">
              {marketingLinks.map(({ href, label }) => {
                const active =
                  pathname === href || pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={marketingNavLinkClass(active)}
                  >
                    <span className="relative z-10 whitespace-nowrap">{label}</span>
                    {active ? (
                      <motion.span
                        layoutId="marketingTopNavActiveBar"
                        className="pointer-events-none h-0.5 w-full max-w-[2.5rem] shrink-0 bg-nexus-approval"
                        transition={{
                          type: "spring",
                          stiffness: 380,
                          damping: 32,
                          mass: 0.55,
                        }}
                      />
                    ) : null}
                  </Link>
                );
              })}
            </LayoutGroup>
          </nav>
        ) : (
          <nav
            className="relative flex max-w-[min(100vw-10rem,48rem)] flex-1 flex-wrap items-center justify-center gap-x-2 gap-y-2 overflow-x-auto sm:gap-x-3 lg:gap-x-6"
            aria-label="App"
          >
            <LayoutGroup id="topbar-app-nav">
              {appNav.map(({ href, label }) => {
                const active =
                  pathname === href ||
                  (href !== "/dashboard" && pathname.startsWith(href));
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onMouseEnter={() =>
                      prefetchNavRoute(queryClient, href, tenant)
                    }
                    onFocus={() =>
                      prefetchNavRoute(queryClient, href, tenant)
                    }
                    className={appNavLinkClass(active)}
                  >
                    <span className="relative z-10 whitespace-nowrap">{label}</span>
                    {active ? (
                      <motion.span
                        layoutId="topNavActiveBar"
                        className="pointer-events-none h-0.5 w-full max-w-[2.5rem] shrink-0 bg-nexus-approval"
                        transition={{
                          type: "spring",
                          stiffness: 380,
                          damping: 32,
                          mass: 0.55,
                        }}
                      />
                    ) : null}
                  </Link>
                );
              })}
            </LayoutGroup>
          </nav>
        )}

        <div
          className={cn(
            "flex shrink-0 items-center gap-2 md:gap-3",
            marketing && "font-chrome",
          )}
        >
          {marketing ? (
            <>
              <Link
                href="mailto:support@example.com"
                className="hidden min-h-11 cursor-pointer items-center justify-center rounded-full border border-[color:var(--apple-hairline)] bg-transparent px-3 py-2 text-[13px] font-medium tracking-normal text-apple-text transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.06] lg:inline-flex"
              >
                Contact sales
              </Link>
              <Link
                href="/signup"
                className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-nexus-approval px-4 py-2 text-[13px] font-medium tracking-normal text-white transition-colors hover:bg-[color:var(--apple-accent-hover)]"
              >
                Get started
              </Link>
              <div className="rounded-lg border border-[color:var(--apple-hairline)] p-0.5">
                <ThemeToggle />
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-transparent px-3 py-2 text-[13px] font-medium tracking-normal text-black transition-colors hover:bg-nexus-approval-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-approval focus-visible:ring-offset-0 focus-visible:ring-offset-white dark:border-border dark:text-white dark:hover:bg-surface-elevated dark:focus-visible:ring-nexus-approval"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Log out</span>
            </button>
          )}
          {!marketing ? (
            <div className="rounded-lg border border-border p-0.5 dark:border-border">
              <ThemeToggle />
            </div>
          ) : null}
        </div>
      </div>

    </header>
  );
}
