/**
 * Ledger drain worker tests (Task 3.2) for app/api/internal/n8n/inbound-replay.
 * Run: npx tsx scripts/inbound_replay.test.ts  (or `npm run test:inbound-replay`)
 *
 * Proves:
 *  1. Stuck events (received/failed, older than N, under the attempt cap) are re-forwarded to n8n;
 *     a successful forward -> status "processing" (+attempt bumped), a failing forward stays
 *     retriable ("received"), and a failure that reaches max_attempts is parked as "failed"
 *     ("replay_exhausted"). Fresh rows and already-processed rows are left untouched.
 *  2. The re-forward carries the resolved `_tenant` block for tenant-stamped rows.
 *  3. When N8N_WEBHOOK_BASE_URL is unset, the sweep reports "skipped" and burns NO attempts.
 *  4. Missing/invalid N8N_INGEST_TOKEN is rejected before any DB work.
 *  5. Stale `processing` rows are reclaimed to `received` (via claim_stuck_inbound_events) BEFORE
 *     the drain scan, so a crashed forward doesn't strand its row forever.
 *
 * The real route + real lib/inbound-events + lib/n8n-intake run unmodified. `server-only` is stubbed
 * and `@/lib/supabase` is replaced with an in-memory fake supporting the query shape the drain uses.
 */

import Module from "node:module";

const TOKEN = "test-ingest-token";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

type Row = Record<string, unknown> & { id: string };

function freshStore(): Record<string, Row[]> {
  const oldTs = new Date(Date.now() - 3_600_000).toISOString(); // 1h ago
  const freshTs = new Date().toISOString();
  return {
    inbound_events: [
      // old received, forward will succeed -> processing
      { id: "e-ok", platform: "whatsapp", status: "received", received_at: oldTs, attempts: 0, team_id: "t-1", workspace_id: "w-1", raw_payload: { mark: "ok" }, error: null },
      // old failed at attempts=4, forward fails -> reaches cap (5) -> failed/exhausted
      { id: "e-exhaust", platform: "instagram", status: "failed", received_at: oldTs, attempts: 4, team_id: "t-2", workspace_id: null, raw_payload: { mark: "fail" }, error: "n8n forward failed" },
      // old received, forward fails but under cap -> stays retriable (received)
      { id: "e-retry", platform: "facebook", status: "received", received_at: oldTs, attempts: 0, team_id: "t-3", workspace_id: "w-3", raw_payload: { mark: "fail" }, error: null },
      // too new -> excluded
      { id: "e-fresh", platform: "whatsapp", status: "received", received_at: freshTs, attempts: 0, team_id: "t-4", workspace_id: "w-4", raw_payload: { mark: "ok" }, error: null },
      // already processed -> excluded
      { id: "e-done", platform: "gmail", status: "processed", received_at: oldTs, attempts: 1, team_id: "t-5", workspace_id: "w-5", raw_payload: { mark: "ok" }, error: null },
      // stuck at processing (crashed mid-forward) -> reclaimed to received, then swept + forwarded
      { id: "e-stuck", platform: "gmail", status: "processing", received_at: oldTs, processing_started_at: oldTs, attempts: 0, team_id: "t-6", workspace_id: "w-6", raw_payload: { mark: "ok" }, error: null },
    ],
  };
}

let store = freshStore();

