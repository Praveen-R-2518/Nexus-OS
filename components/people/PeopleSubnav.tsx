"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

function isEmployeesPath(pathname: string): boolean {
  if (pathname === "/people") return true;
  if (!pathname.startsWith("/people/")) return false;
  return (
    !pathname.startsWith("/people/jobs") &&
    !pathname.startsWith("/people/candidates") &&
    !pathname.startsWith("/people/email")
  );
}

const ITEMS = [
  {
    href: "/people",
    label: "Employees",
    match: isEmployeesPath,
  },
  {
    href: "/people/jobs",
    label: "Jobs",
    match: (pathname: string) =>
      pathname === "/people/jobs" || pathname.startsWith("/people/jobs/"),
  },
  {
    href: "/people/candidates",
    label: "Candidates",
    match: (pathname: string) =>
      pathname === "/people/candidates" ||
      pathname.startsWith("/people/candidates/"),
  },
  {
    href: "/people/email",
    label: "Email",
    match: (pathname: string) =>
      pathname === "/people/email" || pathname.startsWith("/people/email/"),
  },
] as const;

export function PeopleSubnav() {
  const pathname = usePathname();

  return (
    <nav aria-label="People sections" className="flex flex-wrap gap-2">
      {ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-xl border px-3 py-2 text-[13px] font-medium tracking-normal transition-colors duration-interaction",
              active
                ? "border-nexus-approval-border bg-nexus-approval-soft text-nexus-approval"
                : "border-border-strong bg-surface-muted text-atmospheric-grey/80 hover:bg-surface-elevated hover:text-atmospheric-grey",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
