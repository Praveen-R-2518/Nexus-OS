/**
 * Wave 1 C1 — Jobs API (mocked tenant + supabase) + scoring weight validation.
 * Run: npx tsx scripts/people_jobs_api.test.ts  (or `npm run test:people-jobs`)
 *
 * Proves:
 *  1. Weight validation (defaults, bad sum, missing/extra keys, negatives).
 *  2. Create stamps team/workspace from context; omitted weights → defaults + version 1.
 *  3. Extra fields (team_id, scoring_weights_version) are rejected with 400.
 *  4. PATCH weights bump scoring_weights_version; identical weights do not.
 *  5. List is team-scoped; archive hides unless include_archived.
 *  6. Invalid status / remote_policy / min > max → 400.
 *  7. Unauthorized → 401; missing tenant → 403; missing id → 404.
 */

import Module from "node:module";
import {
  DEFAULT_SCORING_WEIGHTS,
  sumWeights,
  validateScoringWeights,
  weightsChanged,
} from "@/lib/people/scoring-weights";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TEAM_ID = "99999999-9999-4999-8999-999999999999";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "user-1";

type Row = Record<string, unknown>;
type AuthMode = "ok" | "unauthorized" | "no_tenant";

const jobsTable: Row[] = [];
const auditEventsTable: Row[] = [];
const backgroundJobsTable: Row[] = [];
let authMode: AuthMode = "ok";
let idSeq = 0;

