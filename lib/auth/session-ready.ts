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

  // Each poll hits `/api/auth/session` -> server `getUser()` (a GoTrue call).
  // Use a higher initial delay and steeper backoff so we make far fewer of
  // these calls, since stacking them right after auth contributes to 429s.
  const start = Date.now();
  let delay = 300;
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
    delay = Math.min(Math.round(delay * 2), 800);
  }
  return false;
}
