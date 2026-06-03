"use client";

import { authenticatedFetch } from "./authenticated-fetch";

export type SessionRouter = { refresh: () => void | Promise<void> };

/**
 * After browser auth, sync server-readable cookies before calling protected APIs.
 */
export async function waitForServerSession(
  router: SessionRouter,
  options?: { maxWaitMs?: number },
): Promise<boolean> {
  const maxWait = options?.maxWaitMs ?? 2500;
  try {
    await router.refresh();
  } catch {
    /* ignore */
  }

  // Higher initial delay + faster backoff keeps the happy path fast while
  // cutting the burst of GoTrue `/user` calls that can contribute to 429s.
  const start = Date.now();
  let delay = 150;
  while (Date.now() - start < maxWait) {
    try {
      const res = await authenticatedFetch("/api/auth/session", {
        method: "GET",
      });
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(Math.round(delay * 1.8), 600);
  }
  return false;
}
