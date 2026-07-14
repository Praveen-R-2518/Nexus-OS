/**
 * Unit tests for the continuous Gmail sync worker
 * (app/api/internal/n8n/gmail-sync/handler.ts). All transports mocked.
 * Run: npx tsx scripts/gmail_sync.test.ts  (or `npm run test:gmail-sync`)
 */

import { strict as assert } from "node:assert";
import Module from "node:module";

const moduleWithLoad = Module as unknown as { _load: (...args: unknown[]) => unknown };
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  const request = String(args[0] ?? "");
  if (request === "server-only" || request.endsWith("server-only")) return {};
  return origLoad.apply(this, args);
};

type CredRow = { id: string; workspace_id: string; last_synced_at: string | null };

function fakeSupabase(rows: CredRow[], selectError: string | null = null) {
  const updates: Array<{ id: string; values: Record<string, unknown> }> = [];
  const qb = (table: string) => {
    const chain: any = {
      _updateValues: null as Record<string, unknown> | null,
      select() { return chain; },
      update(values: Record<string, unknown>) {
        chain._updateValues = values;
        return chain;
      },
      order() { return chain; },
      limit() {
        return Promise.resolve(
          selectError ? { data: null, error: { message: selectError } } : { data: rows, error: null },
        );
      },
      eq(col: string, val: string) {
        if (chain._updateValues && col === "id") {
          updates.push({ id: val, values: chain._updateValues });
          return Promise.resolve({ error: null });
        }
        return chain;
      },
    };
    assert.equal(table, "gmail_credentials", "only gmail_credentials should be touched");
    return chain;
  };
  return { client: { from: qb } as any, updates };
}

const GOOD_CRED = {
  ok: true,
  credential: {
    id: "cred-1",
    workspaceId: "ws-1",
    teamId: "team-1",
    emailAddress: "founder@example.com",
    accessToken: "at",
    tokenExpiry: new Date(Date.now() + 3600_000).toISOString(),
  },
};

const MESSAGE = {
  id: "m1",
  threadId: "t1",
  internalDate: String(Date.now()),
  payload: {
    headers: [
      { name: "Subject", value: "Pricing?" },
      { name: "From", value: "Customer <c@x.com>" },
      { name: "Message-ID", value: "<m1@x.com>" },
    ],
    mimeType: "text/plain",
    body: { data: Buffer.from("How much is the starter package?").toString("base64url") },
  },
};

let passed = 0;
function ok(name: string): void {
  passed += 1;
  console.log(`  ok  ${name}`);
}

