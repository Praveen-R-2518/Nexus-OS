"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { waitForServerSession } from "@/lib/auth/session-ready";

function SessionGateSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2 animate-pulse">
      <div className="h-10 w-48 rounded-lg bg-gray-200 dark:bg-gray-800" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[132px] rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800/40"
          />
        ))}
      </div>
      <div className="h-64 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800/30" />
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
