/**
 * Wave 1 D3 + D4 — people.match worker scores and explains candidate_jobs.
 * Run: npx tsx scripts/people_match_worker.test.ts  (or `npm run test:people-match-worker`)
 */

import Module from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

process.env.AI_PROVIDER = "mock";
delete process.env.OPENAI_API_KEY;

import { DEFAULT_SCORING_WEIGHTS } from "@/lib/people/scoring-weights";
import { SCORING_VERSION } from "@/lib/people/score";
import { PEOPLE_MATCH_EXPLAIN_PROMPT_VERSION } from "@/lib/people/match-explanation";

const moduleWithLoad = Module as unknown as { _load: (...args: unknown[]) => unknown };
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  if ((args[0] as string) === "server-only") return {};
  return origLoad.apply(this, args);
};

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TEAM_ID = "99999999-9999-4999-8999-999999999999";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const CANDIDATE_ID = "44444444-4444-4444-8444-444444444444";
const CANDIDATE_JOB_ID = "55555555-5555-4555-8555-555555555555";
const BG_JOB_ID = "66666666-6666-4666-8666-666666666666";

type Row = Record<string, unknown> & { id: string };

const tables: Record<string, Row[]> = {
  background_jobs: [],
  jobs: [],
  candidates: [],
  candidate_jobs: [],
  audit_events: [],
  embeddings: [],
};

function resetTables(): void {
  for (const key of Object.keys(tables)) {
    tables[key].length = 0;
  }
}

