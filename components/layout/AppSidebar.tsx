"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutGroup, motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  CheckCircle2,
  FileText,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Sparkles,
  X,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ThemeToggle } from "@/components/ThemeToggle";
import { prefetchNavRoute } from "@/lib/queries/nav-prefetch";
import { useTenantScopeOptional } from "@/components/tenant/TenantScope";
import { cn } from "@/lib/utils";

const appNav = [
  { href: "/dashboard", label: "Command Center", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/chat", label: "Revenue Analyst", icon: Sparkles },
  { href: "/approval", label: "Approval Queue", icon: CheckCircle2 },
  { href: "/report", label: "Buy-Back Report", icon: FileText },
  { href: "/logs", label: "Workflow Logs", icon: Activity },
] as const;

function isNavActive(pathname: string, href: string): boolean {
  return (
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(href))
  );
}

function SidebarNav({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const tenant = useTenantScopeOptional();

  return (
    <nav className={cn("flex flex-col gap-1", className)} aria-label="App">
      <LayoutGroup id="app-sidebar-nav">
        {appNav.map(({ href, label, icon: Icon }) => {
          const active = isNavActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              onMouseEnter={() => prefetchNavRoute(queryClient, href, tenant)}
              onFocus={() => prefetchNavRoute(queryClient, href, tenant)}
              className={cn(
                "relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors duration-interaction",
                active
                  ? "bg-glass text-atmospheric-grey shadow-sm"
                  : "text-muted hover:bg-glass/60 hover:text-atmospheric-grey",
              )}
            >
              {active ? (
                <motion.span
                  layoutId="sidebarActiveIndicator"
                  className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-nexus-approval"
                  transition={{
                    type: "spring",
                    stiffness: 380,
                    damping: 32,
                    mass: 0.55,
                  }}
                />
              ) : null}
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  active ? "text-nexus-approval" : "text-muted",
                )}
                aria-hidden
              />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </LayoutGroup>
    </nav>
  );
}

function SidebarFooter({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  async function signOut() {
    onNavigate?.();
    queryClient.clear();
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-glass-border pt-4">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-glass-border bg-glass/50 px-2 py-1.5">
        <span className="px-1 text-xs font-medium text-muted">Theme</span>
        <ThemeToggle />
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-glass-border bg-glass/40 px-3 py-2 text-[13px] font-medium text-atmospheric-grey transition-colors hover:bg-glass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-approval"
      >
        <LogOut className="h-4 w-4 shrink-0" aria-hidden />
        Log out
      </button>
    </div>
  );
}

export default function AppSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-glass-border bg-glass text-atmospheric-grey shadow-sm backdrop-blur lg:hidden"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      <aside className="app-sidebar hidden w-64 shrink-0 flex-col px-4 py-6 lg:flex">
        <Link
          href="/dashboard"
          className="mb-8 shrink-0 px-2 text-[21px] font-semibold tracking-tight"
        >
          <span className="logo-nexus text-atmospheric-grey">Nexus</span>
          <span className="logo-os"> OS</span>
        </Link>
        <SidebarNav className="flex-1" />
        <SidebarFooter />
      </aside>

      <AnimatePresence>
        {mobileOpen ? (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden"
              aria-label="Close navigation menu"
              onClick={closeMobile}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              className="app-sidebar fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] flex-col px-4 py-6 lg:hidden"
            >
              <div className="mb-6 flex items-center justify-between gap-3">
                <Link
                  href="/dashboard"
                  onClick={closeMobile}
                  className="shrink-0 text-lg font-semibold tracking-tight"
                >
                  <span className="logo-nexus text-atmospheric-grey">Nexus</span>
                  <span className="logo-os"> OS</span>
                </Link>
                <button
                  type="button"
                  onClick={closeMobile}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-glass-border bg-glass/60 text-atmospheric-grey"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <SidebarNav className="flex-1" onNavigate={closeMobile} />
              <SidebarFooter onNavigate={closeMobile} />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
