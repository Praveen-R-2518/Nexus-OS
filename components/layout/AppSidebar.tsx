"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  ImageIcon,
  Inbox,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
  X,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ThemeToggle } from "@/components/ThemeToggle";
import { prefetchNavRoute } from "@/lib/queries/nav-prefetch";
import { useTenantScopeOptional } from "@/components/tenant/TenantScope";
import { isSocialPublishingEnabled } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";
const SIDEBAR_EXPANDED_WIDTH = "15.5rem";
const SIDEBAR_COLLAPSED_WIDTH = "4.75rem";

const appNav = [
  { href: "/dashboard", label: "Command Center", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/approval", label: "Approval Queue", icon: CheckCircle2 },
  { href: "/report", label: "Buy-Back Report", icon: FileText },
  // Task C: hidden behind NEXT_PUBLIC_FEATURE_SOCIAL_PUBLISHING (default OFF) — the /posts route
  // stays alive for direct/deep links, this only hides the nav entry.
  { href: "/posts", label: "Posts", icon: ImageIcon, flag: "socialPublishing" as const },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/team", label: "Team", icon: Users },
  { href: "/logs", label: "Logs", icon: ClipboardList },
  { href: "/profile", label: "Settings", icon: Settings },
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
  const visibleNav = appNav.filter(
    (item) => !("flag" in item) || item.flag !== "socialPublishing" || isSocialPublishingEnabled(),
  );

  return (
    <nav
      className={cn(
        "flex min-h-0 flex-1 flex-col justify-start gap-1 pt-6",
        className,
      )}
      aria-label="App"
    >
      {visibleNav.map(({ href, label, icon: Icon }) => {
        const active = isNavActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            aria-label={collapsed ? label : undefined}
            aria-current={active ? "page" : undefined}
            data-active={active}
            onClick={onNavigate}
            onMouseEnter={() => prefetchNavRoute(queryClient, href, tenant)}
            onFocus={() => prefetchNavRoute(queryClient, href, tenant)}
            className={cn(
              "app-sidebar-nav-link flex items-center rounded-2xl text-[15px] font-medium transition-colors duration-interaction",
              collapsed
                ? "justify-center px-2 py-3"
                : "gap-3.5 px-4 py-3.5",
            )}
          >
            <Icon className="h-[1.125rem] w-[1.125rem] shrink-0" aria-hidden />
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
        "mt-auto shrink-0 pt-6",
        collapsed ? "flex flex-col items-center gap-3" : "flex flex-col gap-3",
      )}
    >
      <div
        className={cn(
          "flex items-center",
          collapsed ? "justify-center" : "justify-start px-1",
        )}
      >
        <ThemeToggle className="app-sidebar-theme-toggle inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-sidebar-nav-active)_25%,transparent)]" />
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        title={collapsed ? "Log out" : undefined}
        aria-label={collapsed ? "Log out" : undefined}
        className={cn(
          "app-sidebar-nav-link inline-flex cursor-pointer items-center justify-center rounded-2xl text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-sidebar-nav-active)_25%,transparent)]",
          collapsed ? "h-11 w-11" : "min-h-11 w-full gap-3.5 px-4 py-3",
        )}
      >
        <LogOut className="h-[1.125rem] w-[1.125rem] shrink-0" aria-hidden />
        {!collapsed ? "Log out" : null}
      </button>
    </div>
  );
}

function SidebarBrand({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href="/dashboard"
      onClick={onNavigate}
      title="Nexus OS"
      className={cn(
        "font-semibold tracking-tight text-[var(--app-sidebar-nav-active)] transition-opacity hover:opacity-80",
        collapsed
          ? "flex h-11 w-11 items-center justify-center text-lg"
          : "px-1 text-[21px]",
      )}
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
        "flex shrink-0 items-center",
        collapsed ? "flex-col gap-4" : "flex-col gap-4",
      )}
    >
      <div
        className={cn(
          "flex w-full items-center",
          collapsed ? "flex-col gap-3" : "justify-between gap-3",
        )}
      >
        <SidebarBrand collapsed={collapsed} onNavigate={onNavigate} />
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="app-sidebar-chrome-btn inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" aria-hidden />
          ) : (
            <PanelLeftClose className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}

function SidebarChrome({
  collapsed,
  onToggleCollapse,
  onNavigate,
  className,
}: {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("app-sidebar-inner flex h-full min-h-0 flex-col", className)}>
      <SidebarHeader
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse ?? (() => {})}
        onNavigate={onNavigate}
      />
      <SidebarNav collapsed={collapsed} onNavigate={onNavigate} />
      <SidebarFooter collapsed={collapsed} onNavigate={onNavigate} />
    </div>
  );
}

export default function AppSidebar({
  mobileOpen: controlledMobileOpen,
  onMobileOpenChange,
}: {
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
} = {}) {
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const mobileOpen = controlledMobileOpen ?? internalMobileOpen;
  const setMobileOpen = onMobileOpenChange ?? setInternalMobileOpen;
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
  }, [pathname, setMobileOpen]);

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
  const sidebarWidth = desktopCollapsed
    ? SIDEBAR_COLLAPSED_WIDTH
    : SIDEBAR_EXPANDED_WIDTH;

  return (
    <>
      {/* Layout spacer — keeps main content from sliding under the fixed sidebar */}
      <div
        className="hidden shrink-0 transition-[width] duration-200 lg:block"
        style={{ width: sidebarWidth }}
        aria-hidden
      />

      <aside
        className="app-sidebar fixed inset-y-0 left-0 top-0 z-30 hidden h-svh min-h-svh max-h-svh flex-col overflow-hidden transition-[width] duration-200 lg:flex"
        style={{ width: sidebarWidth }}
      >
        <SidebarChrome
          collapsed={desktopCollapsed}
          onToggleCollapse={toggleCollapse}
          className="h-full px-4 py-5"
        />
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
              className="app-sidebar fixed inset-y-0 left-0 top-0 z-50 flex h-svh min-h-svh max-h-svh w-[min(18rem,85vw)] flex-col overflow-hidden lg:hidden"
            >
              <div className="mb-4 flex shrink-0 items-center justify-between gap-3 px-4 pt-4">
                <Link
                  href="/dashboard"
                  onClick={closeMobile}
                  className="shrink-0 text-lg font-semibold tracking-tight"
                >
                  <span className="logo-nexus">Nexus</span>
                  <span className="logo-os"> OS</span>
                </Link>
                <button
                  type="button"
                  onClick={closeMobile}
                  className="app-sidebar-chrome-btn inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <SidebarChrome
                collapsed={false}
                onNavigate={closeMobile}
                className="min-h-0 flex-1 px-4 pb-6"
              />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
