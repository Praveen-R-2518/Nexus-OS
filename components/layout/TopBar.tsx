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
    "cursor-pointer whitespace-nowrap text-[12px] font-normal text-apple-text transition-opacity duration-200 hover:opacity-65",
    active && "opacity-100",
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
        marketing ? "apple-chrome-bar" : "app-chrome-bar rounded-b-xl font-chrome",
      )}
    >
      <div
        className={cn(
          "mx-auto flex max-w-[1024px] items-center justify-between gap-3",
          marketing
            ? "min-h-11 px-4 md:gap-8 md:px-6"
            : "px-4 py-3 md:gap-8 md:px-8",
        )}
      >
        <Link
          href="/"
          className={cn(
            "shrink-0 text-[21px] font-semibold tracking-tight",
            marketing
              ? "text-[19px] text-apple-text"
              : "font-sans text-base font-semibold tracking-normal text-black dark:text-white md:text-lg",
          )}
        >
          {marketing ? (
            <>Nexus OS</>
          ) : (
            <>
              <span className="logo-nexus">Nexus</span>
              <span className="logo-os"> OS</span>
            </>
          )}
        </Link>

        {marketing ? (
          <nav
            className="hidden flex-1 items-center justify-center gap-6 overflow-x-auto md:flex lg:gap-10"
            aria-label="Primary"
          >
            {marketingLinks.map(({ href, label }) => {
              const active =
                pathname === href || pathname.startsWith(href);
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

        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          {marketing ? (
            <>
              <Link
                href="mailto:support@example.com"
                className="hidden text-[12px] text-apple-text transition-opacity hover:opacity-65 lg:inline-flex"
              >
                Contact sales
              </Link>
              <Link
                href="/signup"
                className="apple-btn-primary px-3.5 py-1.5 text-[14px]"
              >
                Get started
              </Link>
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

      {marketing ? (
        <div className="border-t border-[color:var(--apple-hairline)] px-4 py-2 md:hidden">
          <nav className="flex flex-wrap items-center justify-center gap-4" aria-label="Primary mobile">
            {marketingLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={marketingNavLinkClass(
                  pathname === href || pathname.startsWith(href),
                )}
              >
                {label}
              </Link>
            ))}
            <Link href="/login" className={marketingNavLinkClass(false)}>
              Sign in
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
