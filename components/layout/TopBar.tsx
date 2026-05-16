"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Command Center" },
  { href: "/inbox", label: "Inbox" },
  { href: "/approval", label: "Approval Queue" },
  { href: "/report", label: "Buy-Back Report" },
  { href: "/logs", label: "Workflow Logs" },
] as const;

export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-obsidian/40 px-8 backdrop-blur-xl">
      <div className="flex items-center">
        <Image
          src="/Logo.svg"
          alt="Nexus OS Logo"
          width={180}
          height={60}
          className="h-12 w-auto"
          priority
        />
      </div>
      <div className="flex items-center gap-8">
        <nav className="hidden md:flex items-center gap-6">
          {nav.map(({ href, label }) => {
            const active =
              pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                prefetch={true}
                className={cn(
                  "text-sm font-medium transition-colors",
                  active
                    ? "text-trajectory-blue"
                    : "text-atmospheric-grey/60 hover:text-atmospheric-grey"
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => void signOut()}
          className="glass-button inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-atmospheric-grey/80 transition hover:border-red-500/40 hover:bg-red-950/30 hover:text-red-200"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Sign out
        </button>
      </div>
    </header>
  );
}
