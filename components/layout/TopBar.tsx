"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

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
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-obsidian/40 px-6 backdrop-blur-xl">
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
        <button
          type="button"
          onClick={() => void signOut()}
          className="glass-button inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-atmospheric-grey/80 hover:text-red-300 hover:border-red-500/40 hover:bg-red-500/10"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Sign out
        </button>
      </div>
    </header>
  );
}
