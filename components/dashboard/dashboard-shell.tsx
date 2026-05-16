import Link from "next/link";

import { Separator } from "@/components/ui/separator";

import { AuthGate } from "./auth-gate";
import { DashboardNav } from "./dashboard-nav";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-50">
      <aside className="flex w-[260px] shrink-0 flex-col gap-6 border-zinc-800 border-r px-6 py-8">
        <div className="space-y-1">
          <Link
            href="/dashboard"
            className="font-semibold text-lg text-zinc-50 tracking-tight"
          >
            Nexus OS
          </Link>
          <p className="text-[11px] text-cyan-400 uppercase tracking-[0.35em]">
            Revenue Ops
          </p>
        </div>
        <Separator className="bg-zinc-800" />
        <DashboardNav />
      </aside>
      <main className="min-h-screen flex-1 overflow-auto p-6 lg:p-8">
        <AuthGate>{children}</AuthGate>
      </main>
    </div>
  );
}
