import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

type ApiAuthResult =
  | { ok: true; user: User }
  | { ok: false; response: NextResponse };

export type ApiTenantContextResult =
  | {
      ok: true;
      user: User;
      supabase: SupabaseClient;
      teamId: string;
      workspaceId: string | null;
    }
  | { ok: false; response: NextResponse };

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const globalForRateLimit = globalThis as unknown as {
  __nexusRateLimit?: Map<string, RateLimitBucket>;
};

const buckets = globalForRateLimit.__nexusRateLimit ?? new Map();
globalForRateLimit.__nexusRateLimit = buckets;

export const JSON_LIMITS = {
  small: 16 * 1024,
  medium: 64 * 1024,
  ingest: 256 * 1024,
} as const;

export function jsonError(
  error: string,
  status: number,
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.json({ error }, { status, headers });
}

export async function requireApiUser(): Promise<ApiAuthResult> {
  try {
    const supabase = createSupabaseRouteHandlerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return { ok: false, response: jsonError("Unauthorized", 401) };
    }

    return { ok: true, user };
  } catch {
    return { ok: false, response: jsonError("Unauthorized", 401) };
  }
}

/**
 * Authenticated user + tenant row scope. Defense-in-depth with RLS (`team_id` via
 * `private.current_team_id()`). Returns 403 when `profiles.team_id` is unset.
 */
export async function requireApiTenantContext(): Promise<ApiTenantContextResult> {
  let supabase: SupabaseClient;
  try {
    supabase = createSupabaseRouteHandlerClient();
  } catch {
    return { ok: false, response: jsonError("Unauthorized", 401) };
  }

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { ok: false, response: jsonError("Unauthorized", 401) };
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr) {
    return { ok: false, response: jsonError(profileErr.message, 500) };
  }

  const teamIdRaw = profile && (profile as { team_id?: unknown }).team_id;
  const teamId =
    typeof teamIdRaw === "string" && teamIdRaw.trim() ? teamIdRaw.trim() : "";

  if (!teamId) {
    return {
      ok: false,
      response: jsonError("Complete workspace setup", 403),
    };
  }

  let workspaceId: string | null = null;
  const { data: ws, error: wsErr } = await supabase
    .from("workspaces")
    .select("id")
    .eq("team_id", teamId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!wsErr && ws && typeof (ws as { id?: unknown }).id === "string") {
    const id = (ws as { id: string }).id.trim();
    workspaceId = id || null;
  }

  return { ok: true, user, supabase, teamId, workspaceId };
}

function clientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstForwarded = forwardedFor?.split(",")[0]?.trim();
  return (
    firstForwarded ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown-client"
  );
}

export function rateLimit(
  request: Request,
  namespace: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  const now = Date.now();
  const key = `${namespace}:${clientKey(request)}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (current.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return jsonError("Too many requests", 429, {
      "Retry-After": String(retryAfter),
    });
  }

  current.count += 1;
  return null;
}

export async function readJsonObjectWithLimit(
  request: Request,
  maxBytes: number,
): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse }
> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const parsed = Number.parseInt(contentLength, 10);
    if (Number.isFinite(parsed) && parsed > maxBytes) {
      return { ok: false, response: jsonError("Request body too large", 413) };
    }
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: jsonError("Invalid request body", 400) };
  }

  if (new TextEncoder().encode(text).length > maxBytes) {
    return { ok: false, response: jsonError("Request body too large", 413) };
  }

  let parsed: unknown;
  try {
    parsed = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return { ok: false, response: jsonError("Invalid JSON body", 400) };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, response: jsonError("Invalid request body", 400) };
  }

  return { ok: true, body: parsed as Record<string, unknown> };
}

export function requireN8nToken(request: Request): NextResponse | null {
  const expected = process.env.N8N_INGEST_TOKEN?.trim();
  if (!expected) {
    return jsonError("Internal workflow endpoint is not configured", 503);
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (token !== expected) {
    return jsonError("Unauthorized", 401);
  }

  return null;
}
