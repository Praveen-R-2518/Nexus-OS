/**
 * Unit tests for the durable Postgres-backed rate limiter (lib/api-security.ts
 * rateLimitDurable + migration 20260715140000_durable_rate_limit.sql).
 * Run: npx tsx scripts/rate_limit_durable.test.ts  (or `npm run test:rate-limit`)
 *
 * Covers: allowed pass-through, 429 with Retry-After on deny, custom key for
 * per-tenant quotas, and fallback to the in-memory limiter when the RPC fails
 * (fail-closed to *some* limiting, never no limiting).
 */

import Module from "module";

type RpcCall = { name: string; params: Record<string, unknown> };

const rpcCalls: RpcCall[] = [];
let rpcResponse: { data: unknown; error: unknown } = { data: null, error: null };
let rpcThrows = false;

const fakeClient = {
  rpc(name: string, params: Record<string, unknown>) {
    rpcCalls.push({ name, params });
    if (rpcThrows) return Promise.reject(new Error("connection refused"));
    return Promise.resolve(rpcResponse);
  },
};

const moduleWithLoad = Module as unknown as { _load: (...args: unknown[]) => unknown };
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  const request = args[0] as string;
  if (request === "server-only") return {};
  if (request === "@/lib/supabase") {
    return { createServerClient: () => fakeClient, createBrowserClient: () => ({}) };
  }
  if (request === "@/lib/supabase/route-handler") {
    return { createSupabaseRouteHandlerClient: () => ({}) };
  }
  return origLoad.apply(this, args);
};

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

let passed = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

function req(ip?: string): Request {
  return new Request("https://app.test/api/x", {
    headers: ip ? { "x-forwarded-for": ip } : {},
  });
}

(async () => {
  const { rateLimitDurable } = await import("@/lib/api-security");

  await check("allowed=true passes through (null)", async () => {
    rpcResponse = {
      data: { allowed: true, remaining: 4, reset_at: new Date(Date.now() + 60_000).toISOString() },
      error: null,
    };
    const res = await rateLimitDurable(req("1.2.3.4"), "api:test:a", 5, 60_000);
    assert(res === null, "expected null when allowed");
    const call = rpcCalls[rpcCalls.length - 1];
    assert(call.name === "rate_limit_hit", "calls rate_limit_hit RPC");
    assert(call.params.p_key === "api:test:a:1.2.3.4", `IP-derived key, got ${call.params.p_key}`);
    assert(call.params.p_max === 5 && call.params.p_window_ms === 60_000, "passes limit + window");
  });

  await check("allowed=false → 429 with Retry-After", async () => {
    rpcResponse = {
      data: { allowed: false, remaining: 0, reset_at: new Date(Date.now() + 30_000).toISOString() },
      error: null,
    };
    const res = await rateLimitDurable(req("1.2.3.4"), "api:test:b", 5, 60_000);
    assert(res !== null && res.status === 429, "expected 429");
    const retryAfter = Number(res!.headers.get("Retry-After"));
    assert(retryAfter >= 1 && retryAfter <= 31, `Retry-After from reset_at, got ${retryAfter}`);
  });

  await check("custom key replaces client IP (per-tenant quota)", async () => {
    rpcResponse = { data: { allowed: true }, error: null };
    await rateLimitDurable(req("1.2.3.4"), "api:posts:image-daily", 25, 86_400_000, {
      key: "org-123",
    });
    const call = rpcCalls[rpcCalls.length - 1];
    assert(
      call.params.p_key === "api:posts:image-daily:org-123",
      `org-keyed, got ${call.params.p_key}`,
    );
  });

  await check("missing IP falls back to shared __noip__ bucket", async () => {
    rpcResponse = { data: { allowed: true }, error: null };
    await rateLimitDurable(req(), "api:test:noip", 5, 60_000);
    const call = rpcCalls[rpcCalls.length - 1];
    assert(call.params.p_key === "api:test:noip:__noip__", `got ${call.params.p_key}`);
  });

  await check("RPC failure falls back to in-memory limiting (not open)", async () => {
    rpcThrows = true;
    // In-memory limit of 2: first two pass, third is limited — proving the
    // fallback still limits rather than returning null unconditionally.
    const first = await rateLimitDurable(req("9.9.9.9"), "api:test:fallback", 2, 60_000);
    const second = await rateLimitDurable(req("9.9.9.9"), "api:test:fallback", 2, 60_000);
    const third = await rateLimitDurable(req("9.9.9.9"), "api:test:fallback", 2, 60_000);
    assert(first === null && second === null, "first two pass in fallback");
    assert(third !== null && third.status === 429, "third call 429s via in-memory fallback");
    rpcThrows = false;
  });

  console.log(`\nrate_limit_durable: ${passed}/5 checks passed`);
})().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
