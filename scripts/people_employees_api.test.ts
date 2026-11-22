/**
 * Wave 1 B1 — Employee API (mocked tenant + supabase).
 * Run: npx tsx scripts/people_employees_api.test.ts  (or `npm run test:people-employees`)
 *
 * Proves:
 *  1. Create stamps team/workspace from context, never from the body.
 *  2. List is team-scoped.
 *  3. Extra fields (including team_id) are rejected with 400 and no write.
 *  4. PATCH { archived: true } sets archived_at and writes an audit row.
 *  5. Unauthorized → 401; missing tenant → 403.
 *  6. Invalid employment_status → 400; duplicate email → 409; missing id → 404.
 */

import Module from "node:module";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TEAM_ID = "99999999-9999-4999-8999-999999999999";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "user-1";

type Row = Record<string, unknown>;
type AuthMode = "ok" | "unauthorized" | "no_tenant";

const employeesTable: Row[] = [];
const auditEventsTable: Row[] = [];
let authMode: AuthMode = "ok";
let idSeq = 0;

function resetState(): void {
  employeesTable.length = 0;
  auditEventsTable.length = 0;
  authMode = "ok";
  idSeq = 0;
}

function jsonResponse(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function tenantSupabase() {
  return {
    from(table: string) {
      const store =
        table === "employees"
          ? employeesTable
          : table === "audit_events"
            ? auditEventsTable
            : [];
      const filters: Array<(r: Row) => boolean> = [];
      let insertRow: Row | null = null;
      let updatePatch: Row | null = null;
      let wantCount = false;
      let range: { from: number; to: number } | null = null;
      let orderCol = "created_at";
      let orderAsc = false;

      const applyFilters = () => store.filter((r) => filters.every((f) => f(r)));

      const uniqueConflict = (candidate: Row, ignoreId?: unknown) => {
        const email = candidate.email;
        if (typeof email !== "string" || !email) return false;
        const teamId = candidate.team_id;
        const lower = email.toLowerCase();
        return store.some(
          (r) =>
            r.id !== ignoreId &&
            r.team_id === teamId &&
            typeof r.email === "string" &&
            r.email.toLowerCase() === lower &&
            r.archived_at == null,
        );
      };

      const finishInsert = () => {
        if (!insertRow) return { data: null, error: null };
        if (table === "employees" && uniqueConflict(insertRow)) {
          return {
            data: null,
            error: {
              code: "23505",
              message: "employees_team_lower_email_active_uidx",
            },
          };
        }
        const now = new Date().toISOString();
        idSeq += 1;
        const row: Row = {
          id: insertRow.id ?? `${table}-${idSeq}`,
          archived_at: null,
          created_at: now,
          updated_at: now,
          ...insertRow,
        };
        store.push(row);
        return { data: { ...row }, error: null };
      };

      const finishUpdate = () => {
        const hit = store.find((r) => filters.every((f) => f(r)));
        if (!hit || !updatePatch) {
          return {
            data: null,
            error: { code: "PGRST116", message: "not found" },
          };
        }
        const next = { ...hit, ...updatePatch };
        if (table === "employees" && uniqueConflict(next, hit.id)) {
          return {
            data: null,
            error: {
              code: "23505",
              message: "employees_team_lower_email_active_uidx",
            },
          };
        }
        Object.assign(hit, updatePatch, { updated_at: new Date().toISOString() });
        return { data: { ...hit }, error: null };
      };

      const finishSelect = () => {
        let rows = applyFilters();
        rows = [...rows].sort((a, b) => {
          const av = String(a[orderCol] ?? "");
          const bv = String(b[orderCol] ?? "");
          return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        });
        const count = rows.length;
        if (range) rows = rows.slice(range.from, range.to + 1);
        return { data: rows.map((r) => ({ ...r })), error: null, count };
      };

      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select(_cols?: string, opts?: { count?: string }) {
          if (opts?.count === "exact") wantCount = true;
          return chain;
        },
        insert(row: Row) {
          insertRow = { ...row };
          return chain;
        },
        update(patch: Row) {
          updatePatch = { ...patch };
          return chain;
        },
        eq(col: string, val: unknown) {
          filters.push((r) => r[col] === val);
          return chain;
        },
        is(col: string, val: unknown) {
          filters.push((r) => (val === null ? r[col] == null : r[col] === val));
          return chain;
        },
        or(expr: string) {
          const match = expr.match(/%([^%]+)%/);
          const term = (match?.[1] ?? "").replace(/\\/g, "").toLowerCase();
          if (term) {
            filters.push((r) => {
              const name = String(r.full_name ?? "").toLowerCase();
              const email = String(r.email ?? "").toLowerCase();
              return name.includes(term) || email.includes(term);
            });
          }
          return chain;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          orderCol = col;
          orderAsc = opts?.ascending === true;
          return chain;
        },
        range(from: number, to: number) {
          range = { from, to };
          return chain;
        },
        maybeSingle() {
          if (insertRow) return Promise.resolve(finishInsert());
          if (updatePatch) return Promise.resolve(finishUpdate());
          const rows = applyFilters();
          return Promise.resolve({
            data: rows[0] ? { ...rows[0] } : null,
            error: null,
          });
        },
        single() {
          if (insertRow) return Promise.resolve(finishInsert());
          if (updatePatch) return Promise.resolve(finishUpdate());
          const rows = applyFilters();
          if (!rows[0]) {
            return Promise.resolve({
              data: null,
              error: { code: "PGRST116", message: "not found" },
            });
          }
          return Promise.resolve({ data: { ...rows[0] }, error: null });
        },
        then(
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) {
          if (insertRow) {
            return Promise.resolve(finishInsert()).then(resolve, reject);
          }
          if (updatePatch) {
            return Promise.resolve(finishUpdate()).then(resolve, reject);
          }
          return Promise.resolve(finishSelect()).then(resolve, reject);
        },
      });
      return chain;
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
      JSON_LIMITS: { small: 16 * 1024, medium: 64 * 1024, ingest: 256 * 1024 },
      rateLimit: () => null,
      readJsonObjectWithLimit: async (req: Request) => ({
        ok: true,
        body: await req.json(),
      }),
      jsonError: (error: string, status: number) => jsonResponse(error, status),
      requireApiTenantContext: async () => {
        if (authMode === "unauthorized") {
          return { ok: false, response: jsonResponse("Unauthorized", 401) };
        }
        if (authMode === "no_tenant") {
          return {
            ok: false,
            response: jsonResponse("Complete workspace setup", 403),
          };
        }
        return {
          ok: true,
          user: { id: USER_ID },
          supabase: tenantSupabase(),
          teamId: TEAM_ID,
          workspaceId: WORKSPACE_ID,
        };
      },
    };
  }
  return origLoad.apply(this, args);
};

