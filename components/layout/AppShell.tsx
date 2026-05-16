"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";

const AUTH_ONLY_PREFIXES = ["/login"] as const;

function isAuthOnlyRoute(pathname: string): boolean {
  return AUTH_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const bare = isAuthOnlyRoute(pathname);

  if (bare) {
    return (
      <div className="flex min-h-screen flex-col bg-gray-900">{children}</div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col pl-[240px]">
        <TopBar />
        <main className="flex-1 bg-gray-900 p-6">{children}</main>
      </div>
    </div>
  );
}
