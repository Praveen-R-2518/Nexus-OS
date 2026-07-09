"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  FileText,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  X,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ThemeToggle } from "@/components/ThemeToggle";
import { prefetchNavRoute } from "@/lib/queries/nav-prefetch";
import { useTenantScopeOptional } from "@/components/tenant/TenantScope";
import { cn } from "@/lib/utils";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

const appNav = [
  { href: "/dashboard", label: "Command Center", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/chat", label: "Revenue Analyst", icon: Sparkles },
  { href: "/approval", label: "Approval Queue", icon: CheckCircle2 },
  { href: "/report", label: "Buy-Back Report", icon: FileText },
] as const;

function isNavActive(pathname: string, href: string): boolean {
  return (
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(href))
  );
}

function SidebarNav({
  collapsed,
  onNavigate,
  className,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const tenant = useTenantScopeOptional();

  return (
    <nav className={cn("flex shrink-0 flex-col gap-0.5", className)} aria-label="App">
      {appNav.map(({ href, label, icon: Icon }) => {
        const active = isNavActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            aria-label={collapsed ? label : undefined}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            onMouseEnter={() => prefetchNavRoute(queryClient, href, tenant)}
            onFocus={() => prefetchNavRoute(queryClient, href, tenant)}
            className={cn(
              "flex min-h-9 items-center rounded-xl text-[13px] font-medium transition-colors duration-interaction",
              collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
              active
                ? "bg-glass text-atmospheric-grey shadow-sm"
                : "text-muted hover:bg-glass/60 hover:text-atmospheric-grey",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                active ? "text-nexus-approval" : "text-muted",
              )}
              aria-hidden
            />
            {!collapsed ? <span className="truncate">{label}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
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
    <div
      className={cn(
        "mt-auto shrink-0 border-t border-glass-border pt-3",
        collapsed ? "flex flex-col items-center gap-2" : "flex flex-col gap-2",
      )}
    >
      <div
        className={cn(
          "flex items-center rounded-xl border border-glass-border bg-glass/50",
          collapsed
            ? "h-9 w-9 justify-center p-0"
            : "justify-between gap-2 px-2 py-1",
        )}
      >
        {!collapsed ? (
          <span className="px-1 text-xs font-medium text-muted">Theme</span>
        ) : null}
        <ThemeToggle />
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        title={collapsed ? "Log out" : undefined}
        aria-label={collapsed ? "Log out" : undefined}
        className={cn(
          "inline-flex cursor-pointer items-center justify-center rounded-xl border border-glass-border bg-glass/40 text-[13px] font-medium text-atmospheric-grey transition-colors hover:bg-glass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-approval",
          collapsed ? "h-9 w-9" : "min-h-9 w-full gap-2 px-3 py-2",
        )}
      >
        <LogOut className="h-4 w-4 shrink-0" aria-hidden />
        {!collapsed ? "Log out" : null}
      </button>
    </div>
  );
}

function SidebarHeader({
  collapsed,
  onToggleCollapse,
  onNavigate,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex shrink-0 items-center",
        collapsed ? "flex-col gap-2" : "justify-between gap-2",
      )}
    >
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className={cn(
          "font-semibold tracking-tight text-atmospheric-grey",
          collapsed ? "flex h-9 w-9 items-center justify-center text-lg" : "px-2 text-[21px]",
        )}
        title={collapsed ? "Nexus OS" : undefined}
      >
        {collapsed ? (
          <span className="logo-nexus">N</span>
        ) : (
          <>
            <span className="logo-nexus">Nexus</span>
            <span className="logo-os"> OS</span>
          </>
        )}
      </Link>
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-glass-border bg-glass/50 text-atmospheric-grey transition-colors hover:bg-glass"
      >
        {collapsed ? (
          <PanelLeftOpen className="h-4 w-4" aria-hidden />
        ) : (
          <PanelLeftClose className="h-4 w-4" aria-hidden />
        )}
      </button>
    </div>
  );
}

export default function AppSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true");
    } catch {
      setCollapsed(false);
    }
    setHydrated(true);
  }, []);

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

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const closeMobile = () => setMobileOpen(false);
  const desktopCollapsed = hydrated && collapsed;

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

      <aside
        className={cn(
          "app-sidebar sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden py-4 transition-[width] duration-200 lg:flex",
          desktopCollapsed ? "w-[4.5rem] px-2" : "w-64 px-4",
        )}
      >
        <SidebarHeader collapsed={desktopCollapsed} onToggleCollapse={toggleCollapse} />
        <SidebarNav collapsed={desktopCollapsed} />
        <SidebarFooter collapsed={desktopCollapsed} />
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
              className="app-sidebar fixed inset-y-0 left-0 z-50 flex h-screen w-[min(18rem,85vw)] flex-col overflow-hidden px-4 py-4 lg:hidden"
            >
              <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
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
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-glass-border bg-glass/60 text-atmospheric-grey"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <SidebarNav onNavigate={closeMobile} />
              <SidebarFooter onNavigate={closeMobile} />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