function post(POST: (r: Request) => Promise<Response>, body: Record<string, unknown>) {
  return POST(
    new Request("https://example.com/api/people/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function getList(
  GET: (r: Request) => Promise<Response>,
  search = "",
) {
  return GET(new Request(`https://example.com/api/people/employees${search}`));
}

function getOne(
  GET: (r: Request, ctx: { params: { id: string } }) => Promise<Response>,
  id: string,
) {
  return GET(new Request(`https://example.com/api/people/employees/${id}`), {
    params: { id },
  });
}

function patchOne(
  PATCH: (
    r: Request,
    ctx: { params: { id: string } },
  ) => Promise<Response>,
  id: string,
  body: Record<string, unknown>,
) {
  return PATCH(
    new Request(`https://example.com/api/people/employees/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id } },
  );
}

let passed = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  resetState();
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

(async () => {
  const collection = await import("@/app/api/people/employees/route");
  const item = await import("@/app/api/people/employees/[id]/route");

  await check("create stamps tenant from context, not body", async () => {
    const res = await post(collection.POST, {
      full_name: "Ada Lovelace",
      email: "ada@example.com",
      role_title: "Engineer",
    });
    const json = (await res.json()) as { data: Row; error?: string };
    assert(res.status === 201, `status ${res.status} ${json.error ?? ""}`);
    assert(json.data.full_name === "Ada Lovelace", "name stored");
    assert(json.data.team_id === TEAM_ID, "team_id from context");
    assert(json.data.workspace_id === WORKSPACE_ID, "workspace_id from context");
    assert(json.data.employment_status === "active", "default status active");
    assert(employeesTable.length === 1, "one employee row");
    assert(employeesTable[0].team_id === TEAM_ID, "table team_id from context");
    assert(
      auditEventsTable.some(
        (e) => e.action === "create" && e.entity_type === "employee",
      ),
      "create audited",
    );
  });

  await check("list is team-scoped", async () => {
    const created = await post(collection.POST, {
      full_name: "Ours",
      email: "ours@example.com",
    });
    assert(created.status === 201, "seed own employee");
    employeesTable.push({
      id: "other-1",
      team_id: OTHER_TEAM_ID,
      workspace_id: WORKSPACE_ID,
      full_name: "Other Team",
      email: "other@example.com",
      employment_status: "active",
      archived_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res = await getList(collection.GET);
    const json = (await res.json()) as { data: Row[]; count: number };
    assert(res.status === 200, `status ${res.status}`);
    assert(json.data.length === 1, `expected 1 row, got ${json.data.length}`);
    assert(json.count === 1, "count is 1");
    assert(json.data[0].full_name === "Ours", "only own team row");
    assert(
      json.data.every((row) => row.team_id === TEAM_ID),
      "no foreign team_id",
    );
  });

  await check("rejects extra fields including team_id", async () => {
    const res = await post(collection.POST, {
      full_name: "Injected",
      team_id: OTHER_TEAM_ID,
    });
    const json = (await res.json()) as { error?: string };
    assert(res.status === 400, `status ${res.status}`);
    assert(typeof json.error === "string" && json.error.includes("team_id"), json.error ?? "");
    assert(employeesTable.length === 0, "no write on extra fields");

    const unknown = await post(collection.POST, {
      full_name: "Injected",
      salary: 100000,
    });
    assert(unknown.status === 400, "unknown field rejected");
    assert(employeesTable.length === 0, "no write on unknown field");
  });

  await check("archive via PATCH sets archived_at and is audited", async () => {
    const created = await post(collection.POST, {
      full_name: "To Archive",
      email: "archive@example.com",
    });
    const createdJson = (await created.json()) as { data: Row };
    const id = String(createdJson.data.id);

    const res = await patchOne(item.PATCH, id, { archived: true });
    const json = (await res.json()) as { data: Row; error?: string };
    assert(res.status === 200, `status ${res.status} ${json.error ?? ""}`);
    assert(typeof json.data.archived_at === "string", "archived_at set");
    assert(employeesTable[0].archived_at, "table archived_at set");
    assert(
      auditEventsTable.some(
        (e) =>
          e.action === "archive" &&
          e.entity_type === "employee" &&
          e.entity_id === id,
      ),
      "archive audited",
    );

    const listed = await getList(collection.GET);
    const listedJson = (await listed.json()) as { data: Row[]; count: number };
    assert(listedJson.data.length === 0, "archived excluded from default list");

    const listedAll = await getList(collection.GET, "?include_archived=true");
    const allJson = (await listedAll.json()) as { data: Row[] };
    assert(allJson.data.length === 1, "include_archived returns the row");
  });

  await check("unauthorized returns 401", async () => {
    authMode = "unauthorized";
    const res = await post(collection.POST, { full_name: "Nope" });
    assert(res.status === 401, `status ${res.status}`);
    assert(employeesTable.length === 0, "no write when unauthorized");
  });

  await check("missing tenant returns 403", async () => {
    authMode = "no_tenant";
    const res = await getList(collection.GET);
    assert(res.status === 403, `status ${res.status}`);
  });

  await check("invalid employment_status is rejected", async () => {
    const res = await post(collection.POST, {
      full_name: "Bad Status",
      employment_status: "contractor",
    });
    assert(res.status === 400, `status ${res.status}`);
    assert(employeesTable.length === 0, "no write on invalid status");
  });

  await check("duplicate email returns 409", async () => {
    const first = await post(collection.POST, {
      full_name: "First",
      email: "dup@example.com",
    });
    assert(first.status === 201, "first create ok");
    const second = await post(collection.POST, {
      full_name: "Second",
      email: "DUP@example.com",
    });
    assert(second.status === 409, `status ${second.status}`);
    assert(employeesTable.length === 1, "only one row stored");
  });

  await check("GET missing id returns 404", async () => {
    const res = await getOne(item.GET, "missing-id");
    assert(res.status === 404, `status ${res.status}`);
  });

  console.log(`\npeople-employees-api: ${passed} checks passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