function seedJob(overrides: Partial<Row> = {}): Row {
  const row: Row = {
    id: JOB_ID,
    team_id: TEAM_ID,
    workspace_id: WORKSPACE_ID,
    title: "Engineer",
    description: null,
    status: "open",
    required_skills: ["TypeScript", "React"],
    preferred_skills: ["Node.js"],
    experience_min_years: 3,
    experience_max_years: 8,
    seniority: "senior",
    location: "San Francisco",
    remote_policy: "onsite",
    scoring_weights: { ...DEFAULT_SCORING_WEIGHTS },
    scoring_weights_version: 1,
    archived_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  tables.jobs.push(row);
  return row;
}

function seedCandidate(overrides: Partial<Row> = {}): Row {
  const row: Row = {
    id: CANDIDATE_ID,
    team_id: TEAM_ID,
    workspace_id: WORKSPACE_ID,
    full_name: "Alex Dev",
    email: "alex@example.com",
    phone: null,
    headline: "Full-stack engineer",
    current_role: "Senior Software Engineer",
    experience_years: 5,
    skills: ["TypeScript", "React", "Node.js"],
    location: "San Francisco, CA",
    source: "csv",
    source_url: null,
    source_metadata: {},
    consent_status: "owner_imported",
    notes: null,
    archived_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  tables.candidates.push(row);
  return row;
}

function seedCandidateJob(overrides: Partial<Row> = {}): Row {
  const row: Row = {
    id: CANDIDATE_JOB_ID,
    team_id: TEAM_ID,
    workspace_id: WORKSPACE_ID,
    candidate_id: CANDIDATE_ID,
    job_id: JOB_ID,
    stage: "new",
    match_score: null,
    match_components: null,
    match_weights_used: null,
    scoring_version: null,
    data_quality: "pending",
    insufficient_reason: null,
    ai_explanation: { summary: "old" },
    ai_model: "gpt-old",
    ai_prompt_version: "v0",
    manual_rank_override: null,
    assigned_to: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  tables.candidate_jobs.push(row);
  return row;
}

function seedBackgroundJob(overrides: Partial<Row> = {}): Row {
  const row: Row = {
    id: BG_JOB_ID,
    team_id: TEAM_ID,
    workspace_id: WORKSPACE_ID,
    kind: "people.match",
    status: "running",
    payload: { job_id: JOB_ID },
    progress: {},
    error: null,
    idempotency_key: `people.match:${JOB_ID}`,
    attempts: 1,
    run_after: new Date().toISOString(),
    locked_at: new Date().toISOString(),
    locked_by: "people-worker",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  tables.background_jobs.push(row);
  return row;
}

function makeServiceClient() {
  return {
    from(table: string) {
      if (!tables[table]) tables[table] = [];
      const store = tables[table];
      const filters: Array<(r: Row) => boolean> = [];
      let insertRow: Row | null = null;
      let updatePatch: Row | null = null;
      let inStatuses: string[] | null = null;
      let inIds: unknown[] | null = null;
      let orderCol: string | null = null;
      let orderAsc = true;
      let rangeFrom: number | null = null;
      let rangeTo: number | null = null;
      let isSingle = false;
      let isDelete = false;

      const applyFilters = () => store.filter((r) => filters.every((f) => f(r)));

      const finishInsert = () => {
        if (!insertRow) return { data: null, error: null };
        const row: Row = {
          id: insertRow.id ?? `${table}-${store.length + 1}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...insertRow,
        };
        store.push(row);
        return { data: { ...row }, error: null };
      };

      const finishUpdate = () => {
        const hits = store.filter((r) => filters.every((f) => f(r)));
        const hit = hits[0];
        if (!hit || !updatePatch) {
          return { data: null, error: { code: "PGRST116", message: "not found" } };
        }
        if (inStatuses && !inStatuses.includes(String(hit.status))) {
          return { data: null, error: { code: "PGRST116", message: "status mismatch" } };
        }
        Object.assign(hit, updatePatch, { updated_at: new Date().toISOString() });
        return { data: { ...hit }, error: null };
      };

      const finishDelete = () => {
        for (let i = store.length - 1; i >= 0; i -= 1) {
          if (filters.every((f) => f(store[i]))) store.splice(i, 1);
        }
        return { data: null, error: null };
      };

      const finishSelect = () => {
        let rows = applyFilters();
        if (inIds) {
          rows = rows.filter((r) => inIds!.includes(r.id));
        }
        if (orderCol) {
          rows = [...rows].sort((a, b) => {
            const av = String(a[orderCol!] ?? "");
            const bv = String(b[orderCol!] ?? "");
            const cmp = av.localeCompare(bv);
            return orderAsc ? cmp : -cmp;
          });
        }
        if (rangeFrom !== null && rangeTo !== null) {
          rows = rows.slice(rangeFrom, rangeTo + 1);
        }
        if (isSingle) {
          return Promise.resolve({
            data: rows[0] ? { ...rows[0] } : null,
            error: null,
          });
        }
        return Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null });
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
        delete() {
          isDelete = true;
          return chain;
        },
        eq(col: string, val: unknown) {
          filters.push((r) => r[col] === val);
          return chain;
        },
        gte(col: string, val: unknown) {
          filters.push((r) => String(r[col] ?? "") >= String(val));
          return chain;
        },
        limit() {
          return chain;
        },
        in(col: string, vals: unknown[]) {
          if (col === "status") inStatuses = vals as string[];
          if (col === "id") inIds = vals;
          filters.push((r) => vals.includes(r[col]));
          return chain;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          orderCol = col;
          orderAsc = opts?.ascending !== false;
          return chain;
        },
        range(from: number, to: number) {
          rangeFrom = from;
          rangeTo = to;
          return chain;
        },
        maybeSingle() {
          isSingle = true;
          if (isDelete) return Promise.resolve(finishDelete());
          if (insertRow) return Promise.resolve(finishInsert());
          if (updatePatch) return Promise.resolve(finishUpdate());
          return finishSelect();
        },
        single() {
          isSingle = true;
          if (isDelete) return Promise.resolve(finishDelete());
          if (insertRow) return Promise.resolve(finishInsert());
          if (updatePatch) return Promise.resolve(finishUpdate());
          return finishSelect();
        },
        then(
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) {
          if (isDelete) {
            return Promise.resolve(finishDelete()).then(resolve, reject);
          }
          if (insertRow) {
            return Promise.resolve(finishInsert()).then(resolve, reject);
          }
          if (updatePatch) {
            return Promise.resolve(finishUpdate()).then(resolve, reject);
          }
          return finishSelect().then(resolve, reject);
        },
      });
      return chain;
    },
    rpc() {
      return Promise.resolve({ data: [], error: null });
    },
  };
}

function backgroundJobFromRow(row: Row) {
  return {
    id: String(row.id),
    teamId: String(row.team_id),
    workspaceId: (row.workspace_id as string | null) ?? null,
    kind: String(row.kind),
    status: row.status as "running",
    payload: row.payload as Record<string, unknown>,
    progress: (row.progress as Record<string, unknown>) ?? {},
    error: (row.error as string | null) ?? null,
    idempotencyKey: (row.idempotency_key as string | null) ?? null,
    attempts: typeof row.attempts === "number" ? row.attempts : 0,
    runAfter: String(row.run_after),
    lockedAt: (row.locked_at as string | null) ?? null,
    lockedBy: (row.locked_by as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const migrationsDir = join(process.cwd(), "supabase/migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const scoringVersionMigration = migrationFiles.find((f) =>
  f.endsWith("_candidate_jobs_scoring_version_text.sql"),
);

assert(!!scoringVersionMigration, "missing candidate_jobs scoring_version migration");
assert(
  scoringVersionMigration! > "20260902140000_background_jobs.sql",
  "scoring_version migration must sort after background_jobs",
);

const scoringVersionSql = readFileSync(
  join(migrationsDir, scoringVersionMigration!),
  "utf8",
);

(async () => {
  check("migration alters scoring_version to text", () => {
    assert(
      /alter column scoring_version type text/i.test(scoringVersionSql),
      "alter type text",
    );
  });

  const { handlePeopleMatch, MATCH_BATCH_SIZE } = await import(
    "@/lib/people/match-worker"
  );
  const {
    enqueuePeopleMatchJob,
    dispatchBackgroundJob,
  } = await import("@/lib/people/background-jobs");
  const { writeSystemAuditEvent } = await import("@/lib/audit");

  assert(MATCH_BATCH_SIZE === 100, "MATCH_BATCH_SIZE is 100");

  const tenantCtx = {
    supabase: makeServiceClient() as never,
    teamId: TEAM_ID,
    workspaceId: WORKSPACE_ID,
    user: { id: "user-1" },
  };

  await check("handlePeopleMatch fails closed when job row missing", async () => {
    resetTables();
    seedBackgroundJob();
    const supabase = makeServiceClient();
    const outcome = await handlePeopleMatch(
      supabase as never,
      backgroundJobFromRow(tables.background_jobs[0]),
    );
    assert(outcome.status === "failed", "failed");
    assert(outcome.error === "job_not_found", "job_not_found");
    assert(tables.background_jobs[0].status === "failed", "bg failed");
  });

  await check("handlePeopleMatch scores candidate_jobs and fills mock ai explanation", async () => {
    resetTables();
    seedJob();
    seedCandidate();
    seedCandidateJob();
    seedBackgroundJob();
    const supabase = makeServiceClient();
    const outcome = await handlePeopleMatch(
      supabase as never,
      backgroundJobFromRow(tables.background_jobs[0]),
    );
    assert(outcome.status === "completed", `completed ${outcome.error ?? ""}`);
    const cj = tables.candidate_jobs[0];
    assert(cj.stage === "new", "stage unchanged");
    assert(typeof cj.match_score === "number", "match_score set");
    assert(Array.isArray(cj.match_components), "components set");
    assert(cj.scoring_version === SCORING_VERSION, "scoring_version");
    assert(cj.data_quality === "sufficient", "data_quality sufficient");
    const weightsUsed = cj.match_weights_used as {
      weights: typeof DEFAULT_SCORING_WEIGHTS;
      weights_version: number;
    };
    assert(weightsUsed.weights_version === 1, "weights_version");
    assert(weightsUsed.weights.technical_fit === DEFAULT_SCORING_WEIGHTS.technical_fit, "weights");
    const explanation = cj.ai_explanation as { summary?: string; recommendation?: string };
    assert(typeof explanation.summary === "string", "ai_explanation summary");
    assert(typeof explanation.recommendation === "string", "ai_explanation recommendation");
    assert(cj.ai_model === "gpt-4o-mini", "ai_model set");
    assert(cj.ai_prompt_version === PEOPLE_MATCH_EXPLAIN_PROMPT_VERSION, "ai_prompt_version");
    const progress = tables.background_jobs[0].progress as Record<string, unknown>;
    assert((cj.match_components as unknown[]).length === 6, "six components");
    assert(progress.processed === 1, "progress processed");
    assert(progress.scored === 1, "progress scored");
    assert(progress.insufficient === 0, "progress insufficient");
    assert(progress.skipped === 0, "progress skipped");
    assert(progress.explained === 1, "progress explained");
    assert(progress.scoring_version === SCORING_VERSION, "progress scoring_version");
    assert(progress.scoring_weights_version === 1, "progress weights version");
    const peopleEmbeds = tables.embeddings.filter((r) => r.kind === "people_summary");
    assert(peopleEmbeds.length > 0, "people_summary embedding written");
    const embedText = String(peopleEmbeds[peopleEmbeds.length - 1].content);
    assert(embedText.includes("Alex Dev"), "embed includes candidate name");
    assert(!embedText.includes("alex@example.com"), "embed omits email");
  });

  await check("handlePeopleMatch still scores when People AI budget is exceeded", async () => {
    resetTables();
    seedJob();
    seedCandidate();
    seedCandidateJob();
    seedBackgroundJob();
    tables.business_profiles = [
      {
        id: "bp-1",
        team_id: TEAM_ID,
        ai_monthly_token_budget: 10,
      },
    ];
    tables.ai_usage = [
      {
        id: "usage-1",
        team_id: TEAM_ID,
        input_tokens: 8,
        output_tokens: 4,
        created_at: new Date().toISOString(),
      },
    ];
    const supabase = makeServiceClient();
    const outcome = await handlePeopleMatch(
      supabase as never,
      backgroundJobFromRow(tables.background_jobs[0]),
    );
    assert(outcome.status === "completed", `completed ${outcome.error ?? ""}`);
    const cj = tables.candidate_jobs[0];
    assert(typeof cj.match_score === "number", "match_score set");
    assert(cj.data_quality === "sufficient", "scores persisted");
    assert(
      cj.ai_explanation == null,
      "budget skip must not write an explanation error onto the scored row",
    );
    const progress = tables.background_jobs[0].progress as Record<string, unknown>;
    assert(progress.scored === 1, "scored");
    assert(progress.explained === 0, "explain skipped");
    assert(progress.explain_skipped === 1, "explain_skipped counted");
  });

  await check("handlePeopleMatch writes insufficient with null score", async () => {
    resetTables();
    seedJob({ required_skills: ["Rust"], experience_min_years: 5 });
    seedCandidate({
      skills: [],
      experience_years: null,
      current_role: null,
      headline: null,
    });
    seedCandidateJob();
    seedBackgroundJob();
    const supabase = makeServiceClient();
    const outcome = await handlePeopleMatch(
      supabase as never,
      backgroundJobFromRow(tables.background_jobs[0]),
    );
    assert(outcome.status === "completed", "completed");
    const cj = tables.candidate_jobs[0];
    assert(cj.match_score === null, "null score");
    assert(cj.data_quality === "insufficient", "insufficient");
    assert(typeof cj.insufficient_reason === "string", "reason set");
    assert(cj.match_components === null, "no components");
    assert(cj.scoring_version === SCORING_VERSION, "version still set");
    const explanation = cj.ai_explanation as { recommendation?: string };
    assert(explanation.recommendation === "insufficient_data", "insufficient explanation");
    const weightsUsed = cj.match_weights_used as { weights_version: number };
    assert(weightsUsed.weights_version === 1, "weights envelope set");
  });

  await check("handlePeopleMatch rejects cross-tenant job_id", async () => {
    resetTables();
    seedJob({ team_id: OTHER_TEAM_ID });
    seedCandidate();
    seedCandidateJob({ team_id: OTHER_TEAM_ID });
    seedBackgroundJob();
    const supabase = makeServiceClient();
    const outcome = await handlePeopleMatch(
      supabase as never,
      backgroundJobFromRow(tables.background_jobs[0]),
    );
    assert(outcome.status === "failed", "failed");
    assert(outcome.error === "job_not_found", "job_not_found");
  });

  await check("handlePeopleMatch writes one job-level system audit event", async () => {
    resetTables();
    seedJob();
    seedCandidate();
    seedCandidateJob();
    seedBackgroundJob();
    const supabase = makeServiceClient();
    await handlePeopleMatch(
      supabase as never,
      backgroundJobFromRow(tables.background_jobs[0]),
    );
    assert(tables.audit_events.length === 1, "one audit row");
    const audit = tables.audit_events[0];
    assert(audit.actor_user_id === null, "null actor");
    assert(audit.action === "match", "action");
    assert(audit.entity_id === JOB_ID, "entity job");
    const meta = audit.metadata as Record<string, unknown>;
    assert(meta.processed === 1, "processed count");
    assert(meta.scored === 1, "scored count");
    assert(meta.scoring_version === SCORING_VERSION, "scoring_version in metadata");
    assert(meta.scoring_weights_version === 1, "scoring_weights_version in metadata");
    assert(meta.explained === 1, "explained in metadata");
    assert(!("email" in meta), "no email");
    assert(!("full_name" in meta), "no full_name");
  });

  await check("writeSystemAuditEvent allows null actor", async () => {
    resetTables();
    const supabase = makeServiceClient();
    const result = await writeSystemAuditEvent(
      { supabase: supabase as never, teamId: TEAM_ID, workspaceId: WORKSPACE_ID },
      {
        domain: "people",
        action: "match",
        entityType: "job",
        entityId: JOB_ID,
        metadata: { processed: 0 },
      },
    );
    assert(result.ok, "ok");
    assert(tables.audit_events[0].actor_user_id === null, "null actor");
  });

  await check("enqueuePeopleMatchJob requeues completed row with attempts reset", async () => {
    resetTables();
    tables.background_jobs.push({
      id: "bg-done",
      team_id: TEAM_ID,
      workspace_id: WORKSPACE_ID,
      kind: "people.match",
      status: "completed",
      payload: { job_id: JOB_ID },
      progress: { processed: 1 },
      error: null,
      idempotency_key: `people.match:${JOB_ID}`,
      attempts: 3,
      run_after: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const result = await enqueuePeopleMatchJob(tenantCtx, JOB_ID);
    assert(result.ok, "ok");
    if (!result.ok) return;
    assert(!result.data.created, "not created");
    assert(result.data.job.status === "queued", "requeued");
    assert(result.data.job.attempts === 0, "attempts reset");
  });

  await check("enqueuePeopleMatchJob returns existing queued row", async () => {
    resetTables();
    tables.background_jobs.push({
      id: "bg-queued",
      team_id: TEAM_ID,
      workspace_id: WORKSPACE_ID,
      kind: "people.match",
      status: "queued",
      payload: { job_id: JOB_ID },
      progress: {},
      error: null,
      idempotency_key: `people.match:${JOB_ID}`,
      attempts: 0,
      run_after: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const result = await enqueuePeopleMatchJob(tenantCtx, JOB_ID);
    assert(result.ok, "ok");
    if (!result.ok) return;
    assert(result.data.job.id === "bg-queued", "same row");
    assert(tables.background_jobs.length === 1, "no duplicate");
  });


  await check("re-run overwrites previous score and weights_version", async () => {
    resetTables();
    seedJob({ scoring_weights_version: 2 });
    seedCandidate();
    seedCandidateJob({
      match_score: 10,
      scoring_version: "old",
      match_weights_used: { weights: DEFAULT_SCORING_WEIGHTS, weights_version: 1 },
      data_quality: "sufficient",
    });
    seedBackgroundJob();
    const outcome = await handlePeopleMatch(
      makeServiceClient() as never,
      backgroundJobFromRow(tables.background_jobs[0]),
    );
    assert(outcome.status === "completed", "completed");
    const cj = tables.candidate_jobs[0];
    assert(cj.scoring_version === SCORING_VERSION, "new version");
    const weightsUsed = cj.match_weights_used as { weights_version: number };
    assert(weightsUsed.weights_version === 2, "weights_version overwritten");
    assert(typeof cj.match_score === "number" && cj.match_score !== 10, "score overwritten");
  });

  await check("archived candidate skipped; stage unchanged", async () => {
    resetTables();
    seedJob();
    seedCandidate({ archived_at: new Date().toISOString() });
    seedCandidateJob({ stage: "shortlisted", match_score: null });
    seedBackgroundJob();
    const outcome = await handlePeopleMatch(
      makeServiceClient() as never,
      backgroundJobFromRow(tables.background_jobs[0]),
    );
    assert(outcome.status === "completed", "completed");
    const cj = tables.candidate_jobs[0];
    assert(cj.stage === "shortlisted", "stage unchanged");
    assert(cj.match_score === null, "not scored");
    const progress = tables.background_jobs[0].progress as Record<string, unknown>;
    assert(progress.skipped === 1, "skipped archived");
    assert(progress.scored === 0, "no scored");
  });

  await check("invalid stored weights fails invalid_weights", async () => {
    resetTables();
    seedJob({ scoring_weights: { technical_fit: 1 } });
    seedCandidate();
    seedCandidateJob({ match_score: null });
    seedBackgroundJob();
    const outcome = await handlePeopleMatch(
      makeServiceClient() as never,
      backgroundJobFromRow(tables.background_jobs[0]),
    );
    assert(outcome.status === "failed", "failed");
    assert(outcome.error === "invalid_weights", "invalid_weights");
    assert(tables.candidate_jobs[0].match_score === null, "no write");
  });

  await check("empty candidate_jobs completes with processed 0", async () => {
    resetTables();
    seedJob();
    seedBackgroundJob();
    const outcome = await handlePeopleMatch(
      makeServiceClient() as never,
      backgroundJobFromRow(tables.background_jobs[0]),
    );
    assert(outcome.status === "completed", "completed");
    const progress = tables.background_jobs[0].progress as Record<string, unknown>;
    assert(progress.processed === 0, "processed 0");
    assert(progress.total === 0, "total 0");
    assert(progress.scored === 0, "scored 0");
    assert(tables.audit_events.length === 1, "audit still written");
  });

  await check("batching uses MATCH_BATCH_SIZE and scores >100 rows", async () => {
    resetTables();
    seedJob();
    const n = MATCH_BATCH_SIZE + 5;
    for (let i = 0; i < n; i += 1) {
      const cid = `cand-${String(i).padStart(4, "0")}`;
      seedCandidate({
        id: cid,
        email: `c${i}@example.com`,
        full_name: `Cand ${i}`,
      });
      seedCandidateJob({
        id: `cj-${String(i).padStart(4, "0")}`,
        candidate_id: cid,
        match_score: null,
        ai_explanation: null,
        ai_model: null,
        ai_prompt_version: null,
      });
    }
    seedBackgroundJob();
    const outcome = await handlePeopleMatch(
      makeServiceClient() as never,
      backgroundJobFromRow(tables.background_jobs[0]),
    );
    assert(outcome.status === "completed", `completed ${outcome.error ?? ""}`);
    assert(tables.candidate_jobs.length === n, "all rows present");
    assert(
      tables.candidate_jobs.every((r) => typeof r.match_score === "number"),
      "all scored",
    );
    const progress = tables.background_jobs[0].progress as Record<string, unknown>;
    assert(progress.processed === n, "processed all");
    assert(progress.total === n, "total all");
  });

  await check("dispatchBackgroundJob delegates to handlePeopleMatch", async () => {
    resetTables();
    seedJob();
    seedCandidate();
    seedCandidateJob();
    seedBackgroundJob();
    const supabase = makeServiceClient();
    const outcome = await dispatchBackgroundJob(
      supabase as never,
      backgroundJobFromRow(tables.background_jobs[0]),
    );
    assert(outcome.status === "completed", "completed via dispatch");
    assert(tables.candidate_jobs[0].scoring_version === SCORING_VERSION, "scored");
  });

  await check("explain-only phase does not rewrite scores", async () => {
    resetTables();
    seedJob();
    seedCandidate();
    seedCandidateJob({
      match_score: 42,
      scoring_version: SCORING_VERSION,
      data_quality: "sufficient",
      match_components: [{ key: "technical_fit" }],
      ai_explanation: null,
    });
    seedBackgroundJob({
      payload: { job_id: JOB_ID, phase: "explain" },
      progress: {
        processed: 1,
        scored: 1,
        insufficient: 0,
        skipped: 0,
        total: 1,
        scoring_version: SCORING_VERSION,
        scoring_weights_version: 1,
        explained: 0,
        explain_failed: 0,
        explain_skipped: 0,
        prompt_version: PEOPLE_MATCH_EXPLAIN_PROMPT_VERSION,
      },
    });
    const outcome = await handlePeopleMatch(
      makeServiceClient() as never,
      backgroundJobFromRow(tables.background_jobs[0]),
    );
    assert(outcome.status === "completed", "completed");
    const cj = tables.candidate_jobs[0];
    assert(cj.match_score === 42, "score unchanged");
    assert(cj.scoring_version === SCORING_VERSION, "version unchanged");
    const explanation = cj.ai_explanation as { summary?: string };
    assert(typeof explanation.summary === "string", "explanation filled");
  });

  await check("ai_not_configured stores error without nullifying score", async () => {
    const prevProvider = process.env.AI_PROVIDER;
    delete process.env.AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.AZURE_API_KEY;

    resetTables();
    seedJob();
    seedCandidate();
    seedCandidateJob();
    seedBackgroundJob();

    const { handlePeopleMatch: handleFresh } = await import("@/lib/people/match-worker");
    const outcome = await handleFresh(
      makeServiceClient() as never,
      backgroundJobFromRow(tables.background_jobs[0]),
    );
    assert(outcome.status === "completed", "completed");
    const cj = tables.candidate_jobs[0];
    assert(typeof cj.match_score === "number", "score still set");
    const explanation = cj.ai_explanation as { error?: string };
    assert(explanation.error === "ai_not_configured", "ai_not_configured error");

    process.env.AI_PROVIDER = prevProvider ?? "mock";
  });

  console.log(`\npeople-match-worker: ${passed} checks passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
