import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Only used on the server. Importing from a client bundle fails the build (`server-only`). */
function readAdminEnv(): { url: string; serviceRoleKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    const missing = [
      !url ? "NEXT_PUBLIC_SUPABASE_URL" : null,
      !serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
    ].filter(Boolean) as string[];
    throw new Error(
      `Supabase admin: missing env — ${missing.join(", ")}. ` +
        "Set them in .env.local on the machine running Next.js (service role stays server-side only).",
    );
  }

  return { url, serviceRoleKey };
}

/**
 * Prefer this when you want a fresh client (tests, isolation).
 * Never import into client components.
 */
export function createSupabaseAdmin(): SupabaseClient {
  const { url, serviceRoleKey } = readAdminEnv();
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

const globalForSupabase =
  typeof globalThis !== "undefined"
    ? (globalThis as unknown as { __nexus_supabase_admin?: SupabaseClient })
    : { __nexus_supabase_admin: undefined as SupabaseClient | undefined };

function getSingletonAdmin(): SupabaseClient {
  if (!globalForSupabase.__nexus_supabase_admin) {
    globalForSupabase.__nexus_supabase_admin = createSupabaseAdmin();
  }
  return globalForSupabase.__nexus_supabase_admin;
}

/**
 * Shared admin client for Route Handlers / Server Actions (lazy; env checked on first use).
 * Not usable in `"use client"` modules (blocked by `server-only`).
 *
 * Prefer `await supabaseAdmin.from(...)` — first access initializes the underlying client.
 */
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_, prop: keyof SupabaseClient) {
    const client = getSingletonAdmin();
    const value = Reflect.get(client, prop, client) as unknown;
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
