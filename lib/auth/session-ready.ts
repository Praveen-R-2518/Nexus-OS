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

  const start = Date.now();
  let delay = 50;
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
    delay = Math.min(Math.round(delay * 1.5), 400);
  }
  return false;
}
