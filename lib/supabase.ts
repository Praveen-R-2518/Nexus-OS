import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function isValidUrl(val?: string): boolean {
  return !!val && (val.startsWith("http://") || val.startsWith("https://"));
}

/**
 * Browser Supabase client (Client Components only).
 * Uses the anon key — never import this module into Server Components if it executes at module scope.
 */
export function createBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!isValidUrl(url) || !anonKey) {
    return new Proxy({} as SupabaseClient, {
      get() {
        return () => ({});
      }
    });
  }
  return createClient(url!, anonKey);
}

/**
 * Server Supabase client with **service role** (bypasses RLS).
 * Use only for trusted automation (e.g. `/api/internal/n8n/*`) — not for user-facing reads/writes.
 * For dashboard APIs, use `createSupabaseRouteHandlerClient()` from `@/lib/supabase/route-handler`.
 */
export function createServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isValidUrl(url) || !serviceRoleKey) {
    return new Proxy({} as SupabaseClient, {
      get() {
        return () => ({});
      }
    });
  }
  return createClient(
    url!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
