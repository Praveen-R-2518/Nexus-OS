/**
 * `/api/internal/n8n/leads` tests (Task A.3) — drives the real POST handler with a mocked
 * Supabase client (no network).
 * Run: npx tsx scripts/internal_leads.test.ts  (or `npm run test:internal-leads`)
 *
 * Proves:
 *  1. Missing team_id / conversation_id -> 400, nothing inserted.
 *  2. conversation_id that doesn't exist for the claimed team_id -> 409, nothing inserted
 *     (this is the tenant-isolation gap the endpoint closes: a lead can never attach to another
 *     tenant's conversation just because the caller claims a team_id).
 *  3. Happy path: conversation exists for team_id -> 201, lead created with resolved workspace_id.
 *  4. Bad N8N_INGEST_TOKEN -> 401.
 */

import Module from "node:module";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const TOKEN = "test-ingest-token";
process.env.N8N_INGEST_TOKEN = TOKEN;

const TEAM_A = "11111111-1111-4111-8111-111111111111";
const TEAM_B = "22222222-2222-4222-8222-222222222222";
const WS_A = "33333333-3333-4333-8333-333333333333";
const CONV_A = "44444444-4444-4444-8444-444444444444";
const CONV_MISSING = "55555555-5555-4555-8555-555555555555";

type Row = Record<string, unknown>;
const store: Record<string, Row[]> = {
  conversations: [
    { id: CONV_A, team_id: TEAM_A, workspace_id: WS_A },
  ],
  leads: [],
};

function fakeClient() {
  return {
    from(table: string) {
      const rows = store[table] ?? (store[table] = []);
      return {
        select(_cols: string) {
          const filters: Array<[string, unknown]> = [];
          const b = {
            eq(col: string, val: unknown) {
              filters.push([col, val]);
              return b;
            },
            maybeSingle() {
              const hit = rows.find((r) => filters.every(([c, v]) => r[c] === v));
              return Promise.resolve({ data: hit ? { ...hit } : null, error: null });
            },
          };
          return b;
        },
        insert(row: Row) {
          return {
            select(_cols: string) {
              return {
                single() {
                  const id = `lead-${rows.length + 1}`;
                  const inserted = { id, ...row };
                  rows.push(inserted);
                  return Promise.resolve({ data: { ...inserted }, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
}

const moduleWithLoad = Module as unknown as { _load: (...args: unknown[]) => unknown };
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  const request = args[0] as string;
  if (request === "server-only") return {};
  if (request === "@/lib/supabase") {
    return { createServerClient: () => fakeClient(), createBrowserClient: () => ({}) };
  }
  return origLoad.apply(this, args);
};

function post(
  POST: (r: Request) => Promise<Response>,
  body: Record<string, unknown>,
  token: string = TOKEN,
) {
  return POST(
    new Request("https://example.com/api/internal/n8n/leads", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  );
}

let passed = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

(async () => {
  const { POST } = await import("@/app/api/internal/n8n/leads/route");

  await check("missing team_id -> 400", async () => {
    const res = await post(POST, { conversation_id: CONV_A });
    assert(res.status === 400, `status ${res.status}`);
  });

  await check("missing conversation_id -> 400", async () => {
    const res = await post(POST, { team_id: TEAM_A });
    assert(res.status === 400, `status ${res.status}`);
  });

  await check("conversation not found for team -> 409, no cross-tenant leak", async () => {
    const before = store.leads.length;
    const res = await post(POST, { team_id: TEAM_A, conversation_id: CONV_MISSING });
    assert(res.status === 409, `status ${res.status}`);
    assert(store.leads.length === before, "no lead inserted");
  });

  await check("conversation belongs to a different team -> 409, no cross-tenant leak", async () => {
    const before = store.leads.length;
    const res = await post(POST, { team_id: TEAM_B, conversation_id: CONV_A });
    assert(res.status === 409, `status ${res.status}`);
    assert(store.leads.length === before, "no lead inserted");
  });

  await check("happy path -> 201, lead created with resolved workspace_id", async () => {
    const res = await post(POST, {
      team_id: TEAM_A,
      conversation_id: CONV_A,
      customer_name: "Jane Doe",
      customer_email: "jane@example.com",
      intent: "purchase_intent",
      urgency: "high",
      estimated_value: 500,
      risk_type: "none",
      risk_score: 0.1,
      confidence: 0.92,
      recommended_action: "request_approval",
    });
    const json = (await res.json()) as { success: boolean; data: Record<string, unknown> };
    assert(res.status === 201, `status ${res.status}`);
    assert(json.success === true, "success true");
    assert(json.data.team_id === TEAM_A, "team_id stamped");
    assert(json.data.workspace_id === WS_A, "workspace_id resolved from conversation");
    assert(json.data.conversation_id === CONV_A, "conversation_id stamped");
    assert(json.data.intent === "purchase_intent", "intent passed through");
    assert(json.data.next_action === "request_approval", "next_action mapped from recommended_action");
  });

  await check("bad token -> 401", async () => {
    const res = await post(POST, { team_id: TEAM_A, conversation_id: CONV_A }, "wrong");
    assert(res.status === 401, `status ${res.status}`);
  });

  console.log(`\ninternal-leads: ${passed} checks passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
