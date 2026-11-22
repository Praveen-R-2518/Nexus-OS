"use client";

import { useMediaQuery } from "@/lib/landing/useMediaQuery";

const LG_UP_QUERY = "(min-width: 1024px)";

/**
 * True from the Tailwind `lg` breakpoint (1024px) up.
 * False until mounted so SSR and the first paint stay mobile-safe.
 */
export function useLgUp(): boolean {
  return useMediaQuery(LG_UP_QUERY) === true;
}
