"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import TopBar from "@/components/layout/TopBar";

const AUTH_ONLY_PREFIXES = ["/login", "/signup"] as const;

function isAuthOnlyRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  return AUTH_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const bare = isAuthOnlyRoute(pathname);

  if (bare) {
    return (
      <div className="flex min-h-screen flex-col bg-obsidian">{children}</div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-obsidian">
      <TopBar />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
