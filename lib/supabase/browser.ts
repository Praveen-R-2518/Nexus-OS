"use client";

import { createBrowserClient } from "@supabase/auth-helpers-nextjs";

/**
 * Browser Supabase client for auth (Client Components).
 * Uses the anon key — never use for privileged server operations.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return createBrowserClient(url, anonKey);
}
