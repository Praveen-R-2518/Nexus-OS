/**
 * Wave 1 B4 — Employee CSV import/export (mocked tenant + supabase).
 * Run: npx tsx scripts/people_employees_csv.test.ts  (or `npm run test:people-employees-csv`)
 *
 * Proves:
 *  1. Preview returns suggested mapping and does not write.
 *  2. Existing email is upserted (updated); new email is imported.
 *  3. Over 500 rows → 400 and no writes.
 *  4. Over 1 MB → 413.
 *  5. Partial success: one bad row fails, others persist.
 *  6. Export omits archived + other-team rows; formula cells escaped.
 *  7. Unauthorized → 401; missing tenant → 403.
 */

import Module from "node:module";
import { CSV_IMPORT_MAX_ROWS } from "@/lib/csv";

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
        select(_cols?: string, _opts?: { count?: string }) {
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
      JSON_LIMITS: {
        small: 16 * 1024,
        medium: 64 * 1024,
        ingest: 256 * 1024,
        csv: 1_000_000 + 64 * 1024,
      },
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

function postJson(
  POST: (r: Request) => Promise<Response>,
  url: string,
  body: Record<string, unknown>,
) {
  return POST(
    new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

let passed = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  resetState();
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

function seedEmployee(partial: Row): Row {
  const now = new Date().toISOString();
  idSeq += 1;
  const row: Row = {
    id: partial.id ?? `employees-${idSeq}`,
    team_id: TEAM_ID,
    workspace_id: WORKSPACE_ID,
    full_name: "Seed",
    email: null,
    phone: null,
    role_title: null,
    employment_status: "active",
    started_on: null,
    ended_on: null,
    location: null,
    notes: null,
    archived_at: null,
    created_at: now,
    updated_at: now,
    ...partial,
  };
  employeesTable.push(row);
  return row;
}

(async () => {
  const preview = await import(
    "@/app/api/people/employees/import/preview/route"
  );
  const commit = await import("@/app/api/people/employees/import/route");
  const exported = await import("@/app/api/people/employees/export/route");

  const previewUrl = "https://example.com/api/people/employees/import/preview";
  const importUrl = "https://example.com/api/people/employees/import";
  const exportUrl = "https://example.com/api/people/employees/export";

  await check("preview returns suggested mapping and does not write", async () => {
    const res = await postJson(preview.POST, previewUrl, {
      csv: "Full Name,E-mail,Job Title\nAda Lovelace,ada@example.com,Engineer\n",
    });
    const json = (await res.json()) as {
      ok?: boolean;
      mapping?: Record<string, string>;
      summary?: { imported: number };
      error?: string;
    };
    assert(res.status === 200, `status ${res.status} ${json.error ?? ""}`);
    assert(json.ok === true, "ok");
    assert(json.mapping?.["Full Name"] === "full_name", "mapped name");
    assert(json.mapping?.["E-mail"] === "email", "mapped email");
    assert(json.mapping?.["Job Title"] === "role_title", "mapped role");
    assert(json.summary?.imported === 1, "preview counts import");
    assert(employeesTable.length === 0, "preview must not write employees");
    assert(auditEventsTable.length === 0, "preview must not write audit");
  });

  await check("existing email is updated; new email is imported", async () => {
    seedEmployee({
      full_name: "Ada",
      email: "ada@example.com",
      role_title: "Analyst",
    });
    const res = await postJson(commit.POST, importUrl, {
      csv:
        "full_name,email,role_title\n" +
        "Ada Lovelace,ADA@example.com,Mathematician\n" +
        "Grace Hopper,grace@example.com,Admiral\n",
    });
    const json = (await res.json()) as {
      ok?: boolean;
      summary?: { imported: number; updated: number; failed: number };
      message?: string;
      error?: string;
    };
    assert(res.status === 200, `status ${res.status} ${json.error ?? ""}`);
    assert(json.summary?.updated === 1, `updated ${json.summary?.updated}`);
    assert(json.summary?.imported === 1, `imported ${json.summary?.imported}`);
    assert(json.summary?.failed === 0, "no failures");
    assert(
      json.message === "1 imported / 1 updated / 0 duplicates / 0 failed",
      `message ${json.message}`,
    );

    const ada = employeesTable.find(
      (r) =>
        typeof r.email === "string" && r.email.toLowerCase() === "ada@example.com",
    );
    const grace = employeesTable.find(
      (r) =>
        typeof r.email === "string" &&
        r.email.toLowerCase() === "grace@example.com",
    );
    assert(ada?.full_name === "Ada Lovelace", "ada name updated");
    assert(ada?.role_title === "Mathematician", "ada role updated");
    assert(grace?.full_name === "Grace Hopper", "grace inserted");
    assert(employeesTable.filter((r) => r.team_id === TEAM_ID).length === 2, "two roster rows");
    assert(
      auditEventsTable.some(
        (e) => e.action === "import" && e.entity_type === "employee_csv",
      ),
      "import summary audited",
    );
    const importAudit = auditEventsTable.find(
      (e) => e.action === "import" && e.entity_type === "employee_csv",
    );
    const meta = (importAudit?.metadata ?? {}) as Record<string, unknown>;
    assert(meta.imported === 1 && meta.updated === 1, "audit counts only");
    assert(!("email" in meta), "no email in import audit metadata");
  });

  await check("over-cap CSV is rejected with no writes", async () => {
    const lines = ["full_name,email"];
    for (let i = 0; i < CSV_IMPORT_MAX_ROWS + 1; i += 1) {
      lines.push(`Person ${i},p${i}@example.com`);
    }
    const res = await postJson(commit.POST, importUrl, { csv: `${lines.join("\n")}\n` });
    const json = (await res.json()) as { error?: string };
    assert(res.status === 400, `status ${res.status}`);
    assert(/row limit/i.test(json.error ?? ""), `error ${json.error}`);
    assert(employeesTable.length === 0, "no writes over cap");
  });

  await check("over 1 MB CSV returns 413", async () => {
    const csv = `full_name,notes\nAda,${"n".repeat(1_000_000)}\n`;
    const res = await postJson(commit.POST, importUrl, { csv });
    const json = (await res.json()) as { error?: string };
    assert(res.status === 413, `status ${res.status}`);
    assert(/1 MB/i.test(json.error ?? ""), `error ${json.error}`);
    assert(employeesTable.length === 0, "no writes over size");
  });

  await check("partial success keeps good rows and reports the failed row", async () => {
    const res = await postJson(commit.POST, importUrl, {
      csv:
        "full_name,email\n" +
        "Ada Lovelace,ada@example.com\n" +
        ",missing@example.com\n" +
        "Grace Hopper,grace@example.com\n",
    });
    const json = (await res.json()) as {
      summary?: { imported: number; failed: number };
      errors?: Array<{ row: number; message: string }>;
      error?: string;
    };
    assert(res.status === 200, `status ${res.status} ${json.error ?? ""}`);
    assert(json.summary?.imported === 2, `imported ${json.summary?.imported}`);
    assert(json.summary?.failed === 1, `failed ${json.summary?.failed}`);
    assert(
      json.errors?.some((e) => e.row === 3),
      "row 3 in errors",
    );
    assert(employeesTable.length === 2, "two employees stored");
  });

  await check("export omits archived and other-team rows; formula cells escaped", async () => {
    seedEmployee({
      full_name: "Ada Lovelace",
      email: "ada@example.com",
      notes: "=CMD",
    });
    seedEmployee({
      full_name: "Archived One",
      email: "arch@example.com",
      archived_at: new Date().toISOString(),
    });
    seedEmployee({
      id: "other-1",
      team_id: OTHER_TEAM_ID,
      full_name: "Other Team",
      email: "other@example.com",
    });

    const res = await exported.GET(new Request(exportUrl));
    assert(res.status === 200, `status ${res.status}`);
    assert(
      (res.headers.get("content-type") ?? "").includes("text/csv"),
      "csv content type",
    );
    const text = await res.text();
    assert(text.includes("full_name,email"), "header");
    assert(text.includes("Ada Lovelace"), "includes active");
    assert(text.includes(`"'=CMD"`), `formula escaped, got ${text}`);
    assert(!text.includes("Archived One"), "omits archived");
    assert(!text.includes("Other Team"), "omits other team");
  });

  await check("unauthorized import returns 401", async () => {
    authMode = "unauthorized";
    const res = await postJson(commit.POST, importUrl, {
      csv: "full_name,email\nAda Lovelace,ada@example.com\n",
    });
    assert(res.status === 401, `status ${res.status}`);
    assert(employeesTable.length === 0, "no write when unauthorized");
  });

  await check("missing tenant export returns 403", async () => {
    authMode = "no_tenant";
    const res = await exported.GET(new Request(exportUrl));
    assert(res.status === 403, `status ${res.status}`);
  });

  await check("import rejects client team_id", async () => {
    const res = await postJson(commit.POST, importUrl, {
      csv: "full_name,email\nAda Lovelace,ada@example.com\n",
      team_id: OTHER_TEAM_ID,
    });
    assert(res.status === 400, `status ${res.status}`);
    assert(employeesTable.length === 0, "no write on extra fields");
  });

  console.log(`\npeople-employees-csv: ${passed} checks passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
