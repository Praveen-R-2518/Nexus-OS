"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ThemeToggle } from "@/components/ThemeToggle";

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
    router.push("/");
    router.refresh();
  }

  return (
    <div className="px-6 pt-4 pb-2 w-full z-50 sticky top-0">
      <header className="flex w-full items-center justify-between px-8 py-4 rounded-full bg-surface-sidebar dark:bg-black/20 backdrop-blur-md border border-black/10 dark:border-white/10 shadow-lg transition-all duration-300 hover:bg-surface-sidebar/80 dark:hover:bg-black/40 hover:shadow-xl">
        {/* Left: Wordmark */}
        <div className="flex items-center">
          <span className="font-mono text-lg font-bold tracking-[0.2em]">
            <span className="logo-nexus">NEXUS</span>&thinsp;<span className="logo-os">OS</span>
          </span>
        </div>

        {/* Right: Nav Links + Actions */}
        <div className="flex items-center gap-8">
          <nav className="flex items-center gap-8">
            {nav.map(({ href, label }) => {
              const active =
                pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className="text-sm text-[#2E2E2E] px-[10px] py-[6px] rounded-[6px] transition-colors duration-150 hover:bg-[#EBEBEB] hover:text-[#111111] aria-[current=page]:bg-[#E0E0E0] aria-[current=page]:text-[#111111] aria-[current=page]:font-medium cursor-pointer no-underline nav-link"
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex cursor-pointer items-center justify-center rounded-full border border-transparent bg-[#E54D2E] px-5 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#FDEAEA] hover:text-[#8B1A1A] hover:border-[#C0392B]/50"
            >
              Logout <span className="ml-1">→</span>
            </button>
          </div>
        </div>
      </header>
    </div>
  );
}
