/**
 * Wave 1 D1 — background_jobs queue + People worker skeleton.
 * Run: npx tsx scripts/people_background_jobs.test.ts  (or `npm run test:people-background-jobs`)
 */

import Module from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const moduleWithLoad = Module as unknown as { _load: (...args: unknown[]) => unknown };
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  const request = args[0] as string;
  if (request === "server-only") return {};
  return origLoad.apply(this, args);
};

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

let passed = 0;
function check(name: string, fn: () => void | Promise<void>): void | Promise<void> {
  const run = async () => {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  };
  return run();
}

async function asyncCheck(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "user-1";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const TOKEN = "test-ingest-token";

type Row = Record<string, unknown> & { id: string };

const backgroundJobsTable: Row[] = [];
let idSeq = 0;

function resetJobs(): void {
  backgroundJobsTable.length = 0;
  idSeq = 0;
}

function isClaimable(row: Row): boolean {
  if (row.status === "queued") return true;
  if (row.status !== "running") return false;
  const lockedAt = row.locked_at;
  if (typeof lockedAt !== "string") return false;
  const ageMs = Date.now() - new Date(lockedAt).getTime();
  return ageMs > 120_000;
}

function makeServiceClient() {
  return {
    from(table: string) {
      if (table !== "background_jobs" && table !== "jobs" && table !== "candidates" && table !== "candidate_jobs" && table !== "audit_events") {
        assert(false, `unexpected table ${table}`);
      }
      const store =
        table === "background_jobs"
          ? backgroundJobsTable
          : [];
      const filters: Array<(r: Row) => boolean> = [];
      let insertRow: Row | null = null;
      let updatePatch: Row | null = null;
      let inStatuses: string[] | null = null;

      const applyFilters = () =>
        store.filter((r) => filters.every((f) => f(r)));

      const finishInsert = () => {
        if (!insertRow) return { data: null, error: null };
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
        idSeq += 1;
        const now = new Date().toISOString();
        const row: Row = {
          id: `bg-${idSeq}`,
          status: "queued",
          progress: {},
          attempts: 0,
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
          return { data: null, error: { code: "PGRST116", message: "not found" } };
        }
        if (inStatuses && !inStatuses.includes(String(hit.status))) {
          return { data: null, error: { code: "PGRST116", message: "status mismatch" } };
        }
        Object.assign(hit, updatePatch, { updated_at: new Date().toISOString() });
        return { data: { ...hit }, error: null };
      };

      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select() {
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
        maybeSingle() {
          if (insertRow) return Promise.resolve(finishInsert());
          if (updatePatch) return Promise.resolve(finishUpdate());
          const rows = applyFilters();
          return Promise.resolve({
            data: rows[0] ? { ...rows[0] } : null,
            error: null,
          });
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
          const rows = applyFilters();
          return Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null }).then(
            resolve,
            reject,
          );
        },
      });
      return chain;
    },
    rpc(name: string, params: Record<string, unknown>) {
      if (name !== "claim_background_jobs") {
        return Promise.resolve({ data: null, error: { message: `unknown rpc ${name}` } });
      }
      const limit = Math.max(Number(params.p_limit) || 1, 1);
      const lockedBy = String(params.p_locked_by ?? "people-worker");
      const claimable = backgroundJobsTable
        .filter(isClaimable)
        .sort((a, b) =>
          String(a.created_at).localeCompare(String(b.created_at)),
        )
        .slice(0, limit);
      const now = new Date().toISOString();
      for (const row of claimable) {
        row.status = "running";
        row.locked_at = now;
        row.locked_by = lockedBy;
        row.attempts = (typeof row.attempts === "number" ? row.attempts : 0) + 1;
        row.error = null;
        row.updated_at = now;
      }
      return Promise.resolve({
        data: claimable.map((r) => ({ ...r })),
        error: null,
      });
    },
  };
}

const tenantCtx = {
  supabase: makeServiceClient(),
  teamId: TEAM_ID,
  workspaceId: WORKSPACE_ID,
  user: { id: USER_ID },
};

