import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Browser Supabase client (Client Components only).
 * Uses the anon key — never import this module into Server Components if it executes at module scope.
 */
export function createBrowserClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}

/**
 * Server Supabase client with **service role** (bypasses RLS).
 * Use only for trusted automation (e.g. `/api/internal/n8n/*`) — not for user-facing reads/writes.
 * For dashboard APIs, use `createSupabaseRouteHandlerClient()` from `@/lib/supabase/route-handler`.
 */
export function createServerClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
