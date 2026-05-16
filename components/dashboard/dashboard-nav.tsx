"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardCheck,
  Inbox,
  LayoutDashboard,
  ListTree,
  FileBarChart,
} from "lucide-react";

import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Command Center", Icon: LayoutDashboard },
  { href: "/dashboard/inbox", label: "Inbox", Icon: Inbox },
  { href: "/dashboard/approvals", label: "Approvals", Icon: ClipboardCheck },
  { href: "/dashboard/logs", label: "Workflow Logs", Icon: ListTree },
  { href: "/dashboard/report", label: "Buy-Back Report", Icon: FileBarChart },
] as const;

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1" aria-label="Dashboard">
      {items.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-zinc-800 font-medium text-zinc-50"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
