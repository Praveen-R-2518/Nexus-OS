"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion } from "framer-motion";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

const marketingLinks = [
  { href: "/docs", label: "Docs" },
  { href: "/customers", label: "Customers" },
  { href: "/resources", label: "Resources" },
  { href: "/pricing", label: "Pricing" },
] as const;

function marketingNavLinkClass(active: boolean) {
  return cn(
    "relative inline-flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 px-1 text-[13px] font-medium tracking-normal transition-opacity duration-interaction",
    active
      ? "text-apple-text dark:text-white"
      : "text-apple-text/75 hover:text-apple-text dark:text-white/70 dark:hover:text-white",
  );
}

export default function TopBar() {
  const pathname = usePathname();

  return (
    <header className="apple-chrome-bar sticky top-0 z-50 font-chrome font-sans">
      <div className="mx-auto flex max-w-[1024px] items-center justify-between gap-3 px-4 py-3 md:gap-8 md:px-8">
        <Link
          href="/"
          className="shrink-0 font-sans text-base font-semibold tracking-normal text-apple-text md:text-lg"
        >
          <span className="logo-nexus">Nexus</span>
          <span className="logo-os"> OS</span>
        </Link>

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

        <div className="flex shrink-0 items-center gap-2 font-chrome md:gap-3">
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
        </div>
      </div>
    </header>
  );
}
