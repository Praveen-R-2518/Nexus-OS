"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CheckSquare,
  FileText,
  Inbox,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Command Center", Icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", Icon: Inbox },
  { href: "/approval", label: "Approval Queue", Icon: CheckSquare },
  { href: "/report", label: "Buy-Back Report", Icon: FileText },
  { href: "/logs", label: "Workflow Logs", Icon: Activity },
] as const;

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[240px] flex-col border-r border-white/10 bg-obsidian/40 backdrop-blur-xl">
      <div className="border-b border-white/10 px-4 py-5">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-trajectory-blue">
          Nexus OS
        </p>
        <p className="mt-1 text-sm font-semibold text-atmospheric-grey">Command Center</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {nav.map(({ href, label, Icon }) => {
          const active =
            pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
                active
                  ? "bg-trajectory-blue/10 text-trajectory-blue shadow-[inset_0_0_12px_rgba(0,82,204,0.2)] border border-trajectory-blue/20"
                  : "text-atmospheric-grey/60 border border-transparent hover:bg-white/5 hover:text-atmospheric-grey",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
