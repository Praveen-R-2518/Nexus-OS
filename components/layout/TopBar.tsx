"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LayoutGroup, motion } from "framer-motion";
import { ChevronDown, LogOut } from "lucide-react";
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

const solutionsLinks = [
  { href: "/#protocol", label: "Protocol" },
  { href: "/#process", label: "Pipeline" },
  { href: "/signup", label: "Onboard" },
] as const;

const marketingLinks = [
  { href: "/docs", label: "Docs" },
  { href: "/customers", label: "Customers" },
  { href: "/resources", label: "Resources" },
  { href: "/signup", label: "Pricing" },
] as const;

function marketingNavLinkClass(active: boolean) {
  return cn(
    "cursor-pointer font-mono text-[11px] uppercase tracking-[0.18em] text-black transition-opacity duration-interaction hover:opacity-70 dark:text-white",
    active && "underline decoration-1 underline-offset-4",
  );
}

function appNavLinkClass(active: boolean) {
  return cn(
    "relative inline-flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 px-1 font-mono text-[11px] uppercase tracking-[0.18em] transition-opacity duration-interaction",
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
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const solutionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!solutionsRef.current?.contains(e.target as Node)) {
        setSolutionsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    setSolutionsOpen(false);
  }, [pathname]);

  async function signOut() {
    queryClient.clear();
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="app-chrome-bar sticky top-0 z-50 rounded-b-xl font-chrome">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 md:gap-8 md:px-8">
        <Link
          href="/"
          className="shrink-0 font-chrome text-base font-black uppercase tracking-tight text-black dark:text-white md:text-lg"
        >
          <span className="logo-nexus">Nexus</span>
          <span className="logo-os"> OS</span>
        </Link>

        {marketing ? (
          <nav
            className="flex flex-1 flex-wrap items-center justify-center gap-4 overflow-x-auto md:gap-6 lg:gap-10"
            aria-label="Primary"
          >
            <div className="relative" ref={solutionsRef}>
              <button
                type="button"
                aria-expanded={solutionsOpen}
                aria-haspopup="menu"
                onClick={() => setSolutionsOpen((o) => !o)}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1 font-mono text-[11px] uppercase tracking-[0.18em] text-black transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ref-cta focus-visible:ring-offset-0 dark:text-white dark:focus-visible:ring-border-strong"
              >
                Solutions
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-transform duration-interaction",
                    solutionsOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
              {solutionsOpen ? (
                <div
                  role="menu"
                  className="absolute left-1/2 top-full z-50 mt-2 min-w-[12rem] -translate-x-1/2 rounded-lg border border-border bg-white py-1 dark:border-border dark:bg-surface-card"
                >
                  {solutionsLinks.map(({ href, label }) => (
                    <Link
                      key={href}
                      role="menuitem"
                      href={href}
                      className="block cursor-pointer px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-black transition-colors hover:bg-ref-mint dark:text-white dark:hover:bg-surface-elevated"
                      onClick={() => setSolutionsOpen(false)}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
            {marketingLinks.map(({ href, label }) => {
              const active =
                href !== "#" &&
                (pathname === href || pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={marketingNavLinkClass(active)}
                >
                  {label}
                </Link>
              );
            })}
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
                        className="pointer-events-none h-0.5 w-full max-w-[2.5rem] shrink-0 bg-ref-cta dark:bg-[color:var(--trajectory-blue)]"
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

        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          {marketing ? (
            <>
              <Link
                href="mailto:support@example.com"
                className="hidden cursor-pointer rounded-full border border-border/80 bg-transparent px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-black transition-colors hover:border-border hover:bg-ref-mint sm:inline-flex dark:border-border dark:text-white dark:hover:border-border-strong dark:hover:bg-surface-elevated"
              >
                Contact sales
              </Link>
              <Link
                href="/login"
                className="hidden cursor-pointer rounded-full border border-border bg-ref-cta px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-widest text-[#f4f8fc] transition-opacity hover:opacity-90 sm:inline-flex dark:border-border dark:bg-surface-elevated dark:text-[#e2e2e2]"
              >
                Access console
              </Link>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-transparent px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-black transition-colors hover:bg-ref-mint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ref-cta focus-visible:ring-offset-0 focus-visible:ring-offset-white dark:border-border dark:text-white dark:hover:bg-surface-elevated dark:focus-visible:ring-border-strong"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Log out</span>
            </button>
          )}
          <div className="rounded-lg border border-border p-0.5 dark:border-border">
            <ThemeToggle />
          </div>
        </div>
      </div>

      {marketing ? (
        <div className="hairline-t px-4 py-2 md:hidden">
          <nav className="flex flex-wrap items-center justify-center gap-3" aria-label="Primary mobile">
            <Link href="/#protocol" className={marketingNavLinkClass(false)}>
              Protocol
            </Link>
            <Link href="/#process" className={marketingNavLinkClass(false)}>
              Pipeline
            </Link>
            <Link
              href="/docs"
              className={marketingNavLinkClass(pathname.startsWith("/docs"))}
            >
              Docs
            </Link>
            <Link
              href="/customers"
              className={marketingNavLinkClass(pathname.startsWith("/customers"))}
            >
              Customers
            </Link>
            <Link
              href="/resources"
              className={marketingNavLinkClass(pathname.startsWith("/resources"))}
            >
              Resources
            </Link>
            <Link href="/signup" className={marketingNavLinkClass(false)}>
              Pricing
            </Link>
            <Link href="/login" className={marketingNavLinkClass(false)}>
              Console
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
