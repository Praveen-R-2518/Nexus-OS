"use client";

import type { ReactNode } from "react";
import { Suspense, useState } from "react";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { SessionGate } from "@/components/auth/SessionGate";
import { AppChromeSearchProvider } from "@/components/layout/AppChromeSearch";
import SiteFooter from "@/components/layout/SiteFooter";
import AppSidebar from "@/components/layout/AppSidebar";
import { AppTopBar } from "@/components/layout/AppTopBar";
import TopBar from "@/components/layout/TopBar";
import { TenantScopeGate } from "@/components/tenant/TenantScope";
import { TenantScopeErrorBanner } from "@/components/tenant/TenantScopeErrorBanner";
import { useAppearancePrefs } from "@/lib/use-appearance-prefs";
import { cn } from "@/lib/utils";

const LIGHT_SHELL_PREFIXES = [
  "/docs",
  "/customers",
  "/resources",
  "/pricing",
  "/privacy",
  "/terms",
  "/login",
  "/signup",
] as const;

/**
 * Marketing + auth surfaces share the landing page's light-locked Swiss shell.
 * The app console keeps its own themed chrome.
 */
export function isLightShellRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  return LIGHT_SHELL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** @deprecated Use isLightShellRoute — kept for any callers that import the old name. */
export function isMarketingShellRoute(pathname: string): boolean {
  return isLightShellRoute(pathname);
}

export function isAuthShellRoute(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/signup" ||
    pathname.startsWith("/signup/")
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { fontScale, mounted: appearanceMounted } = useAppearancePrefs();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const lightShell = isLightShellRoute(pathname);
  const authShell = isAuthShellRoute(pathname);
  const isHome = pathname === "/";
  const isSupabaseConfigured = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  return (
    <div
      className={cn(
        "flex min-h-screen flex-col",
        lightShell
          ? "marketing-apple-shell landing-full-bleed bg-apple-bg text-apple-text"
          : "bg-surface-page text-atmospheric-grey dark:bg-obsidian",
      )}
    >
      {!isSupabaseConfigured && (
        <div className="bg-[#8B1A1A] text-white font-mono text-xs py-2 px-4 text-center z-50">
          ⚠️ <strong>Supabase Configuration Missing</strong>: Please create a <code>.env.local</code> file in the project root containing your Supabase credentials (see <code>.env.example</code>).
        </div>
      )}
      {authShell ? (
        <main
          data-app-body
          className="nexus-marketing-main flex min-h-dvh w-full flex-1 flex-col bg-white"
        >
          {children}
        </main>
      ) : lightShell ? (
        <>
          <TopBar />
          <main
            data-app-body
            className={cn(
              "nexus-marketing-main flex w-full flex-1 flex-col",
              /* Home owns its own section padding; other light pages get a calm page frame. */
              !isHome && "bg-white",
            )}
          >
            {children}
          </main>
          <SiteFooter />
        </>
      ) : (
        <SessionGate>
          <Suspense
            fallback={
              <div className="flex min-h-[40vh] items-center justify-center font-mono text-xs uppercase tracking-widest text-muted">
                Loading…
              </div>
            }
          >
            <AuthGuard>
              <TenantScopeGate>
                <AppChromeSearchProvider>
                  <div
                    className="nexus-app-shell app-shell-bg relative flex min-h-screen"
                    data-font-scale={appearanceMounted ? fontScale : "default"}
                  >
                    <AppSidebar
                      mobileOpen={mobileNavOpen}
                      onMobileOpenChange={setMobileNavOpen}
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <AppTopBar onOpenMobileNav={() => setMobileNavOpen(true)} />
                      <TenantScopeErrorBanner />
                      <main
                        data-app-body
                        className="nexus-app-main flex-1 px-4 pb-8 pt-4 md:px-8 md:pt-6 lg:px-10"
                      >
                        {children}
                      </main>
                    </div>
                  </div>
                </AppChromeSearchProvider>
              </TenantScopeGate>
            </AuthGuard>
          </Suspense>
        </SessionGate>
      )}
    </div>
  );
}
