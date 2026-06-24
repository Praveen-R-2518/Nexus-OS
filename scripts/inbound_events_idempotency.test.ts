/**
 * Durable inbound ingestion + idempotency tests for the Meta webhook.
 * Run: npx tsx scripts/inbound_events_idempotency.test.ts  (or `npm run test:inbound-events`)
 *
 * Proves:
 *  1. The same (platform, external_message_id) delivered twice persists ONE row and the second
 *     delivery returns a {status:"duplicate"} response (durable, not the old in-memory Map).
 *  2. A malformed payload (valid signature, invalid JSON) is rejected with 400.
 *  3. A bad X-Hub-Signature-256 still returns 403.
 *
 * The real route handler is driven end-to-end. `server-only` is stubbed (it throws outside a
 * bundler) and `@/lib/supabase` is replaced with an in-memory fake that faithfully simulates the
 * UNIQUE (platform, external_message_id) index via ON CONFLICT DO NOTHING. The real
 * `lib/inbound-events.ts` helper runs unmodified against that fake.
 */

import Module from "node:module";
import { createHmac } from "node:crypto";

const APP_SECRET = "test-app-secret";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

// --- In-memory Supabase fake (simulates the UNIQUE index) ----------------------------------------
type Row = Record<string, unknown> & { id: string };
const store: Record<string, Row[]> = { inbound_events: [], workflow_logs: [] };
let rowSeq = 0;
let forceError: string | null = null; // flip to simulate a persist failure

function tableRows(name: string): Row[] {
  if (!store[name]) store[name] = [];
  return store[name];
}

const fakeClient = {
  from(table: string) {
    const rows = tableRows(table);
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
      update(patch: Record<string, unknown>) {
        return {
          in(col: string, ids: string[]) {
            for (const r of rows) if (ids.includes(r[col] as string)) Object.assign(r, patch);
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
      insert(row: Record<string, unknown>) {
        rows.push({ id: `row_${++rowSeq}`, ...row });
        return Promise.resolve({ data: null, error: null });
      },
    };
  },
};

// --- Module interception: stub `server-only` and `@/lib/supabase` --------------------------------
const moduleWithLoad = Module as unknown as { _load: (...args: unknown[]) => unknown };
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  const request = args[0] as string;
  if (request === "server-only") return {};
  if (request === "@/lib/supabase") {
    return {
      createServerClient: () => fakeClient,
      createBrowserClient: () => ({}),
    };
  }
  return origLoad.apply(this, args);
};

// Webhook config: app secret set, n8n intentionally unconfigured so forward = "skipped".
process.env.META_APP_SECRET = APP_SECRET;
delete process.env.N8N_WEBHOOK_BASE_URL;

function sign(body: string): string {
  return "sha256=" + createHmac("sha256", APP_SECRET).update(body, "utf8").digest("hex");
}

function post(POST: (r: Request) => Promise<Response>, body: string, signature?: string) {
  return POST(
    new Request("https://example.com/api/meta/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signature ?? sign(body),
      },
      body,
    }),
  );
}

function waPayload(messageId: string) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "0",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "PNID1" },
              messages: [{ id: messageId, from: "15551230000", type: "text", text: { body: "hi" } }],
            },
          },
        ],
      },
    ],
  };
}

