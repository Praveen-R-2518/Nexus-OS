/**
 * POST /api/internal/n8n/daily-report — WF5 app-owned report builder.
 * Run: npx tsx scripts/daily_report_route.test.ts
 */

import Module from "node:module";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const TOKEN = "test-ingest-token";
process.env.N8N_INGEST_TOKEN = TOKEN;
const TEAM = "11111111-1111-4111-8111-111111111111";

type Row = Record<string, unknown>;
const store: Record<string, Row[]> = {
  business_profiles: [{ team_id: TEAM, workspace_id: TEAM, name: "Acme" }],
  conversations: [{ id: "c1", team_id: TEAM, received_at: new Date().toISOString() }],
  leads: [
    { id: "l1", team_id: TEAM, urgency: "high", status: "new", risk_type: "none", estimated_value: 100 },
  ],
  reply_drafts: [],
  followups: [],
  daily_reports: [],
  workflow_logs: [],
};

function countApi(table: string) {
  const rows = store[table] ?? [];
  const filters: Array<(r: Row) => boolean> = [];
  const b: Record<string, unknown> = {};
  b.eq = (col: string, val: unknown) => {
    filters.push((r) => r[col] === val);
    return b;
  };
  b.in = (col: string, vals: unknown[]) => {
    filters.push((r) => vals.includes(r[col] as never));
    return b;
  };
  b.neq = (col: string, val: unknown) => {
    filters.push((r) => r[col] !== val);
    return b;
  };
  b.gte = (col: string, val: string) => {
    filters.push((r) => String(r[col] ?? "") >= val);
    return b;
  };
  b.not = (col: string, op: string) => {
    if (op === "is") filters.push((r) => r[col] != null);
    return b;
  };
  const run = () => rows.filter((r) => filters.every((f) => f(r)));
  b.then = (resolve: (v: unknown) => void) => {
    const data = run();
    resolve({ data, count: data.length, error: null });
  };
  return b;
}

const fakeClient = {
  from(table: string) {
    return {
      select(_cols: string, opts?: { count?: string; head?: boolean }) {
        const api = countApi(table);
        if (opts?.head && table !== "business_profiles") return api;
        if (table === "business_profiles") {
          return api;
        }
        if (table === "leads" && _cols === "estimated_value") return api;
        return api;
      },
      upsert(row: Row) {
        store.daily_reports.push({ id: "r1", ...row });
        return Promise.resolve({ error: null });
      },
      insert(row: Row) {
        (store[table] ?? (store[table] = [])).push(row);
        return Promise.resolve({ error: null });
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
  if (request === "@/lib/ai/report-summary") {
    return {
      summarizeReport: async () => ({ summary: "Brief for Acme.", source: "fallback" }),
    };
  }
  return origLoad.apply(this, args);
};

async function main() {
  const { POST } = await import("@/app/api/internal/n8n/daily-report/route");

  const unauthorized = await POST(
    new Request("https://app.test/api/internal/n8n/daily-report", { method: "POST" }),
  );
  assert(unauthorized.status === 401, "missing token -> 401");

  const ok = await POST(
    new Request("https://app.test/api/internal/n8n/daily-report", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}` },
    }),
  );
  assert(ok.status === 200, `report -> 200, got ${ok.status} ${await ok.clone().text()}`);
  const body = (await ok.json()) as { success: boolean; saved: number };
  assert(body.success && body.saved === 1, "one tenant report saved");
  assert(store.daily_reports.length === 1, "daily_reports upserted");

  console.log("daily_report_route.test.ts: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
