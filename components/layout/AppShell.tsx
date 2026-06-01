"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { SessionGate } from "@/components/auth/SessionGate";
import SiteFooter from "@/components/layout/SiteFooter";
import TopBar from "@/components/layout/TopBar";
import { TenantScopeGate } from "@/components/tenant/TenantScope";

const AUTH_ONLY_PREFIXES = ["/login", "/signup"] as const;
const MARKETING_PREFIXES = ["/docs", "/customers", "/resources"] as const;

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

  return (
    <div className="flex min-h-screen flex-col bg-surface-page text-atmospheric-grey dark:bg-obsidian">
      {marketing ? (
        <>
          <TopBar marketing />
          <main
            data-app-body
            className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 md:px-8 md:py-10"
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
                <TopBar marketing={false} />
                <main
                  data-app-body
                  className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 md:px-8 md:py-10"
                >
                  {children}
                </main>
                <SiteFooter />
              </TenantScopeGate>
            </AuthGuard>
          </Suspense>
        </SessionGate>
      )}
    </div>
  );
}
