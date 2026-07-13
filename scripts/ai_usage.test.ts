/**
 * AI usage recorder endpoint tests (Task 4.4) for app/api/internal/n8n/ai-usage.
 * Run: npx tsx scripts/ai_usage.test.ts  (or `npm run test:ai-usage`)
 *
 * Proves:
 *  1. Valid payload persists one ai_usage row and returns 201.
 *  2. Missing team_id -> 400.
 *  3. Missing workflow_name -> 400.
 *  4. Missing/invalid Bearer token -> 401.
 */

import Module from "node:module";

const TOKEN = "test-ingest-token";
const TEAM_ID = "6d265fe4-97f8-4556-822f-08833303787b";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

type Row = Record<string, unknown> & { id: string };
const store: Record<string, Row[]> = { ai_usage: [], teams: [{ id: TEAM_ID }] };
let rowSeq = 0;

const fakeClient = {
  from(table: string) {
    const rows = (store[table] ??= []);
    return {
      select(_cols: string) {
        return {
          eq(col: string, val: unknown) {
            return {
              maybeSingle() {
                const hit = rows.find((r) => r[col] === val);
                return Promise.resolve({ data: hit ?? null, error: null });
              },
            };
          },
        };
      },
      insert(row: Record<string, unknown>) {
        return {
          select(_cols: string) {
            return {
              single() {
                const inserted: Row = { id: `usage_${++rowSeq}`, ...row };
                rows.push(inserted);
                return Promise.resolve({ data: inserted, error: null });
              },
            };
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
    new Request("https://app.test/api/internal/n8n/ai-usage", {
      method: "POST",
      headers,
      body: JSON.stringify(opts.body ?? {}),
    }),
  );
}

(async () => {
  const { POST } = await import("@/app/api/internal/n8n/ai-usage/route");

  const validBody = {
    team_id: TEAM_ID,
    workflow_name: "WF2",
    model: "gpt-4o",
    input_tokens: 120,
    output_tokens: 45,
  };

  // (4) Auth.
  const noAuth = await post(POST, { body: validBody });
  assert(noAuth.status === 401, `missing token -> 401, got ${noAuth.status}`);
  const badAuth = await post(POST, { token: "wrong", body: validBody });
  assert(badAuth.status === 401, `bad token -> 401, got ${badAuth.status}`);
  assert(store.ai_usage.length === 0, "no row persisted for unauthorized calls");

  // (2) Missing team_id.
  const noTeam = await post(POST, {
    token: TOKEN,
    body: { workflow_name: "WF2", model: "gpt-4o" },
  });
  assert(noTeam.status === 400, `missing team_id -> 400, got ${noTeam.status}`);

  // (3) Missing workflow_name.
  const noWorkflow = await post(POST, {
    token: TOKEN,
    body: { team_id: TEAM_ID, model: "gpt-4o" },
  });
  assert(noWorkflow.status === 400, `missing workflow_name -> 400, got ${noWorkflow.status}`);
  assert(store.ai_usage.length === 0, "no row persisted for invalid input");

  // (1) Valid payload.
  const ok = await post(POST, { token: TOKEN, body: validBody });
  assert(ok.status === 201, `valid payload -> 201, got ${ok.status}`);
  const okJson = (await ok.json()) as Record<string, unknown>;
  assert(okJson.success === true, `success true, ${JSON.stringify(okJson)}`);
  assert(store.ai_usage.length === 1, "one row after valid insert");
  assert(store.ai_usage[0].team_id === TEAM_ID, "row team_id");
  assert(store.ai_usage[0].workflow_name === "WF2", "row workflow_name");
  assert(store.ai_usage[0].input_tokens === 120, "row input_tokens");
  assert(store.ai_usage[0].output_tokens === 45, "row output_tokens");

  console.log("ai_usage.test.ts: all checks passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
