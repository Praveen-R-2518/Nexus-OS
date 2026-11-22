/**
 * POST /api/internal/n8n/followups/drain — WF4 app-owned drain.
 * Run: npx tsx scripts/followups_drain.test.ts
 */

import Module from "node:module";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const TOKEN = "test-ingest-token";
process.env.N8N_INGEST_TOKEN = TOKEN;

const TEAM = "11111111-1111-4111-8111-111111111111";
const FU = "22222222-2222-4222-8222-222222222222";
const LEAD = "33333333-3333-4333-8333-333333333333";
const CONV = "44444444-4444-4444-8444-444444444444";

type Row = Record<string, unknown>;
const store: Record<string, Row[]> = {
  followups: [
    {
      id: FU,
      team_id: TEAM,
      workspace_id: TEAM,
      status: "pending",
      scheduled_for: "2000-01-01T00:00:00.000Z",
      lead_id: LEAD,
      conversation_id: CONV,
      leads: {
        id: LEAD,
        team_id: TEAM,
        workspace_id: TEAM,
        customer_name: "Ada",
        conversation_id: CONV,
        intent: "purchase_intent",
      },
    },
  ],
  conversations: [{ id: CONV, team_id: TEAM, message: "Can I get a quote?" }],
  reply_drafts: [],
  workflow_logs: [],
};

function matches(row: Row, filters: Array<[string, unknown]>, ops: { in?: Array<[string, unknown[]]>; lte?: Array<[string, string]>; notNull?: string[] }) {
  for (const [c, v] of filters) {
    if (row[c] !== v) return false;
  }
  for (const [c, vals] of ops.in ?? []) {
    if (!vals.includes(row[c] as never)) return false;
  }
  for (const [c, v] of ops.lte ?? []) {
    if (String(row[c]) > v) return false;
  }
  for (const c of ops.notNull ?? []) {
    if (row[c] == null) return false;
  }
  return true;
}

function tableApi(table: string) {
  const rows = () => store[table] ?? (store[table] = []);
  return {
    select() {
      const filters: Array<[string, unknown]> = [];
      const inF: Array<[string, unknown[]]> = [];
      const lteF: Array<[string, string]> = [];
      const notNull: string[] = [];
      const b: Record<string, unknown> = {};
      b.eq = (col: string, val: unknown) => {
        filters.push([col, val]);
        return b;
      };
      b.in = (col: string, vals: unknown[]) => {
        inF.push([col, vals]);
        return b;
      };
      b.lte = (col: string, val: string) => {
        lteF.push([col, val]);
        return b;
      };
      b.not = (col: string, op: string) => {
        if (op === "is") notNull.push(col);
        return b;
      };
      b.order = () => b;
      b.limit = () => Promise.resolve({
        data: rows().filter((r) => matches(r, filters, { in: inF, lte: lteF, notNull })),
        error: null,
      });
      b.maybeSingle = () => {
        const hit = rows().find((r) => matches(r, filters, { in: inF, lte: lteF, notNull }));
        return Promise.resolve({ data: hit ?? null, error: null });
      };
      return b;
    },
    update(patch: Row) {
      const filters: Array<[string, unknown]> = [];
      const inF: Array<[string, unknown[]]> = [];
      const b: Record<string, unknown> = {};
      b.eq = (col: string, val: unknown) => {
        filters.push([col, val]);
        return b;
      };
      b.in = (col: string, vals: unknown[]) => {
        inF.push([col, vals]);
        return b;
      };
      b.then = (resolve: (v: unknown) => void) => {
        for (const r of rows()) {
          if (matches(r, filters, { in: inF })) Object.assign(r, patch);
        }
        resolve({ error: null });
      };
      return b;
    },
    insert(row: Row) {
      rows().push({ id: `${table}-${rows().length + 1}`, ...row });
      return Promise.resolve({ error: null });
    },
  };
}

const fakeClient = {
  from(table: string) {
    return tableApi(table);
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
  if (request === "@/lib/ai/draft") {
    return {
      draftReply: async () => ({
        draft: {
          reply_text: "Hi Ada — circling back on your quote.",
          approval_required: true,
          approval_reason: "follow-up",
          tone: "warm",
          next_step: "send",
          follow_up_needed: false,
          follow_up_delay_minutes: 0,
        },
        model: "mock",
        source: "mock",
      }),
    };
  }
  return origLoad.apply(this, args);
};

async function main() {
  const { POST } = await import("@/app/api/internal/n8n/followups/drain/route");

  const unauthorized = await POST(
    new Request("https://app.test/api/internal/n8n/followups/drain", { method: "POST" }),
  );
  assert(unauthorized.status === 401, "missing token -> 401");

  const ok = await POST(
    new Request("https://app.test/api/internal/n8n/followups/drain", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: "{}",
    }),
  );
  assert(ok.status === 200, `drain -> 200, got ${ok.status} ${await ok.clone().text()}`);
  const body = (await ok.json()) as { success: boolean; processed: number };
  assert(body.success && body.processed === 1, "one follow-up drafted");
  assert(store.reply_drafts.length === 1, "reply_drafts inserted");
  assert(store.followups[0].status === "drafted", "followup marked drafted");

  console.log("followups_drain.test.ts: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
