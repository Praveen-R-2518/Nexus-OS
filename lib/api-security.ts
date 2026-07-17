import "server-only";

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { resolveOrganizationIdForUser } from "@/lib/organization-bridge";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServerClient } from "@/lib/supabase";

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

export type ApiOrgContextResult =
  | {
      ok: true;
      user: User;
      supabase: SupabaseClient;
      organizationId: string;
    }
  | { ok: false; response: NextResponse };

/**
 * Authenticated user + organization scope for the social/posts layer, which is
 * isolated by `organization_id` (user_profiles) rather than `team_id`. The org id
 * is resolved SERVER-SIDE from the caller's own `user_profiles` row — never trust
 * an org id supplied by the browser.
 */
export async function requireApiOrgContext(): Promise<ApiOrgContextResult> {
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

  let organizationId: string;
  try {
    const resolved = await resolveOrganizationIdForUser(supabase, user.id);
    organizationId = resolved ?? "";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to resolve organization";
    return { ok: false, response: jsonError(message, 500) };
  }

  if (!organizationId) {
    return {
      ok: false,
      response: jsonError("Complete workspace setup", 403),
    };
  }

  return { ok: true, user, supabase, organizationId };
}

/**
 * Constant-time comparison for secret/token strings. Returns false on length
 * mismatch (the length of these tokens is not itself sensitive). Prevents the
 * early-exit timing side-channel of `===` / `!==` when comparing secrets.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Sensitive namespaces (internal n8n ingest + pre-auth endpoints) stay
 * rate-limited even when no client IP is derivable, so a caller cannot bypass
 * the limiter — and brute-force a shared secret — simply by stripping the
 * `x-forwarded-for` / `x-real-ip` headers. Such callers share one `__noip__`
 * bucket, which is acceptable because production traffic arrives through a
 * proxy that always sets a forwarding header.
 */
function isSensitiveNamespace(namespace: string): boolean {
  return (
    namespace.startsWith("api:internal:") ||
    namespace.startsWith("api:auth:") ||
    namespace.startsWith("api:posts:")
  );
}

function clientKey(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstForwarded = forwardedFor?.split(",")[0]?.trim();
  const ip = firstForwarded || request.headers.get("x-real-ip")?.trim();
  if (ip) return ip;
  // No identifiable client IP (e.g. local dev or a proxy that strips it).
  // Returning null avoids bucketing every visitor under one shared key,
  // which would otherwise cause spurious 429s under light traffic.
  return null;
}

