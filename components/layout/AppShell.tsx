"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { SessionGate } from "@/components/auth/SessionGate";
import SiteFooter from "@/components/layout/SiteFooter";
import AppSidebar from "@/components/layout/AppSidebar";
import TopBar from "@/components/layout/TopBar";
import { TenantScopeGate } from "@/components/tenant/TenantScope";
import { cn } from "@/lib/utils";

const AUTH_ONLY_PREFIXES = ["/login", "/signup"] as const;
const MARKETING_PREFIXES = [
  "/docs",
  "/customers",
  "/resources",
  "/pricing",
  "/privacy",
  "/terms",
] as const;

export function isMarketingShellRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  if (
    MARKETING_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }
  return AUTH_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const marketing = isMarketingShellRoute(pathname);
  const isLanding = pathname === "/";
  const isSupabaseConfigured = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  return (
    <div
      className={cn(
        "flex min-h-screen flex-col",
        marketing
          ? "marketing-apple-shell bg-apple-bg text-apple-text"
          : "bg-surface-page text-atmospheric-grey dark:bg-obsidian",
        isLanding && "landing-full-bleed",
      )}
    >
      {!isSupabaseConfigured && (
        <div className="bg-[#8B1A1A] text-white font-mono text-xs py-2 px-4 text-center z-50">
          ⚠️ <strong>Supabase Configuration Missing</strong>: Please create a <code>.env.local</code> file in the project root containing your Supabase credentials (see <code>.env.example</code>).
        </div>
      )}
      {marketing ? (
        <>
          <TopBar />
          <main
            data-app-body
            className={cn(
              "nexus-marketing-main",
              isLanding
                ? "flex w-full flex-1 flex-col"
                : "mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 md:px-8 md:py-10",
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
                <div className="nexus-app-shell app-shell-bg relative flex min-h-screen">
                  <AppSidebar />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <main
                      data-app-body
                      className="nexus-app-main flex-1 px-4 pb-8 pt-16 md:px-8 md:pt-8 lg:px-10"
                    >
                      {children}
                    </main>
                  </div>
                </div>
              </TenantScopeGate>
            </AuthGuard>
          </Suspense>
        </SessionGate>
      )}
    </div>
  );
}
