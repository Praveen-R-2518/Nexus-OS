"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SessionGate } from "@/components/auth/SessionGate";
import SiteFooter from "@/components/layout/SiteFooter";
import TopBar from "@/components/layout/TopBar";

const AUTH_ONLY_PREFIXES = ["/login", "/signup"] as const;

export function isMarketingShellRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  return AUTH_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const marketing = isMarketingShellRoute(pathname);

  return (
    <div className="flex min-h-screen flex-col bg-surface-page text-atmospheric-grey dark:bg-obsidian">
      <TopBar marketing={marketing} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 md:px-8 md:py-10">
        {marketing ? children : <SessionGate>{children}</SessionGate>}
      </main>
      <SiteFooter />
    </div>
  );
}