export function rateLimit(
  request: Request,
  namespace: string,
  limit: number,
  windowMs: number,
  options?: { fallbackWhenNoIp?: boolean },
): NextResponse | null {
  const fallbackWhenNoIp =
    options?.fallbackWhenNoIp ?? isSensitiveNamespace(namespace);
  const client = clientKey(request) ?? (fallbackWhenNoIp ? "__noip__" : null);
  if (!client) {
    // Cannot identify the caller and this namespace opted out of the shared
    // fallback bucket; skip limiting rather than bucket every visitor together.
    return null;
  }
  const now = Date.now();
  const key = `${namespace}:${client}`;
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

type RateLimitHitResult = {
  allowed?: boolean;
  remaining?: number;
  reset_at?: string;
};

/**
 * Durable, cross-instance rate limit backed by the `rate_limit_hit` Postgres RPC
 * (migration 20260715140000). The in-memory `rateLimit()` resets on redeploy and is
 * per-serverless-instance, so sensitive/costly namespaces consult this counter too.
 * On any RPC failure it falls back to the in-memory limiter (with the shared no-IP
 * bucket) rather than failing open with no limit at all.
 *
 * `options.key` replaces the client-IP key for tenant-scoped quotas
 * (e.g. a per-organization daily image-generation cap).
 */
export async function rateLimitDurable(
  request: Request,
  namespace: string,
  limit: number,
  windowMs: number,
  options?: { key?: string },
): Promise<NextResponse | null> {
  const client = options?.key ?? clientKey(request) ?? "__noip__";
  const key = `${namespace}:${client}`;

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc("rate_limit_hit", {
      p_key: key,
      p_max: limit,
      p_window_ms: windowMs,
    });
    if (error) throw error;

    const result = (data ?? null) as RateLimitHitResult | null;
    if (result && result.allowed === false) {
      const resetMs = result.reset_at
        ? new Date(result.reset_at).getTime() - Date.now()
        : windowMs;
      const retryAfter = Math.max(1, Math.ceil(resetMs / 1000));
      return jsonError("Too many requests", 429, {
        "Retry-After": String(retryAfter),
      });
    }
    return null;
  } catch {
    return rateLimit(request, namespace, limit, windowMs, {
      fallbackWhenNoIp: true,
    });
  }
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

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  return header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

/**
 * Guards scheduler/claim endpoints that run BEFORE any specific job exists yet (e.g. the Gmail
 * sync poll, the ledger drain sweep, claiming a due scheduled post). Accepts the new
 * `N8N_BOOTSTRAP_TOKEN` OR — during the migration off one broad secret — the legacy
 * `N8N_INGEST_TOKEN`, so existing n8n Variables keep working until they're rotated.
 */
export function requireN8nBootstrapToken(request: Request): NextResponse | null {
  const bootstrap = process.env.N8N_BOOTSTRAP_TOKEN?.trim();
  const legacy = process.env.N8N_INGEST_TOKEN?.trim();
  if (!bootstrap && !legacy) {
    return jsonError("Internal workflow endpoint is not configured", 503);
  }

  const token = bearerToken(request);
  if (!token) {
    return jsonError("Unauthorized", 401);
  }
  if (bootstrap && constantTimeEqual(token, bootstrap)) return null;
  if (legacy && constantTimeEqual(token, legacy)) return null;

  return jsonError("Unauthorized", 401);
}

/**
 * @deprecated Alias of `requireN8nBootstrapToken`, kept only so existing call sites keep
 * compiling during the n8n auth hardening migration. New code should call
 * `requireN8nBootstrapToken` directly for scheduler/claim endpoints, or `requireN8nJobToken`
 * (optionally via a job-token-first/bootstrap-fallback pattern) for job-scoped callbacks.
 */
export const requireN8nToken = requireN8nBootstrapToken;

/**
 * Guards job-scoped callback endpoints (send-reply, credential reads, result writebacks) with a
 * single-use, short-lived token minted for exactly this `expectedAction` and — when supplied —
 * bound to the matching team/workspace/resource (see `lib/n8n-job-tokens.ts`). Returns `null` on
 * success; an error `NextResponse` on any missing/invalid/expired/mismatched token.
 */
export async function requireN8nJobToken(
  request: Request,
  expectedAction: string,
  bindings?: {
    teamId?: string | null;
    workspaceId?: string | null;
    resourceType?: string | null;
    resourceId?: string | null;
  },
): Promise<NextResponse | null> {
  const token = bearerToken(request);
  if (!token) {
    return jsonError("Unauthorized", 401);
  }

  const { consumeN8nJobToken } = await import("@/lib/n8n-job-tokens");
  const result = await consumeN8nJobToken(token, expectedAction, bindings);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }
  return null;
}

/**
 * Transition-period guard for job-scoped routes: try a scoped job token for `expectedAction`
 * first; if that fails, fall back to the bootstrap/legacy-ingest token and log a warning so the
 * still-broad-trust path is visible in logs until n8n workflows are updated to mint job tokens.
 */
export async function requireN8nJobOrBootstrapToken(
  request: Request,
  expectedAction: string,
  bindings: {
    teamId?: string | null;
    workspaceId?: string | null;
    resourceType?: string | null;
    resourceId?: string | null;
  } | undefined,
  routeLabel: string,
): Promise<NextResponse | null> {
  const jobTokenError = await requireN8nJobToken(request, expectedAction, bindings);
  if (!jobTokenError) return null;

  const bootstrapError = requireN8nBootstrapToken(request);
  if (bootstrapError) return bootstrapError;

  console.warn(
    `[${routeLabel}] accepted legacy bootstrap/ingest token for a '${expectedAction}' call — expected a scoped job token`,
  );
  return null;
}

/**
 * Authorization header the app sends when calling OUT to an n8n webhook (outbound direction —
 * the mirror image of `requireN8nBootstrapToken`/`requireN8nJobToken`, which guard n8n calling
 * IN). Configure n8n's webhook trigger nodes with Header Auth matching `N8N_WEBHOOK_TOKEN`.
 * Returns `{}` (no header) when unset so existing unauthenticated webhooks keep working during
 * rollout.
 */
export function n8nWebhookAuthHeaders(): Record<string, string> {
  const token = process.env.N8N_WEBHOOK_TOKEN?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