function makeClient(db: Record<string, Row[]>) {
  return {
    from(table: string) {
      const rows = (db[table] ??= []);
      return {
        select(_cols: string) {
          const inFilters: Array<[string, unknown[]]> = [];
          const ltFilters: Array<[string, unknown]> = [];
          const builder = {
            in(col: string, arr: unknown[]) {
              inFilters.push([col, arr]);
              return builder;
            },
            lt(col: string, val: unknown) {
              ltFilters.push([col, val]);
              return builder;
            },
            order(_col: string, _opts: unknown) {
              return builder;
            },
            limit(n: number) {
              let res = rows.filter(
                (r) =>
                  inFilters.every(([c, a]) => a.includes(r[c])) &&
                  ltFilters.every(([c, v]) => (r[c] as never) < (v as never)),
              );
              res = res
                .slice()
                .sort((a, b) => (String(a.received_at) < String(b.received_at) ? -1 : 1))
                .slice(0, n);
              return Promise.resolve({ data: res.map((r) => ({ ...r })), error: null });
            },
          };
          return builder;
        },
        update(patch: Record<string, unknown>) {
          return {
            eq(col: string, val: unknown) {
              for (const r of rows) if (r[col] === val) Object.assign(r, patch);
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
    rpc(fnName: string, params: Record<string, unknown>) {
      if (fnName === "claim_stuck_inbound_events") {
        const rows = db.inbound_events ?? [];
        const staleMs = (Number(params.p_stale_after_minutes) || 15) * 60_000;
        const cutoff = Date.now() - staleMs;
        const limit = Number(params.p_limit) || 25;
        const claimed: Row[] = [];
        for (const r of rows) {
          if (claimed.length >= limit) break;
          if (r.status !== "processing") continue;
          const ts = (r.processing_started_at ?? r.received_at) as string;
          if (new Date(ts).getTime() >= cutoff) continue;
          if ((Number(r.attempts) || 0) >= 5) continue;
          r.status = "received";
          claimed.push({ ...r });
        }
        return Promise.resolve({ data: claimed, error: null });
      }
      return Promise.resolve({
        data: null,
        error: { message: `unknown rpc ${fnName}` },
      });
    },
  };
}

// --- Module interception ---------------------------------------------------------------------------
const moduleWithLoad = Module as unknown as { _load: (...args: unknown[]) => unknown };
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  const request = args[0] as string;
  if (request === "server-only") return {};
  if (request === "@/lib/supabase") {
    return { createServerClient: () => makeClient(store), createBrowserClient: () => ({}) };
  }
  return origLoad.apply(this, args);
};

// --- n8n forward stub (via global fetch) -----------------------------------------------------------
const forwards: Array<Record<string, unknown>> = [];
(globalThis as { fetch: typeof fetch }).fetch = (async (_url: string, init?: { body?: string }) => {
  const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
  forwards.push(body);
  const mark = (body.mark as string) ?? "ok";
  if (mark === "ok") return new Response(JSON.stringify({ ok: true }), { status: 200 });
  return new Response("boom", { status: 500 });
}) as unknown as typeof fetch;

process.env.N8N_INGEST_TOKEN = TOKEN;
process.env.N8N_WEBHOOK_BASE_URL = "https://n8n.test";

function post(
  POST: (r: Request) => Promise<Response>,
  opts: { token?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const init: RequestInit = { method: "POST", headers };
  if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }
  return POST(new Request("https://app.test/api/internal/n8n/inbound-replay", init));
}

function eventById(id: string): Row {
  const row = store.inbound_events.find((r) => r.id === id);
  if (!row) throw new Error(`row ${id} not found`);
  return row;
}

(async () => {
  const { POST } = await import("@/app/api/internal/n8n/inbound-replay/route");

  // (4) No token -> 401, no DB mutation.
  const noAuth = await post(POST);
  assert(noAuth.status === 401, `missing token should be 401, got ${noAuth.status}`);
  const badAuth = await post(POST, { token: "wrong" });
  assert(badAuth.status === 401, `bad token should be 401, got ${badAuth.status}`);

  // (1)(2)(5) Main sweep with defaults (older_than=10min, max_attempts=5).
  const res = await post(POST, { token: TOKEN });
  assert(res.status === 200, `sweep should be 200, got ${res.status}`);
  const json = (await res.json()) as Record<string, number>;
  assert(json.reclaimed === 1, `reclaimed should be 1 (e-stuck), got ${json.reclaimed}`);
  assert(json.scanned === 4, `scanned should be 4 (excludes fresh + processed), got ${json.scanned}`);
  assert(json.forwarded === 2, `forwarded should be 2 (e-ok + reclaimed e-stuck), got ${json.forwarded}`);
  assert(json.exhausted === 1, `exhausted should be 1, got ${json.exhausted}`);
  assert(json.retriable === 1, `retriable should be 1, got ${json.retriable}`);
  assert(json.skipped === 0, `skipped should be 0, got ${json.skipped}`);

  // Status transitions.
  const ok = eventById("e-ok");
  assert(ok.status === "processing", `e-ok -> processing, got ${ok.status}`);
  assert(ok.attempts === 1, `e-ok attempts -> 1, got ${ok.attempts}`);
  assert(ok.error === null, `e-ok error cleared, got ${ok.error}`);
  assert(typeof ok.last_attempt_at === "string", "e-ok last_attempt_at stamped");

  const exhaust = eventById("e-exhaust");
  assert(exhaust.status === "failed", `e-exhaust -> failed, got ${exhaust.status}`);
  assert(exhaust.attempts === 5, `e-exhaust attempts -> 5, got ${exhaust.attempts}`);
  assert(exhaust.error === "replay_exhausted", `e-exhaust error, got ${exhaust.error}`);

  const retry = eventById("e-retry");
  assert(retry.status === "received", `e-retry stays received, got ${retry.status}`);
  assert(retry.attempts === 1, `e-retry attempts -> 1, got ${retry.attempts}`);
  assert(retry.error === "replay_failed", `e-retry error, got ${retry.error}`);

  // Untouched rows.
  const fresh = eventById("e-fresh");
  assert(fresh.status === "received" && fresh.attempts === 0, "e-fresh untouched (too new)");
  const done = eventById("e-done");
  assert(done.status === "processed" && done.attempts === 1, "e-done untouched (already processed)");

  // (5) Reclaimed row was swept in the SAME pass and forwarded successfully.
  const stuckReclaimed = eventById("e-stuck");
  assert(stuckReclaimed.status === "processing", `e-stuck reclaimed + reforwarded -> processing, got ${stuckReclaimed.status}`);
  assert(stuckReclaimed.attempts === 1, `e-stuck attempts -> 1, got ${stuckReclaimed.attempts}`);

  // (2) _tenant enrichment carried on the forward for the tenant-stamped e-ok row.
  const okForward = forwards.find((f) => f.mark === "ok");
  assert(okForward !== undefined, "an ok forward was sent");
  const tenant = okForward!._tenant as Record<string, unknown> | undefined;
  assert(tenant?.team_id === "t-1", `forward carried _tenant.team_id t-1, got ${JSON.stringify(tenant)}`);
  assert(tenant?.workspace_id === "w-1", `forward carried _tenant.workspace_id w-1`);

  // (3) n8n not configured -> skipped, no attempts burned.
  store = freshStore();
  delete process.env.N8N_WEBHOOK_BASE_URL;
  const skippedRes = await post(POST, { token: TOKEN });
  assert(skippedRes.status === 200, `skipped sweep 200, got ${skippedRes.status}`);
  const skippedJson = (await skippedRes.json()) as Record<string, number>;
  assert(skippedJson.forwarded === 0, `no forwards when n8n unconfigured, got ${skippedJson.forwarded}`);
  assert(skippedJson.skipped >= 1, `skipped should be >=1, got ${skippedJson.skipped}`);
  assert(eventById("e-ok").attempts === 0, "skipped sweep burns no attempts");
  assert(eventById("e-ok").status === "received", "skipped sweep leaves status received");
  process.env.N8N_WEBHOOK_BASE_URL = "https://n8n.test";

  console.log("inbound_replay.test.ts: all checks passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
