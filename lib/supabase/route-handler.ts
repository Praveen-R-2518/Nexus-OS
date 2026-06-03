import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for Route Handlers using the anon key + user session cookies.
 * RLS policies apply (required for owner-scoped inserts like gmail_credentials).
 */
export function createSupabaseRouteHandlerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    return new Proxy({} as SupabaseClient, {
      get(_target, prop) {
        if (prop === "auth") {
          return {
            getSession: async () => ({ data: { session: null }, error: null }),
            getUser: async () => ({ data: { user: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
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
        return undefined;
      }
    });
  }

  const cookieStore = cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a context where cookies are read-only — safe to ignore for this route.
        }
      },
    },
  });
}