function resetState(): void {
  jobsTable.length = 0;
  auditEventsTable.length = 0;
  backgroundJobsTable.length = 0;
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
        table === "jobs"
          ? jobsTable
          : table === "audit_events"
            ? auditEventsTable
            : table === "background_jobs"
              ? backgroundJobsTable
              : [];
      const filters: Array<(r: Row) => boolean> = [];
      let insertRow: Row | null = null;
      let updatePatch: Row | null = null;
      let inStatuses: string[] | null = null;
      let range: { from: number; to: number } | null = null;
      let orderCol = "created_at";
      let orderAsc = false;

      const applyFilters = () => store.filter((r) => filters.every((f) => f(r)));

      const finishInsert = () => {
        if (!insertRow) return { data: null, error: null };
        if (table === "background_jobs") {
          const key = insertRow.idempotency_key;
          if (
            typeof key === "string" &&
            store.some(
              (r) => r.team_id === insertRow!.team_id && r.idempotency_key === key,
            )
          ) {
            return {
              data: null,
              error: { code: "23505", message: "background_jobs_team_idempotency_uidx" },
            };
          }
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
        if (inStatuses && !inStatuses.includes(String(hit.status))) {
          return {
            data: null,
            error: { code: "PGRST116", message: "status mismatch" },
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
          void opts;
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
        in(col: string, vals: unknown[]) {
          if (col === "status") inStatuses = vals as string[];
          filters.push((r) => vals.includes(r[col]));
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
            filters.push((r) => String(r.title ?? "").toLowerCase().includes(term));
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
    new Request("https://example.com/api/people/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function getList(GET: (r: Request) => Promise<Response>, search = "") {
  return GET(new Request(`https://example.com/api/people/jobs${search}`));
}

function getOne(
  GET: (r: Request, ctx: { params: { id: string } }) => Promise<Response>,
  id: string,
) {
  return GET(new Request(`https://example.com/api/people/jobs/${id}`), {
    params: { id },
  });
}

function patchOne(
  PATCH: (r: Request, ctx: { params: { id: string } }) => Promise<Response>,
  id: string,
  body: Record<string, unknown>,
) {
  return PATCH(
    new Request(`https://example.com/api/people/jobs/${id}`, {
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
  await check("default scoring weights sum to 1.0", async () => {
    const parsed = validateScoringWeights(DEFAULT_SCORING_WEIGHTS);
    assert(parsed.ok, "defaults valid");
    assert(Math.abs(sumWeights(DEFAULT_SCORING_WEIGHTS) - 1) < 1e-9, "sum is 1");
    assert(
      !weightsChanged(DEFAULT_SCORING_WEIGHTS, { ...DEFAULT_SCORING_WEIGHTS }),
      "identical weights are unchanged",
    );
  });

  await check("rejects bad sum, missing key, extra key, negative", async () => {
    const badSum = validateScoringWeights({
      ...DEFAULT_SCORING_WEIGHTS,
      technical_fit: 0.5,
    });
    assert(!badSum.ok, "bad sum rejected");

    const missing = validateScoringWeights({
      technical_fit: 0.4,
      experience_fit: 0.25,
      seniority_fit: 0.15,
      location_fit: 0.05,
      nice_to_have: 0.15,
    });
    assert(!missing.ok && missing.error.includes("Missing"), missing.error);

    const extra = validateScoringWeights({
      ...DEFAULT_SCORING_WEIGHTS,
      bonus: 0.0,
    });
    assert(!extra.ok && extra.error.includes("Unexpected"), extra.error);

    const negative = validateScoringWeights({
      ...DEFAULT_SCORING_WEIGHTS,
      technical_fit: -0.1,
      data_quality: 0.55,
    });
    assert(!negative.ok, "negative rejected");
  });

  const collection = await import("@/app/api/people/jobs/route");
  const item = await import("@/app/api/people/jobs/[id]/route");

  await check("create stamps tenant; omitted weights use defaults v1", async () => {
    const res = await post(collection.POST, { title: "Senior Engineer" });
    const json = (await res.json()) as { data: Row; error?: string };
    assert(res.status === 201, `status ${res.status} ${json.error ?? ""}`);
    assert(json.data.title === "Senior Engineer", "title stored");
    assert(json.data.team_id === TEAM_ID, "team_id from context");
    assert(json.data.workspace_id === WORKSPACE_ID, "workspace_id from context");
    assert(json.data.status === "draft", "default status draft");
    assert(json.data.scoring_weights_version === 1, "version 1");
    assert(
      JSON.stringify(json.data.scoring_weights) ===
        JSON.stringify(DEFAULT_SCORING_WEIGHTS),
      "default weights stored",
    );
    assert(jobsTable.length === 1, "one job row");
    assert(
      auditEventsTable.some((e) => e.action === "create" && e.entity_type === "job"),
      "create audited",
    );
  });

  await check("list is team-scoped", async () => {
    const created = await post(collection.POST, { title: "Ours" });
    assert(created.status === 201, "seed own job");
    jobsTable.push({
      id: "other-1",
      team_id: OTHER_TEAM_ID,
      workspace_id: WORKSPACE_ID,
      title: "Other Team",
      status: "open",
      scoring_weights: DEFAULT_SCORING_WEIGHTS,
      scoring_weights_version: 1,
      archived_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res = await getList(collection.GET);
    const json = (await res.json()) as { data: Row[]; count: number };
    assert(res.status === 200, `status ${res.status}`);
    assert(json.data.length === 1, `expected 1 row, got ${json.data.length}`);
    assert(json.count === 1, "count is 1");
    assert(json.data[0].title === "Ours", "only own team row");
    assert(
      json.data.every((row) => row.team_id === TEAM_ID),
      "no foreign team_id",
    );
  });

  await check("rejects extra fields including team_id and scoring_weights_version", async () => {
    const res = await post(collection.POST, {
      title: "Injected",
      team_id: OTHER_TEAM_ID,
    });
    const json = (await res.json()) as { error?: string };
    assert(res.status === 400, `status ${res.status}`);
    assert(typeof json.error === "string" && json.error.includes("team_id"), json.error ?? "");
    assert(jobsTable.length === 0, "no write on extra fields");

    const version = await post(collection.POST, {
      title: "Injected",
      scoring_weights_version: 99,
    });
    const versionJson = (await version.json()) as { error?: string };
    assert(version.status === 400, "version field rejected");
    assert(
      typeof versionJson.error === "string" &&
        versionJson.error.includes("scoring_weights_version"),
      versionJson.error ?? "",
    );
    assert(jobsTable.length === 0, "no write on version field");
  });

  await check("PATCH weights bump version; identical weights do not", async () => {
    const created = await post(collection.POST, { title: "Weighted" });
    const createdJson = (await created.json()) as { data: Row };
    const id = String(createdJson.data.id);
    assert(createdJson.data.scoring_weights_version === 1, "starts at 1");

    const same = await patchOne(item.PATCH, id, {
      scoring_weights: { ...DEFAULT_SCORING_WEIGHTS },
    });
    const sameJson = (await same.json()) as { data: Row; error?: string };
    assert(same.status === 200, `same status ${same.status} ${sameJson.error ?? ""}`);
    assert(sameJson.data.scoring_weights_version === 1, "identical weights keep v1");

    const nextWeights = {
      ...DEFAULT_SCORING_WEIGHTS,
      technical_fit: 0.35,
      experience_fit: 0.3,
    };
    const changed = await patchOne(item.PATCH, id, {
      scoring_weights: nextWeights,
    });
    const changedJson = (await changed.json()) as { data: Row; error?: string };
    assert(
      changed.status === 200,
      `changed status ${changed.status} ${changedJson.error ?? ""}`,
    );
    assert(changedJson.data.scoring_weights_version === 2, "changed weights bump to v2");
    assert(
      auditEventsTable.some(
        (e) => e.action === "update" && e.entity_type === "job" && e.entity_id === id,
      ),
      "weight change audited",
    );
    assert(backgroundJobsTable.length === 1, "people.match enqueued on weight bump");
    assert(backgroundJobsTable[0].kind === "people.match", "match kind");
    assert(
      (backgroundJobsTable[0].payload as { job_id?: string })?.job_id === id,
      "payload job_id",
    );
  });

  await check("archive via PATCH sets archived_at and is audited", async () => {
    const created = await post(collection.POST, { title: "To Archive" });
    const createdJson = (await created.json()) as { data: Row };
    const id = String(createdJson.data.id);

    const res = await patchOne(item.PATCH, id, { archived: true });
    const json = (await res.json()) as { data: Row; error?: string };
    assert(res.status === 200, `status ${res.status} ${json.error ?? ""}`);
    assert(typeof json.data.archived_at === "string", "archived_at set");
    assert(
      auditEventsTable.some(
        (e) =>
          e.action === "archive" && e.entity_type === "job" && e.entity_id === id,
      ),
      "archive audited",
    );

    const listed = await getList(collection.GET);
    const listedJson = (await listed.json()) as { data: Row[] };
    assert(listedJson.data.length === 0, "archived excluded from default list");

    const listedAll = await getList(collection.GET, "?include_archived=true");
    const allJson = (await listedAll.json()) as { data: Row[] };
    assert(allJson.data.length === 1, "include_archived returns the row");
  });

  await check("unauthorized returns 401", async () => {
    authMode = "unauthorized";
    const res = await post(collection.POST, { title: "Nope" });
    assert(res.status === 401, `status ${res.status}`);
    assert(jobsTable.length === 0, "no write when unauthorized");
  });

  await check("missing tenant returns 403", async () => {
    authMode = "no_tenant";
    const res = await getList(collection.GET);
    assert(res.status === 403, `status ${res.status}`);
  });

  await check("invalid status, remote_policy, and experience range rejected", async () => {
    const status = await post(collection.POST, {
      title: "Bad Status",
      status: "hiring",
    });
    assert(status.status === 400, "invalid status");
    assert(jobsTable.length === 0, "no write on invalid status");

    const remote = await post(collection.POST, {
      title: "Bad Remote",
      remote_policy: "wfh",
    });
    assert(remote.status === 400, "invalid remote_policy");
    assert(jobsTable.length === 0, "no write on invalid remote_policy");

    const range = await post(collection.POST, {
      title: "Bad Range",
      experience_min_years: 8,
      experience_max_years: 3,
    });
    assert(range.status === 400, "min > max rejected");
    assert(jobsTable.length === 0, "no write on invalid range");
  });

  await check("GET missing id returns 404", async () => {
    const res = await getOne(item.GET, "missing-id");
    assert(res.status === 404, `status ${res.status}`);
  });

  console.log(`\npeople-jobs-api: ${passed} checks passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
