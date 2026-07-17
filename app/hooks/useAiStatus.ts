"use client";

import { useEffect, useState } from "react";
import type { AiStatus } from "@/lib/ai/status";

const LOADING: AiStatus = {
  configured: true,
  mock: false,
  features: {
    classify: true,
    draft: true,
    reportSummary: true,
    chat: true,
    embeddings: true,
  },
};

/**
 * Client hook for `GET /api/ai/status`. Defaults optimistically to "configured" while loading
 * so the UI doesn't flash a disabled state on every mount; flips to the real value once the
 * fetch resolves. Use this to show a disabled/degraded state (e.g. on the Chat page or the
 * approval queue) instead of letting an AI call fail silently.
 */
export function useAiStatus(): { status: AiStatus; loading: boolean } {
  const [status, setStatus] = useState<AiStatus>(LOADING);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as AiStatus;
        if (!cancelled) setStatus(data);
      } catch {
        /* best-effort: keep the optimistic default on failure */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { status, loading };
}