// --- migration file assertions (no live DB) ---

const migrationsDir = join(process.cwd(), "supabase/migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const bgMigration = migrationFiles.find((f) => f.endsWith("_background_jobs.sql"));

assert(!!bgMigration, "missing *_background_jobs.sql migration");
assert(
  bgMigration! > "20260901130000_people_schema.sql",
  "background_jobs must sort after people_schema",
);

const migrationSql = readFileSync(join(migrationsDir, bgMigration!), "utf8");

check("migration defines background_jobs table and status check", () => {
  assert(/create table if not exists public\.background_jobs/i.test(migrationSql), "table");
  assert(
    /status in \('queued', 'running', 'completed', 'failed', 'cancelled'\)/i.test(
      migrationSql,
    ),
    "status enum",
  );
});

check("migration has idempotency partial unique and claim index", () => {
  assert(
    /background_jobs_team_idempotency_uidx/i.test(migrationSql),
    "idempotency unique",
  );
  assert(/background_jobs_claimable_idx/i.test(migrationSql), "claim index");
});

check("migration enables RLS with current_team_id and revokes anon", () => {
  assert(/enable row level security/i.test(migrationSql), "RLS");
  assert(/private\.current_team_id\(\)/i.test(migrationSql), "current_team_id");
  assert(/revoke all on table public\.background_jobs from anon/i.test(migrationSql), "revoke anon");
});

check("migration defines claim_background_jobs with skip locked and service_role grant", () => {
  assert(/create or replace function public\.claim_background_jobs/i.test(migrationSql), "rpc");
  assert(/for update skip locked/i.test(migrationSql), "skip locked");
  assert(
    /grant execute on function public\.claim_background_jobs\(int, text, int\) to service_role/i.test(
      migrationSql,
    ),
    "service_role grant",
  );
});

// --- service layer ---

(async () => {
  const {
    BACKGROUND_JOB_KINDS,
    MAX_BACKGROUND_JOB_ATTEMPTS,
    cancel,
    claim,
    complete,
    dispatchBackgroundJob,
    enqueue,
    enqueuePeopleMatchJob,
    fail,
    peopleMatchIdempotencyKey,
    runBackgroundJobBatch,
  } = await import("@/lib/people/background-jobs");

  await asyncCheck("enqueue stamps tenant and returns created job", async () => {
    resetJobs();
    const result = await enqueue(tenantCtx, {
      kind: BACKGROUND_JOB_KINDS.peopleMatch,
      payload: { job_id: JOB_ID },
      idempotencyKey: peopleMatchIdempotencyKey(JOB_ID),
    });
    assert(result.ok, "enqueue ok");
    if (!result.ok) return;
    assert(result.data.created, "created");
    assert(result.data.job.teamId === TEAM_ID, "team");
    assert(result.data.job.workspaceId === WORKSPACE_ID, "workspace");
    assert(result.data.job.status === "queued", "queued");
  });

  await asyncCheck("duplicate idempotency key returns existing row", async () => {
    resetJobs();
    const first = await enqueuePeopleMatchJob(tenantCtx, JOB_ID);
    const second = await enqueuePeopleMatchJob(tenantCtx, JOB_ID);
    assert(first.ok && second.ok, "both ok");
    if (!first.ok || !second.ok) return;
    assert(first.data.created, "first created");
    assert(!second.data.created, "second not created");
    assert(first.data.job.id === second.data.job.id, "same id");
    assert(backgroundJobsTable.length === 1, "one row");
  });

  await asyncCheck("dispatch people.match fails closed without job row", async () => {
    resetJobs();
    await enqueuePeopleMatchJob(tenantCtx, JOB_ID);
    const supabase = makeServiceClient();
    const claimed = await claim(supabase);
    assert(claimed.length === 1, "claimed one");
    const outcome = await dispatchBackgroundJob(supabase, claimed[0]);
    assert(outcome.status === "failed", "failed without job");
    assert(outcome.error === "job_not_found", "job_not_found");
    assert(backgroundJobsTable[0].status === "failed", "row failed");
  });


  await asyncCheck("requeues completed people.match with attempts reset", async () => {
    resetJobs();
    const first = await enqueuePeopleMatchJob(tenantCtx, JOB_ID);
    assert(first.ok, "first ok");
    if (!first.ok) return;
    backgroundJobsTable[0].status = "completed";
    backgroundJobsTable[0].attempts = 4;
    backgroundJobsTable[0].progress = { processed: 1 };
    const second = await enqueuePeopleMatchJob(tenantCtx, JOB_ID);
    assert(second.ok, "second ok");
    if (!second.ok) return;
    assert(!second.data.created, "not created");
    assert(second.data.job.id === first.data.job.id, "same id");
    assert(second.data.job.status === "queued", "requeued");
    assert(second.data.job.attempts === 0, "attempts 0");
    assert(backgroundJobsTable.length === 1, "one row");
  });

  await asyncCheck("duplicate enqueue while queued returns existing", async () => {
    resetJobs();
    const first = await enqueuePeopleMatchJob(tenantCtx, JOB_ID);
    const second = await enqueuePeopleMatchJob(tenantCtx, JOB_ID);
    assert(first.ok && second.ok, "both ok");
    if (!first.ok || !second.ok) return;
    assert(first.data.job.status === "queued", "queued");
    assert(second.data.job.id === first.data.job.id, "same id");
    assert(backgroundJobsTable.length === 1, "no duplicate");
  });

  await asyncCheck("unknown kind fails job", async () => {
    resetJobs();
    backgroundJobsTable.push({
      id: "bg-unknown",
      team_id: TEAM_ID,
      workspace_id: WORKSPACE_ID,
      kind: "people.unknown",
      status: "running",
      payload: {},
      progress: {},
      attempts: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const supabase = makeServiceClient();
    const outcome = await dispatchBackgroundJob(supabase, {
      id: "bg-unknown",
      teamId: TEAM_ID,
      workspaceId: WORKSPACE_ID,
      kind: "people.unknown",
      status: "running",
      payload: {},
      progress: {},
      error: null,
      idempotencyKey: null,
      attempts: 1,
      runAfter: new Date().toISOString(),
      lockedAt: new Date().toISOString(),
      lockedBy: "test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    assert(outcome.status === "failed", "failed");
    assert(outcome.error === "unknown_kind", "unknown_kind");
    assert(backgroundJobsTable[0].status === "failed", "row failed");
  });

  await asyncCheck("max attempts exceeded fails without completing", async () => {
    resetJobs();
    const supabase = makeServiceClient();
    const outcome = await dispatchBackgroundJob(supabase, {
      id: "bg-max",
      teamId: TEAM_ID,
      workspaceId: WORKSPACE_ID,
      kind: BACKGROUND_JOB_KINDS.peopleMatch,
      status: "running",
      payload: { job_id: JOB_ID },
      progress: {},
      error: null,
      idempotencyKey: null,
      attempts: MAX_BACKGROUND_JOB_ATTEMPTS + 1,
      runAfter: new Date().toISOString(),
      lockedAt: new Date().toISOString(),
      lockedBy: "test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    assert(outcome.status === "failed", "failed");
    assert(outcome.error === "max_attempts_exceeded", "max attempts");
  });

  await asyncCheck("stale running lock is reclaimable via claim RPC", async () => {
    resetJobs();
    backgroundJobsTable.push({
      id: "bg-stale",
      team_id: TEAM_ID,
      workspace_id: WORKSPACE_ID,
      kind: BACKGROUND_JOB_KINDS.peopleMatch,
      status: "running",
      payload: { job_id: JOB_ID },
      progress: {},
      attempts: 1,
      locked_at: new Date(Date.now() - 300_000).toISOString(),
      locked_by: "old-worker",
      created_at: new Date(Date.now() - 600_000).toISOString(),
      updated_at: new Date(Date.now() - 300_000).toISOString(),
    });
    const supabase = makeServiceClient();
    const claimed = await claim(supabase);
    assert(claimed.length === 1, "reclaimed stale");
    assert(claimed[0].attempts === 2, "attempts incremented");
  });

  await asyncCheck("complete/fail/cancel compare-and-swap on status", async () => {
    resetJobs();
    backgroundJobsTable.push({
      id: "bg-ops",
      team_id: TEAM_ID,
      workspace_id: WORKSPACE_ID,
      kind: BACKGROUND_JOB_KINDS.peopleMatch,
      status: "running",
      payload: { job_id: JOB_ID },
      progress: {},
      attempts: 1,
      locked_at: new Date().toISOString(),
      locked_by: "worker",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const supabase = makeServiceClient();
    assert(await complete(supabase, "bg-ops", { done: true }), "complete");
    assert(backgroundJobsTable[0].status === "completed", "completed status");

    backgroundJobsTable[0].status = "queued";
    assert(await cancel(supabase, "bg-ops"), "cancel queued");
    assert(backgroundJobsTable[0].status === "cancelled", "cancelled");

    backgroundJobsTable[0].status = "running";
    assert(await fail(supabase, "bg-ops", "boom"), "fail running");
    assert(backgroundJobsTable[0].status === "failed", "failed status");
  });

  // --- run route ---

  moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
    const request = args[0] as string;
    if (request === "server-only") return {};
    if (request === "@/lib/supabase") {
      return {
        createServerClient: () => makeServiceClient(),
        createBrowserClient: () => ({}),
      };
    }
    return origLoad.apply(this, args);
  };

  process.env.N8N_INGEST_TOKEN = TOKEN;

  const { POST } = await import("@/app/api/internal/people/jobs/run/route");

  function postRun(opts: { token?: string; body?: unknown } = {}) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    return POST(
      new Request("https://app.test/api/internal/people/jobs/run", {
        method: "POST",
        headers,
        body: JSON.stringify(opts.body ?? {}),
      }),
    );
  }

  await asyncCheck("run route returns 401 without token", async () => {
    resetJobs();
    const res = await postRun();
    assert(res.status === 401, `status ${res.status}`);
  });

  await asyncCheck("run route returns claimed false when queue empty", async () => {
    resetJobs();
    const res = await postRun({ token: TOKEN });
    const json = (await res.json()) as { success?: boolean; claimed?: boolean };
    assert(res.status === 200, `status ${res.status}`);
    assert(json.success === true, "success");
    assert(json.claimed === false, "claimed false");
  });

  await asyncCheck("run route claims people.match job (fails without job row)", async () => {
    resetJobs();
    await enqueuePeopleMatchJob(tenantCtx, JOB_ID);
    const res = await postRun({ token: TOKEN });
    const json = (await res.json()) as {
      success?: boolean;
      claimed?: boolean;
      completed?: number;
      failed?: number;
      jobs?: Array<{ status: string; kind: string; error?: string }>;
    };
    assert(res.status === 200, `status ${res.status}`);
    assert(json.claimed === true, "claimed");
    assert(json.failed === 1, "failed one without job row");
    assert(json.jobs?.[0]?.kind === BACKGROUND_JOB_KINDS.peopleMatch, "kind");
    assert(json.jobs?.[0]?.status === "failed", "failed status");
  });

  await asyncCheck("runBackgroundJobBatch aggregates counts", async () => {
    resetJobs();
    await enqueuePeopleMatchJob(tenantCtx, JOB_ID);
    await enqueuePeopleMatchJob(tenantCtx, "44444444-4444-4444-8444-444444444444");
    const batch = await runBackgroundJobBatch(makeServiceClient(), { limit: 5 });
    assert(batch.claimed === 2, "claimed 2");
    assert(batch.failed === 2, "failed 2 without job rows");
    assert(batch.completed === 0, "completed 0");
  });

  console.log(`\npeople-background-jobs: ${passed} checks passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