(async () => {
  // Unit-level checks on the pure parser (no route needed).
  const parse = await import("@/app/api/meta/webhook/parse");
  assert(parse.verifyMetaSignature("x", null, APP_SECRET) === false, "null signature rejected");
  const body = JSON.stringify(waPayload("wamid.PURE"));
  assert(parse.verifyMetaSignature(body, sign(body), APP_SECRET) === true, "valid signature accepted");
  assert(
    parse.verifyMetaSignature(body, "sha256=deadbeef", APP_SECRET) === false,
    "tampered signature rejected",
  );

  const waMsgs = parse.extractMessages(waPayload("wamid.X"));
  assert(waMsgs.length === 1 && waMsgs[0].platform === "whatsapp" && waMsgs[0].id === "wamid.X", "wa extract");

  const igMsgs = parse.extractMessages({
    object: "instagram",
    entry: [{ id: "1", messaging: [{ message: { mid: "mid.IG" } }] }],
  });
  assert(igMsgs.length === 1 && igMsgs[0].platform === "instagram" && igMsgs[0].id === "mid.IG", "ig extract");

  const fbMsgs = parse.extractMessages({
    object: "page",
    entry: [{ id: "1", messaging: [{ message: { mid: "mid.FB" } }] }],
  });
  assert(fbMsgs.length === 1 && fbMsgs[0].platform === "facebook" && fbMsgs[0].id === "mid.FB", "fb extract");

  assert(parse.extractMessages("garbage").length === 0, "non-object payload extracts nothing");
  assert(parse.extractMessages({ object: "page", entry: [] }).length === 0, "empty entry extracts nothing");

  // Drive the real route handler end-to-end.
  const { POST } = await import("@/app/api/meta/webhook/route");

  // (3) Signature failure → 403.
  const badSig = await post(POST, JSON.stringify(waPayload("wamid.NOPE")), "sha256=deadbeef");
  assert(badSig.status === 403, `bad signature should be 403, got ${badSig.status}`);
  assert(store.inbound_events.length === 0, "rejected-signature event must not persist");

  // (2) Malformed payload (valid signature, invalid JSON) → 400.
  const malformed = "{ not json";
  const bad = await post(POST, malformed, sign(malformed));
  assert(bad.status === 400, `malformed JSON should be 400, got ${bad.status}`);
  assert(store.inbound_events.length === 0, "malformed event must not persist");

  // Valid signature, no message ids (status receipt) → 200 ignored, nothing persisted.
  const ignoredBody = JSON.stringify({ object: "page", entry: [{ id: "1", messaging: [] }] });
  const ignored = await post(POST, ignoredBody);
  assert(ignored.status === 200, `no-message payload should be 200, got ${ignored.status}`);
  assert((await ignored.json()).status === "ignored", "no-message payload status=ignored");
  assert(store.inbound_events.length === 0, "no-message payload must not persist");

  // (1) First delivery of a real message → persisted once, status "received".
  const first = await post(POST, JSON.stringify(waPayload("wamid.DUP")));
  assert(first.status === 200, `first delivery should be 200, got ${first.status}`);
  const firstJson = await first.json();
  assert(firstJson.status === "received" && firstJson.recorded === 1, `first delivery body ${JSON.stringify(firstJson)}`);
  assert(store.inbound_events.length === 1, "first delivery persists exactly one row");
  assert(store.inbound_events[0].platform === "whatsapp", "row platform = whatsapp");
  assert(store.inbound_events[0].external_message_id === "wamid.DUP", "row external_message_id");
  // n8n unconfigured → forward skipped → event left for retry + a workflow_logs breadcrumb.
  assert(store.inbound_events[0].status === "received", "skipped forward leaves status=received for retry");
  assert(store.workflow_logs.length === 1, "skipped forward logs to workflow_logs");

  // (1) Same (platform, message_id) again → ONE row total + duplicate response.
  const second = await post(POST, JSON.stringify(waPayload("wamid.DUP")));
  assert(second.status === 200, `duplicate delivery should be 200, got ${second.status}`);
  assert((await second.json()).status === "duplicate", "second delivery status=duplicate");
  assert(store.inbound_events.length === 1, "duplicate delivery must NOT create a second row");

  // A different message id → a new row.
  const other = await post(POST, JSON.stringify(waPayload("wamid.OTHER")));
  assert(other.status === 200, `new message should be 200, got ${other.status}`);
  assert(store.inbound_events.length === 2, "distinct message id persists a second row");

  // Persist failure → route refuses to ack (503) so the platform redelivers; nothing is dropped.
  forceError = "simulated db down";
  const failed = await post(POST, JSON.stringify(waPayload("wamid.DBFAIL")));
  assert(failed.status === 503, `persist failure should be 503, got ${failed.status}`);
  forceError = null;

  console.log("inbound_events_idempotency.test.ts: all checks passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
