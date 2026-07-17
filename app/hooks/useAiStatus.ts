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
        // #region agent log
        fetch("http://127.0.0.1:7718/ingest/82f32985-4bff-4337-b714-72c7f9526288", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "23c246" },
          body: JSON.stringify({
            sessionId: "23c246",
            runId: "post-fix",
            hypothesisId: "E",
            location: "app/hooks/useAiStatus.ts:fetch",
            message: "AI status fetch result",
            data: { ok: res.ok, status: res.status },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        if (!res.ok) return;
        const data = (await res.json()) as AiStatus;
        // #region agent log
        fetch("http://127.0.0.1:7718/ingest/82f32985-4bff-4337-b714-72c7f9526288", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "23c246" },
          body: JSON.stringify({
            sessionId: "23c246",
            runId: "post-fix",
            hypothesisId: "A,B,C,D",
            location: "app/hooks/useAiStatus.ts:parsed",
            message: "AI status client parsed",
            data: { configured: data.configured, mock: data.mock, chat: data.features.chat },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
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
