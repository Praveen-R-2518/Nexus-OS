import "server-only";

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

type ApiAuthResult =
  | { ok: true; user: User }
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
