/**
 * Unit tests for the generic-mailbox (IMAP) sync worker (lib/mailbox/sync.ts). All transports
 * mocked — no IMAP/n8n network. Run: npx tsx scripts/mailbox_sync.test.ts (or `npm run test:mailbox-sync`).
 *
 * Mirrors scripts/gmail_sync.test.ts: proves persist-before-forward, ledger dedup, per-mailbox error
 * isolation, the 24h first-sync lookback, and the "n8n not configured -> skipped" early return. The
 * credential query filters credential_type='imap' AND imap_host is not null, so it never touches
 * Gmail OAuth rows.
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
  const inboundEvents: Array<Record<string, unknown>> = [];
  let nextEventId = 1;

  const qb = (table: string) => {
    if (table === "inbound_events") {
      return {
        upsert(row: Record<string, unknown>) {
          return {
            select(_cols: string) {
              const key = `${row.platform}:${row.external_message_id}`;
              const existing = inboundEvents.find(
                (e) => `${e.platform}:${e.external_message_id}` === key,
              );
              if (existing) return Promise.resolve({ data: [], error: null });
              const id = `evt-${nextEventId++}`;
              inboundEvents.push({ ...row, id, status: "received" });
              return Promise.resolve({ data: [{ id }], error: null });
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            in(col: string, ids: string[]) {
              if (col === "id") {
                for (const e of inboundEvents) {
                  if (ids.includes(e.id as string)) Object.assign(e, patch);
                }
              }
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    }

    const chain: any = {
      _updateValues: null as Record<string, unknown> | null,
      select() { return chain; },
      update(values: Record<string, unknown>) {
        chain._updateValues = values;
        return chain;
      },
      not() { return chain; },
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
    assert.equal(
      table,
      "gmail_credentials",
      "only gmail_credentials/inbound_events should be touched",
    );
    return chain;
  };
  return { client: { from: qb } as any, updates, inboundEvents };
}

const GOOD_CRED = {
  ok: true,
  credential: {
    id: "cred-1",
    workspaceId: "ws-1",
    teamId: "team-1",
    emailAddress: "founder@zoho.test",
    imap: { host: "imap.zoho.test", port: 993, tls: true, user: "founder@zoho.test", pass: "pw" },
    smtp: { host: "smtp.zoho.test", port: 465, tls: true, user: "founder@zoho.test", pass: "pw" },
  },
};

function messageFixture(messageId: string) {
  return {
    uid: Number(messageId.replace(/\D/g, "")) || 1,
    messageId: `<${messageId}@zoho.test>`,
    subject: "Pricing?",
    from: "Customer <c@x.com>",
    textPlain: "How much is the starter package?",
    references: [] as string[],
    inReplyTo: null,
    date: new Date().toISOString(),
    host: "imap.zoho.test",
  };
}

let passed = 0;
function ok(name: string): void {
  passed += 1;
  console.log(`  ok  ${name}`);
}

async function run() {
  const { runMailboxSync } = await import("../lib/mailbox/sync");

  // 1) No connected mailboxes -> clean empty run
  {
    const { client } = fakeSupabase([]);
    const res = await runMailboxSync({
      createSupabase: () => client,
      resolveCredential: async () => { throw new Error("must not resolve"); },
      fetchMessages: async () => { throw new Error("must not fetch"); },
      forward: async () => { throw new Error("must not forward"); },
      now: () => Date.now(),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.processed, []);
    ok("no mailboxes -> empty run");
  }

  // 2) Happy path: two messages fetched + forwarded, last_synced_at updated
  {
    const { client, updates } = fakeSupabase([
      { id: "cred-1", workspace_id: "ws-1", last_synced_at: "2026-07-14T00:00:00Z" },
    ]);
    let sinceSeen = "";
    const res = await runMailboxSync({
      createSupabase: () => client,
      resolveCredential: async () => GOOD_CRED as any,
      fetchMessages: async (_endpoint, opts) => {
        sinceSeen = opts.sinceIso;
        return [messageFixture("m1"), messageFixture("m2")];
      },
      forward: async () => "forwarded" as const,
      now: () => Date.now(),
    });
    assert.equal(res.status, 200);
    const out = (res.body.processed as any[])[0];
    assert.equal(out.fetched, 2);
    assert.equal(out.forwarded, 2);
    assert.equal(out.error, null);
    assert.equal(sinceSeen, "2026-07-14T00:00:00Z", "must fetch since last_synced_at");
    const synced = updates.find((u) => "last_synced_at" in u.values);
    assert(synced, "must persist last_synced_at");
    assert.equal(synced!.values.last_sync_error, null);
    ok("happy path: fetch + forward + last_synced_at persisted");
  }

  // 3) Never-synced mailbox uses 24h lookback
  {
    const { client } = fakeSupabase([
      { id: "cred-1", workspace_id: "ws-1", last_synced_at: null },
    ]);
    const NOW = Date.now();
    let sinceSeen = "";
    await runMailboxSync({
      createSupabase: () => client,
      resolveCredential: async () => GOOD_CRED as any,
      fetchMessages: async (_e, opts) => {
        sinceSeen = opts.sinceIso;
        return [];
      },
      forward: async () => "forwarded" as const,
      now: () => NOW,
    });
    const delta = NOW - new Date(sinceSeen).getTime();
    assert(Math.abs(delta - 24 * 3600_000) < 5000, `lookback must be ~24h, was ${delta}ms`);
    ok("first sync uses 24h lookback");
  }

  // 4) Credential/endpoint failure isolated per mailbox
  {
    const { client, updates } = fakeSupabase([
      { id: "cred-bad", workspace_id: "ws-bad", last_synced_at: null },
      { id: "cred-good", workspace_id: "ws-good", last_synced_at: "2026-07-14T00:00:00Z" },
    ]);
    const res = await runMailboxSync({
      createSupabase: () => client,
      resolveCredential: async (_s, wsId) =>
        wsId === "ws-bad"
          ? ({ ok: false, error: "decrypt_failed" } as any)
          : (GOOD_CRED as any),
      fetchMessages: async () => [messageFixture("m1")],
      forward: async () => "forwarded" as const,
      now: () => Date.now(),
    });
    const [bad, good] = res.body.processed as any[];
    assert.equal(bad.error, "decrypt_failed");
    assert.equal(good.forwarded, 1);
    assert(updates.some((u) => u.id === "cred-bad" && u.values.last_sync_error === "decrypt_failed"));
    ok("credential failure isolated per mailbox");
  }

  // 5) IMAP throw on one inbox doesn't kill the run
  {
    const { client, updates } = fakeSupabase([
      { id: "cred-1", workspace_id: "ws-1", last_synced_at: null },
    ]);
    const res = await runMailboxSync({
      createSupabase: () => client,
      resolveCredential: async () => GOOD_CRED as any,
      fetchMessages: async () => { throw new Error("imap_auth_failed"); },
      forward: async () => "forwarded" as const,
      now: () => Date.now(),
    });
    assert.equal(res.status, 200);
    assert.equal((res.body.processed as any[])[0].error, "imap_auth_failed");
    assert(updates.some((u) => u.values.last_sync_error === "imap_auth_failed"));
    ok("imap failure recorded, run survives");
  }

  // 6) n8n not configured -> skipped early return
  {
    const { client } = fakeSupabase([
      { id: "cred-1", workspace_id: "ws-1", last_synced_at: null },
    ]);
    const res = await runMailboxSync({
      createSupabase: () => client,
      resolveCredential: async () => GOOD_CRED as any,
      fetchMessages: async () => [messageFixture("m1")],
      forward: async () => "skipped" as const,
      now: () => Date.now(),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.skipped, true);
    ok("n8n unconfigured -> skipped, not crashed");
  }

  // 7) Ledger dedup: same Message-ID not re-forwarded across passes; payload source is 'email'
  {
    const { client, inboundEvents } = fakeSupabase([
      { id: "cred-1", workspace_id: "ws-1", last_synced_at: null },
    ]);
    let forwardCalls = 0;
    let lastChannel = "";
    let lastPayload: any = null;
    const deps = {
      createSupabase: () => client,
      resolveCredential: async () => GOOD_CRED as any,
      fetchMessages: async () => [messageFixture("m1")],
      forward: async (payload: unknown, channel: "gmail" | "meta") => {
        forwardCalls += 1;
        lastChannel = channel;
        lastPayload = payload;
        return "forwarded" as const;
      },
      now: () => Date.now(),
    };
    const res = await runMailboxSync(deps);
    assert.equal(res.status, 200);
    assert.equal(forwardCalls, 1, "first pass forwards once");
    assert.equal(lastChannel, "gmail", "forwards on the gmail n8n branch");
    assert.equal(lastPayload.__source, "email", "payload tagged source email");
    assert.equal(inboundEvents.length, 1, "ledger row persisted");
    assert.equal(inboundEvents[0].platform, "gmail", "ledger recorded under gmail platform");
    assert.equal(inboundEvents[0].status, "processing", "ledger row marked processing after forward");
    assert.equal(inboundEvents[0].workspace_id, "ws-1", "ledger tenant-stamped from credential");
    assert.equal(inboundEvents[0].team_id, "team-1", "ledger tenant-stamped from credential");

    const res2 = await runMailboxSync(deps);
    assert.equal(res2.status, 200);
    assert.equal(forwardCalls, 1, "second pass does not re-forward the same Message-ID");
    ok("ledger dedup prevents double-forward across sync passes");
  }

  console.log(`\nmailbox_sync: ${passed}/7 checks passed`);
}

run().catch((e) => {
  console.error("mailbox_sync.test.ts: failed", e);
  process.exitCode = 1;
});
