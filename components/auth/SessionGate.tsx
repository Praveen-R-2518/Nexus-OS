"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { waitForServerSession } from "@/lib/auth/session-ready";

function SessionGateSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-0">
      <div className="h-9 w-52 border border-border/60 bg-surface-muted dark:border-border" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[120px] border border-border/60 bg-surface-muted dark:border-border"
          />
        ))}
      </div>
      <div className="h-64 border border-border/60 bg-surface-muted dark:border-border" />
    </div>
  );
}

export function SessionGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await waitForServerSession(router);
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return <SessionGateSkeleton />;
  }

  return <>{children}</>;
}
