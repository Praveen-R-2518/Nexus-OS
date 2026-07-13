/**
 * Inbound ledger record endpoint tests (Task 3.3) for app/api/internal/n8n/inbound-record.
 * Run: npx tsx scripts/inbound_record.test.ts  (or `npm run test:inbound-record`)
 *
 * Proves Gmail (and any channel) can be routed through the durable inbound_events ledger:
 *  1. A first (gmail, Message-ID) record persists ONE row and returns {inserted:true,duplicate:false}.
 *  2. The same (gmail, Message-ID) again is a no-op returning {duplicate:true} (still one row).
 *  3. A different Message-ID persists a second row.
 *  4. Missing external_message_id -> 400; invalid platform -> 400.
 *  5. Missing/invalid Bearer token -> 401.
 *  6. A simulated persist failure -> 502 (so n8n retries; never a silent drop).
 *
 * The real route + real lib/inbound-events run unmodified. `server-only` is stubbed and
 * `@/lib/supabase` is replaced with an in-memory fake simulating the UNIQUE
 * (platform, external_message_id) index via ON CONFLICT DO NOTHING.
 */

import Module from "node:module";

const TOKEN = "test-ingest-token";
const GMAIL_MSG_ID = "<CAF=abc123@mail.gmail.com>";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

type Row = Record<string, unknown> & { id: string };
const store: Record<string, Row[]> = { inbound_events: [] };
let rowSeq = 0;
let forceError: string | null = null;

const fakeClient = {
  from(table: string) {
    const rows = (store[table] ??= []);
    return {
      upsert(row: Record<string, unknown>, opts: { onConflict: string; ignoreDuplicates?: boolean }) {
        return {
          select(_cols: string) {
            if (forceError) return Promise.resolve({ data: null, error: { message: forceError } });
            const keys = String(opts.onConflict).split(",").map((s) => s.trim());
            const hit = rows.find((r) => keys.every((k) => r[k] === row[k]));
            if (hit) {
              if (opts.ignoreDuplicates) return Promise.resolve({ data: [], error: null });
              Object.assign(hit, row);
              return Promise.resolve({ data: [{ id: hit.id }], error: null });
            }
            const inserted: Row = { id: `evt_${++rowSeq}`, ...row };
            rows.push(inserted);
            return Promise.resolve({ data: [{ id: inserted.id }], error: null });
          },
        };
      },
    };
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

process.env.N8N_INGEST_TOKEN = TOKEN;

function post(
  POST: (r: Request) => Promise<Response>,
  opts: { token?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return POST(
    new Request("https://app.test/api/internal/n8n/inbound-record", {
      method: "POST",
      headers,
      body: JSON.stringify(opts.body ?? {}),
    }),
  );
}

(async () => {
  const { POST } = await import("@/app/api/internal/n8n/inbound-record/route");

  // (5) Auth.
  const noAuth = await post(POST, { body: { platform: "gmail", external_message_id: GMAIL_MSG_ID } });
  assert(noAuth.status === 401, `missing token -> 401, got ${noAuth.status}`);
  const badAuth = await post(POST, { token: "wrong", body: { platform: "gmail", external_message_id: GMAIL_MSG_ID } });
  assert(badAuth.status === 401, `bad token -> 401, got ${badAuth.status}`);
  assert(store.inbound_events.length === 0, "no row persisted for unauthorized calls");

  // (4) Validation.
  const noId = await post(POST, { token: TOKEN, body: { platform: "gmail" } });
  assert(noId.status === 400, `missing external_message_id -> 400, got ${noId.status}`);
  const badPlatform = await post(POST, { token: TOKEN, body: { platform: "sms", external_message_id: "x" } });
  assert(badPlatform.status === 400, `invalid platform -> 400, got ${badPlatform.status}`);
  assert(store.inbound_events.length === 0, "no row persisted for invalid input");

  // (1) First gmail record.
  const first = await post(POST, {
    token: TOKEN,
    body: { platform: "gmail", external_message_id: GMAIL_MSG_ID, subject: "Hello", from: "a@b.com" },
  });
  assert(first.status === 200, `first record -> 200, got ${first.status}`);
  const firstJson = (await first.json()) as Record<string, unknown>;
  assert(firstJson.inserted === true && firstJson.duplicate === false, `first inserted, ${JSON.stringify(firstJson)}`);
  assert(store.inbound_events.length === 1, "one row after first record");
  assert(store.inbound_events[0].platform === "gmail", "row platform gmail");
  assert(store.inbound_events[0].external_message_id === GMAIL_MSG_ID, "row external_message_id");

  // (2) Duplicate is a no-op.
  const dup = await post(POST, {
    token: TOKEN,
    body: { platform: "gmail", external_message_id: GMAIL_MSG_ID },
  });
  assert(dup.status === 200, `duplicate -> 200, got ${dup.status}`);
  const dupJson = (await dup.json()) as Record<string, unknown>;
  assert(dupJson.duplicate === true && dupJson.inserted === false, `duplicate flagged, ${JSON.stringify(dupJson)}`);
  assert(store.inbound_events.length === 1, "duplicate must NOT create a second row");

  // (3) Different Message-ID -> new row.
  const other = await post(POST, {
    token: TOKEN,
    body: { platform: "gmail", external_message_id: "<other@mail.gmail.com>" },
  });
  assert(other.status === 200, `new id -> 200, got ${other.status}`);
  assert(store.inbound_events.length === 2, "distinct Message-ID persists a second row");

  // (6) Persist failure -> 502.
  forceError = "simulated db down";
  const failed = await post(POST, {
    token: TOKEN,
    body: { platform: "gmail", external_message_id: "<dbfail@mail.gmail.com>" },
  });
  assert(failed.status === 502, `persist failure -> 502, got ${failed.status}`);
  forceError = null;

  console.log("inbound_record.test.ts: all checks passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
