"use client";

import { useEffect, useState } from "react";

/**
 * Returns `null` until mounted, so callers can render a neutral frame during
 * SSR instead of guessing a breakpoint and flashing the wrong layout.
 */
export function useMediaQuery(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);

  return matches;
}
