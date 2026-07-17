/**
 * Unit tests for lib/n8n-job-tokens.ts (n8n auth hardening).
 * Run: npx tsx scripts/n8n_job_tokens.test.ts  (or `npm run test:n8n-job-tokens`)
 *
 * Mocks `@/lib/supabase` with an in-memory RPC store that mirrors the SQL semantics of
 * `public.issue_n8n_job_token` / `public.consume_n8n_job_token`
 * (supabase/migrations/20260717131000_n8n_job_token_rpcs.sql): single-use (`used_at`),
 * expiry, action match, and optional team/workspace/resource binding match. This proves the
 * hashing + parameter-building in lib/n8n-job-tokens.ts against the exact contract the real
 * Postgres functions implement, without needing a live database.
 *
 * Covers:
 *  1. issue -> consume round-trip returns matching claims.
 *  2. A token can only be consumed once (second attempt fails closed).
 *  3. Wrong action -> rejected.
 *  4. Mismatched binding (team_id) -> rejected.
 *  5. Binding omitted by the caller is not checked (bulk/legacy callers stay unaffected).
 *  6. Expired token -> rejected.
 *  7. Empty/missing raw token -> rejected without hitting the RPC at all.
 *  8. An RPC-level throw (e.g. missing `.rpc` in a stripped-down fake client) fails closed
 *     instead of throwing, so callers can safely fall back to bootstrap-token auth.
 *  9. hashToken is deterministic and content-sensitive (pure function, no I/O).
 */

import Module from "node:module";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

type TokenRow = {
  id: string;
  token_hash: string;
  action: string;
  team_id: string | null;
  workspace_id: string | null;
  organization_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  expires_at: string;
  used_at: string | null;
};

let rows: TokenRow[] = [];
let rowSeq = 0;
let rpcShouldThrow = false;

function fakeIssue(params: Record<string, unknown>): { data: unknown; error: unknown } {
  const id = `tok_${++rowSeq}`;
  const expiresAt = (params.p_expires_at as string) ?? new Date(Date.now() + 900_000).toISOString();
  rows.push({
    id,
    token_hash: String(params.p_token_hash),
    action: String(params.p_action),
    team_id: (params.p_team_id as string | null) ?? null,
    workspace_id: (params.p_workspace_id as string | null) ?? null,
    organization_id: (params.p_organization_id as string | null) ?? null,
    resource_type: (params.p_resource_type as string | null) ?? null,
    resource_id: (params.p_resource_id as string | null) ?? null,
    expires_at: expiresAt,
    used_at: null,
  });
  return { data: { id, expires_at: expiresAt }, error: null };
}

function fakeConsume(params: Record<string, unknown>): { data: unknown; error: unknown } {
  const now = Date.now();
  const row = rows.find(
    (r) =>
      r.token_hash === String(params.p_token_hash) &&
      r.used_at === null &&
      new Date(r.expires_at).getTime() > now &&
      r.action === String(params.p_action) &&
      (params.p_team_id == null || r.team_id === params.p_team_id) &&
      (params.p_workspace_id == null || r.workspace_id === params.p_workspace_id) &&
      (params.p_resource_type == null || r.resource_type === params.p_resource_type) &&
      (params.p_resource_id == null || r.resource_id === params.p_resource_id),
  );
  if (!row) return { data: { ok: false }, error: null };

  row.used_at = new Date(now).toISOString();
  return {
    data: {
      ok: true,
      id: row.id,
      action: row.action,
      team_id: row.team_id,
      workspace_id: row.workspace_id,
      organization_id: row.organization_id,
      resource_type: row.resource_type,
      resource_id: row.resource_id,
      expires_at: row.expires_at,
    },
    error: null,
  };
}