async function run() {
  const { runGmailSync } = await import("../app/api/internal/n8n/gmail-sync/handler");

  // 1) No sync-enabled credentials -> clean empty run
  {
    const { client } = fakeSupabase([]);
    const res = await runGmailSync({
      createSupabase: () => client,
      resolveCredential: async () => { throw new Error("must not resolve"); },
      listMessages: async () => { throw new Error("must not list"); },
      fetchMessage: async () => { throw new Error("must not fetch"); },
      forward: async () => { throw new Error("must not forward"); },
      now: () => Date.now(),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.processed, []);
    ok("no credentials -> empty run");
  }

  // 2) Happy path: two new messages fetched + forwarded, last_synced_at updated
  {
    const { client, updates } = fakeSupabase([
      { id: "cred-1", workspace_id: "ws-1", last_synced_at: "2026-07-14T00:00:00Z" },
    ]);
    let listedAfter = "";
    const res = await runGmailSync({
      createSupabase: () => client,
      resolveCredential: async () => GOOD_CRED as any,
      listMessages: async (_t, input) => {
        listedAfter = input.afterDate;
        return { messageIds: ["m1", "m2"], nextPageToken: null };
      },
      fetchMessage: async () => MESSAGE as any,
      forward: async () => "forwarded" as const,
      now: () => Date.now(),
    });
    assert.equal(res.status, 200);
    const out = (res.body.processed as any[])[0];
    assert.equal(out.fetched, 2);
    assert.equal(out.forwarded, 2);
    assert.equal(out.error, null);
    assert.equal(listedAfter, "2026-07-14T00:00:00Z", "must list since last_synced_at");
    const synced = updates.find((u) => "last_synced_at" in u.values);
    assert(synced, "must persist last_synced_at");
    assert.equal(synced!.values.last_sync_error, null);
    ok("happy path: fetch + forward + last_synced_at persisted");
  }

  // 3) Never-synced credential uses the 24h lookback, not epoch
  {
    const { client } = fakeSupabase([
      { id: "cred-1", workspace_id: "ws-1", last_synced_at: null },
    ]);
    const NOW = Date.now();
    let listedAfter = "";
    await runGmailSync({
      createSupabase: () => client,
      resolveCredential: async () => GOOD_CRED as any,
      listMessages: async (_t, input) => {
        listedAfter = input.afterDate;
        return { messageIds: [], nextPageToken: null };
      },
      fetchMessage: async () => null,
      forward: async () => "forwarded" as const,
      now: () => NOW,
    });
    const delta = NOW - new Date(listedAfter).getTime();
    assert(Math.abs(delta - 24 * 3600_000) < 5000, `lookback must be ~24h, was ${delta}ms`);
    ok("first sync uses 24h lookback");
  }

  // 4) Credential failure records last_sync_error and continues to next workspace
  {
    const { client, updates } = fakeSupabase([
      { id: "cred-bad", workspace_id: "ws-bad", last_synced_at: null },
      { id: "cred-good", workspace_id: "ws-good", last_synced_at: "2026-07-14T00:00:00Z" },
    ]);
    const res = await runGmailSync({
      createSupabase: () => client,
      resolveCredential: async (_s, wsId) =>
        wsId === "ws-bad" ? ({ ok: false, error: "refresh_failed" } as any) : (GOOD_CRED as any),
      listMessages: async () => ({ messageIds: ["m1"], nextPageToken: null }),
      fetchMessage: async () => MESSAGE as any,
      forward: async () => "forwarded" as const,
      now: () => Date.now(),
    });
    const [bad, good] = res.body.processed as any[];
    assert.equal(bad.error, "refresh_failed");
    assert.equal(good.forwarded, 1);
    assert(updates.some((u) => u.id === "cred-bad" && u.values.last_sync_error === "refresh_failed"));
    ok("credential failure isolated per workspace");
  }

  // 5) Gmail rate limit on one inbox doesn't kill the run
  {
    const { client, updates } = fakeSupabase([
      { id: "cred-1", workspace_id: "ws-1", last_synced_at: null },
    ]);
    const res = await runGmailSync({
      createSupabase: () => client,
      resolveCredential: async () => GOOD_CRED as any,
      listMessages: async () => { throw new Error("gmail_rate_limited"); },
      fetchMessage: async () => null,
      forward: async () => "forwarded" as const,
      now: () => Date.now(),
    });
    assert.equal(res.status, 200);
    assert.equal((res.body.processed as any[])[0].error, "gmail_rate_limited");
    assert(updates.some((u) => u.values.last_sync_error === "gmail_rate_limited"));
    ok("rate limit recorded, run survives");
  }

  // 6) n8n not configured -> early skipped return, no crash
  {
    const { client } = fakeSupabase([
      { id: "cred-1", workspace_id: "ws-1", last_synced_at: null },
    ]);
    const res = await runGmailSync({
      createSupabase: () => client,
      resolveCredential: async () => GOOD_CRED as any,
      listMessages: async () => ({ messageIds: ["m1"], nextPageToken: null }),
      fetchMessage: async () => MESSAGE as any,
      forward: async () => "skipped" as const,
      now: () => Date.now(),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.skipped, true);
    ok("n8n unconfigured -> skipped, not crashed");
  }

  console.log(`\ngmail_sync: ${passed}/6 checks passed`);
}

run().catch((e) => {
  console.error("gmail_sync.test.ts: failed", e);
  process.exitCode = 1;
});
