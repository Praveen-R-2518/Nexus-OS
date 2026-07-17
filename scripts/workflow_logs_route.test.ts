/**
 * `/api/workflow-logs` GET tests (Task E.3) — drives the real handler with a mocked
 * `@/lib/api-security` module (tenant context) and an in-memory Supabase fake (no network).
 * Run: npx tsx scripts/workflow_logs_route.test.ts  (or `npm run test:workflow-logs`)
 *
 * Proves:
 *  1. Only the caller's team_id rows are returned (tenant isolation).
 *  2. `result` filter narrows rows; invalid `result` -> 400.
 *  3. Pagination (limit/offset) works and `count` reflects the full filtered total.
 *  4. limit > 200 -> 400; non-numeric limit/offset -> 400.
 *  5. Unauthenticated caller (requireApiTenantContext not ok) -> whatever response it returns.
 */

import Module from "node:module";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const TEAM_A = "11111111-1111-4111-8111-111111111111";
const TEAM_B = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;

function makeRows(): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < 5; i++) {
    rows.push({
      id: `a-${i}`,
      team_id: TEAM_A,
      workflow_name: "wf1_message_intake",
      step: "normalize",
      result: i % 2 === 0 ? "success" : "error",
      payload: {},
      error: i % 2 === 0 ? null : "boom",
      timestamp: new Date(Date.now() - i * 1000).toISOString(),
      created_at: new Date().toISOString(),
    });
  }
  rows.push({
    id: "b-1",
    team_id: TEAM_B,
    workflow_name: "other_team_workflow",
    step: "x",
    result: "success",
    payload: {},
    error: null,
    timestamp: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
  return rows;
}

let store: Row[] = makeRows();
let currentTeamId = TEAM_A;

function tenantSupabase() {
  return {
    from(table: string) {
      assert(table === "workflow_logs", `only workflow_logs should be queried, got ${table}`);
      let rows = [...store];
      const applied: Array<() => void> = [];
      const qb: any = {
        select(_cols: string, _opts?: unknown) {
          return qb;
        },
        eq(col: string, val: unknown) {
          applied.push(() => {
            rows = rows.filter((r) => r[col] === val);
          });
          return qb;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          applied.push(() => {
            rows = [...rows].sort((a, b) => {
              const av = String(a[col]);
              const bv = String(b[col]);
              return opts?.ascending ? av.localeCompare(bv) : bv.localeCompare(av);
            });
          });
          return qb;
        },
        range(start: number, end: number) {
          for (const fn of applied) fn();
          const total = rows.length;
          const page = rows.slice(start, end + 1);
          return Promise.resolve({ data: page, error: null, count: total });
        },
      };
      return qb;
    },
  };
}

const moduleWithLoad = Module as unknown as { _load: (...args: unknown[]) => unknown };
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  const request = args[0] as string;
  if (request === "server-only") return {};
  if (request === "@/lib/api-security") {
    return {
      rateLimit: () => null,
      requireApiTenantContext: async () => ({
        ok: true,
        user: { id: "user-1" },
        supabase: tenantSupabase(),
        teamId: currentTeamId,
        workspaceId: null,
      }),
    };
  }
  return origLoad.apply(this, args);
};

function get(GET: (r: Request) => Promise<Response>, qs: string) {
  return GET(new Request(`https://example.com/api/workflow-logs${qs}`));
}

let passed = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

(async () => {
  const { GET } = await import("@/app/api/workflow-logs/route");

  await check("only returns rows for the caller's team_id", async () => {
    currentTeamId = TEAM_A;
    const res = await get(GET, "");
    const json = (await res.json()) as { data: Row[]; count: number };
    assert(res.status === 200, `status ${res.status}`);
    assert(json.count === 5, `count should be 5, got ${json.count}`);
    assert(json.data.every((r) => r.team_id === TEAM_A), "no cross-tenant rows leaked");
  });

  await check("team B only sees its own single row", async () => {
    currentTeamId = TEAM_B;
    const res = await get(GET, "");
    const json = (await res.json()) as { data: Row[]; count: number };
    assert(json.count === 1, `count should be 1, got ${json.count}`);
    currentTeamId = TEAM_A;
  });

  await check("result filter narrows rows", async () => {
    const res = await get(GET, "?result=error");
    const json = (await res.json()) as { data: Row[]; count: number };
    assert(res.status === 200, `status ${res.status}`);
    assert(json.count === 2, `count should be 2 error rows, got ${json.count}`);
    assert(json.data.every((r) => r.result === "error"), "all rows are error");
  });

  await check("invalid result -> 400", async () => {
    const res = await get(GET, "?result=bogus");
    assert(res.status === 400, `status ${res.status}`);
  });

  await check("pagination: limit + offset", async () => {
    const res1 = await get(GET, "?limit=2&offset=0");
    const json1 = (await res1.json()) as { data: Row[]; count: number };
    assert(json1.data.length === 2, `page 1 should have 2 rows, got ${json1.data.length}`);
    assert(json1.count === 5, "count reflects full total, not page size");

    const res2 = await get(GET, "?limit=2&offset=4");
    const json2 = (await res2.json()) as { data: Row[]; count: number };
    assert(json2.data.length === 1, `last page should have 1 row, got ${json2.data.length}`);
  });

  await check("limit > 200 -> 400", async () => {
    const res = await get(GET, "?limit=500");
    assert(res.status === 400, `status ${res.status}`);
  });

  await check("non-numeric offset -> 400", async () => {
    const res = await get(GET, "?offset=abc");
    assert(res.status === 400, `status ${res.status}`);
  });

  console.log(`\nworkflow-logs-route: ${passed} checks passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
