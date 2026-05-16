"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function TopBar() {
  const router = useRouter();
  /** Avoid hydration mismatch: SSR and first paint share a stable placeholder. */
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-obsidian/90 px-6 backdrop-blur">
      <span className="font-mono text-sm font-semibold tracking-wide text-atmospheric-grey">
        NEXUS OS
      </span>
      <div className="flex items-center gap-4">
        <time
          dateTime={now?.toISOString() ?? undefined}
          className="font-mono text-sm tabular-nums text-trajectory-blue"
        >
          {now ? format(now, "yyyy-MM-dd HH:mm:ss") : "—"}
        </time>
        <ThemeToggle />
        <button
          type="button"
          onClick={() => void signOut()}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-atmospheric-grey/60 transition hover:border-red-500/40 hover:bg-red-950/30 hover:text-red-200"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Sign out
        </button>
      </div>
    </header>
  );
}
