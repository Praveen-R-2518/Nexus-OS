"use client";

import { createBrowserClient } from "@supabase/auth-helpers-nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client for auth (Client Components).
 * Uses the anon key — never use for privileged server operations.
 */
export function createSupabaseBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    if (typeof window !== "undefined") {
      console.warn(
        "Supabase credentials missing. Returning dummy client. " +
        "Please create a .env.local file with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
      );
    }
    // Return a dummy client so we don't throw during SSR or initial page load
    return new Proxy({} as SupabaseClient, {
      get(_target, prop) {
        if (prop === "auth") {
          return {
            getSession: async () => ({ data: { session: null }, error: null }),
            getUser: async () => ({ data: { user: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
            signInWithPassword: async () => ({ data: {}, error: new Error("Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local") }),
            signInWithOtp: async () => ({ data: {}, error: new Error("Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local") }),
          };
        }
        if (prop === "from") {
          return () => ({
            select: () => ({
              single: async () => ({ data: null, error: new Error("Supabase is not configured.") }),
              maybeSingle: async () => ({ data: null, error: new Error("Supabase is not configured.") }),
              eq: () => ({
                single: async () => ({ data: null, error: new Error("Supabase is not configured.") }),
                maybeSingle: async () => ({ data: null, error: new Error("Supabase is not configured.") }),
              }),
            }),
            insert: () => ({
              select: () => ({
                single: async () => ({ data: null, error: new Error("Supabase is not configured.") }),
              }),
            }),
            update: () => ({
              eq: async () => ({ data: null, error: new Error("Supabase is not configured.") }),
            }),
          });
        }
        if (prop === "rpc") {
          return async () => ({ data: null, error: new Error("Supabase is not configured.") });
        }
        return undefined;
      }
    });
  }
  return createBrowserClient(url, anonKey);
}