const fakeClient = {
  rpc(name: string, params: Record<string, unknown>) {
    if (rpcShouldThrow) return Promise.reject(new Error("connection refused"));
    if (name === "issue_n8n_job_token") return Promise.resolve(fakeIssue(params));
    if (name === "consume_n8n_job_token") return Promise.resolve(fakeConsume(params));
    return Promise.resolve({ data: null, error: { message: `unknown rpc ${name}` } });
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
  return origLoad.apply(this, args);
};

const TEAM = "11111111-1111-4111-8111-111111111111";
const OTHER_TEAM = "99999999-9999-4999-8999-999999999999";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const DRAFT = "33333333-3333-4333-8333-333333333333";

let passed = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  rows = [];
  rowSeq = 0;
  rpcShouldThrow = false;
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

(async () => {
  const { hashToken, issueN8nJobToken, consumeN8nJobToken } = await import(
    "@/lib/n8n-job-tokens"
  );

  await check("hashToken is deterministic and content-sensitive", async () => {
    const a = hashToken("secret-1");
    const b = hashToken("secret-1");
    const c = hashToken("secret-2");
    assert(a.equals(b), "same input -> same hash");
    assert(!a.equals(c), "different input -> different hash");
    assert(a.length === 32, "sha256 digest is 32 bytes");
  });

  await check("issue -> consume round-trip returns matching claims", async () => {
    const { token, expiresAt } = await issueN8nJobToken({
      action: "send_reply",
      teamId: TEAM,
      workspaceId: WORKSPACE,
      resourceType: "draft",
      resourceId: DRAFT,
    });
    assert(typeof token === "string" && token.length > 0, "returns a plaintext token");
    assert(typeof expiresAt === "string", "returns an expiry");

    const result = await consumeN8nJobToken(token, "send_reply", {
      teamId: TEAM,
      resourceType: "draft",
      resourceId: DRAFT,
    });
    assert(result.ok === true, `expected ok, got ${JSON.stringify(result)}`);
    if (result.ok) {
      assert(result.claims.teamId === TEAM, "claims.teamId matches");
      assert(result.claims.workspaceId === WORKSPACE, "claims.workspaceId matches");
      assert(result.claims.resourceId === DRAFT, "claims.resourceId matches");
    }
  });

  await check("a token can only be consumed once", async () => {
    const { token } = await issueN8nJobToken({ action: "send_reply", teamId: TEAM });
    const first = await consumeN8nJobToken(token, "send_reply", { teamId: TEAM });
    assert(first.ok === true, "first consume succeeds");
    const second = await consumeN8nJobToken(token, "send_reply", { teamId: TEAM });
    assert(second.ok === false && second.status === 401, "second consume fails closed");
  });

  await check("wrong action is rejected", async () => {
    const { token } = await issueN8nJobToken({ action: "send_reply", teamId: TEAM });
    const result = await consumeN8nJobToken(token, "autopilot_send", { teamId: TEAM });
    assert(result.ok === false && result.status === 401, "action mismatch -> 401");
  });

  await check("mismatched team binding is rejected", async () => {
    const { token } = await issueN8nJobToken({ action: "send_reply", teamId: TEAM });
    const result = await consumeN8nJobToken(token, "send_reply", { teamId: OTHER_TEAM });
    assert(result.ok === false && result.status === 401, "team mismatch -> 401");
  });

  await check("omitted binding is not checked", async () => {
    const { token } = await issueN8nJobToken({
      action: "match_embeddings",
      teamId: TEAM,
    });
    // Caller doesn't pass teamId at all (e.g. a route that only cares about the action) —
    // must still succeed since the binding wasn't requested.
    const result = await consumeN8nJobToken(token, "match_embeddings");
    assert(result.ok === true, "no bindings requested -> action match alone succeeds");
  });

  await check("expired token is rejected", async () => {
    const { token } = await issueN8nJobToken({ action: "send_reply", teamId: TEAM, ttlSeconds: 1 });
    // Directly backdate the fake row's expiry rather than sleeping in the test.
    rows[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const result = await consumeN8nJobToken(token, "send_reply", { teamId: TEAM });
    assert(result.ok === false && result.status === 401, "expired -> 401");
  });

  await check("empty/missing raw token is rejected without an RPC round-trip", async () => {
    let rpcCalls = 0;
    const originalRpc = fakeClient.rpc;
    fakeClient.rpc = ((name: string, params: Record<string, unknown>) => {
      rpcCalls += 1;
      return originalRpc(name, params);
    }) as typeof fakeClient.rpc;
    try {
      const result = await consumeN8nJobToken("", "send_reply");
      assert(result.ok === false && result.status === 401, "empty token -> 401");
      assert(rpcCalls === 0, "no RPC call made for an empty token");
    } finally {
      fakeClient.rpc = originalRpc;
    }
  });

  await check("RPC failure fails closed instead of throwing", async () => {
    const { token } = await issueN8nJobToken({ action: "send_reply", teamId: TEAM });
    rpcShouldThrow = true;
    const result = await consumeN8nJobToken(token, "send_reply", { teamId: TEAM });
    assert(result.ok === false && result.status === 401, "RPC throw -> 401, not an exception");
  });

  console.log(`\nn8n_job_tokens: ${passed}/9 checks passed`);
})().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
