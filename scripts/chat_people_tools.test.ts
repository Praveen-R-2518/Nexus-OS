/**
 * Wave 2 G2 — People read tools for Chat (mocked Supabase, no live LLM).
 * Run: npx tsx scripts/chat_people_tools.test.ts
 *
 * Proves:
 *   1. Tool schema is the three read names; update_employee is absent.
 *   2. Unknown tools return an error and do not execute.
 *   3. Query length is capped; missing q/job is rejected.
 *   4. Employee/candidate projection strips email, phone, notes, URLs.
 *   5. Team A cannot see team B rows.
 *   6. list_job_pipeline: 0 / 1 / many title matches; optional stage filter.
 */

import Module from "node:module";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const TEAM_A = "11111111-1111-4111-8111-111111111111";
const TEAM_B = "99999999-9999-4999-8999-999999999999";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "user-1";
const JOB_ENG = "job-eng";
const JOB_STAFF = "job-staff";
const JOB_B = "job-b";
const CAND_MAYA = "cand-maya";
const CAND_NIA = "cand-nia";
const CAND_B = "cand-b";
const CJ_MAYA = "cj-maya";
const CJ_NIA = "cj-nia";

type Row = Record<string, unknown>;

const employeesTable: Row[] = [];
const candidatesTable: Row[] = [];
const jobsTable: Row[] = [];
const candidateJobsTable: Row[] = [];
const profilesTable: Row[] = [];

function resetState(): void {
  employeesTable.length = 0;
  candidatesTable.length = 0;
  jobsTable.length = 0;
  candidateJobsTable.length = 0;
  profilesTable.length = 0;

  employeesTable.push(
    {
      id: "emp-a",
      team_id: TEAM_A,
      full_name: "Riley Chen",
      email: "riley@secret.test",
      phone: "555-0100",
      role_title: "Ops",
      employment_status: "active",
      location: "Colombo",
      notes: "Internal PIP notes",
      archived_at: null,
      created_at: "2026-09-01T10:00:00Z",
    },
    {
      id: "emp-onboard",
      team_id: TEAM_A,
      full_name: "Sam Onboard",
      email: "sam@secret.test",
      phone: null,
      role_title: "AE",
      employment_status: "onboarding",
      location: null,
      notes: null,
      archived_at: null,
      created_at: "2026-09-01T09:00:00Z",
    },
    {
      id: "emp-b",
      team_id: TEAM_B,
      full_name: "B-Spy",
      email: "spy@evil.test",
      phone: "555-9999",
      role_title: "Spy",
      employment_status: "active",
      location: "Remote",
      notes: "Do not leak",
      archived_at: null,
      created_at: "2026-09-01T08:00:00Z",
    },
  );

  candidatesTable.push(
    {
      id: CAND_MAYA,
      team_id: TEAM_A,
      full_name: "Maya Singh",
      email: "maya@secret.test",
      phone: "555-0200",
      headline: "Frontend",
      current_role: "Engineer",
      location: "NYC",
      source: "csv",
      source_url: "https://secret.example/cv",
      consent_status: "owner_imported",
      notes: "Confidential recruiter notes",
      archived_at: null,
      created_at: "2026-09-01T10:00:00Z",
    },
    {
      id: CAND_NIA,
      team_id: TEAM_A,
      full_name: "Nia Park",
      email: "nia@secret.test",
      phone: null,
      headline: "Backend",
      current_role: "Engineer",
      location: null,
      source: null,
      source_url: null,
      consent_status: "owner_imported",
      notes: null,
      archived_at: null,
      created_at: "2026-09-01T09:00:00Z",
    },
    {
      id: CAND_B,
      team_id: TEAM_B,
      full_name: "B-Mole",
      email: "mole@evil.test",
      phone: null,
      headline: "Spy",
      current_role: null,
      location: null,
      source: null,
      source_url: "https://evil.example",
      consent_status: "unknown",
      notes: "other team",
      archived_at: null,
      created_at: "2026-09-01T08:00:00Z",
    },
  );

  jobsTable.push(
    {
      id: JOB_ENG,
      team_id: TEAM_A,
      title: "Engineer",
      archived_at: null,
      created_at: "2026-09-01T10:00:00Z",
    },
    {
      id: JOB_STAFF,
      team_id: TEAM_A,
      title: "Staff Engineer",
      archived_at: null,
      created_at: "2026-09-01T09:00:00Z",
    },
    {
      id: JOB_B,
      team_id: TEAM_B,
      title: "Engineer",
      archived_at: null,
      created_at: "2026-09-01T08:00:00Z",
    },
  );

  candidateJobsTable.push(
    {
      id: CJ_MAYA,
      team_id: TEAM_A,
      job_id: JOB_ENG,
      candidate_id: CAND_MAYA,
      stage: "new",
      match_score: 88,
      match_components: null,
      match_weights_used: null,
      scoring_version: "1",
      data_quality: "sufficient",
      insufficient_reason: null,
      ai_explanation: null,
      ai_model: null,
      ai_prompt_version: null,
      manual_rank_override: null,
      assigned_to: null,
      created_at: "2026-09-01T10:00:00Z",
      updated_at: "2026-09-01T10:00:00Z",
    },
    {
      id: CJ_NIA,
      team_id: TEAM_A,
      job_id: JOB_ENG,
      candidate_id: CAND_NIA,
      stage: "shortlisted",
      match_score: 40,
      match_components: null,
      match_weights_used: null,
      scoring_version: "1",
      data_quality: "sufficient",
      insufficient_reason: null,
      ai_explanation: { summary: "keep private" },
      ai_model: "gpt-4o-mini",
      ai_prompt_version: "1",
      manual_rank_override: 1,
      assigned_to: USER_ID,
      created_at: "2026-09-01T09:00:00Z",
      updated_at: "2026-09-01T09:00:00Z",
    },
  );
}

function storeFor(table: string): Row[] {
  if (table === "employees") return employeesTable;
  if (table === "candidates") return candidatesTable;
  if (table === "jobs") return jobsTable;
  if (table === "candidate_jobs") return candidateJobsTable;
  if (table === "profiles") return profilesTable;
  return [];
}

function matchesIlike(row: Row, expr: string): boolean {
  const clauses = expr.split(/,(?=[a-z_]+\.ilike\.)/i);
  return clauses.some((clause) => {
    const m = clause.trim().match(/^([a-z_]+)\.ilike\."%(.+)%"$/i);
    if (!m) return false;
    const col = m[1];
    const term = m[2]
      .replace(/\\%/g, "%")
      .replace(/\\_/g, "_")
      .replace(/\\\\/g, "\\");
    const raw = row[col];
    if (typeof raw !== "string") return false;
    return raw.toLowerCase().includes(term.toLowerCase());
  });
}

function attachCandidates(rows: Row[]): Row[] {
  return rows
    .map((row) => {
      const candidate = candidatesTable.find((c) => c.id === row.candidate_id);
      if (!candidate || candidate.archived_at) return null;
      return { ...row, candidates: { ...candidate } };
    })
    .filter((row): row is Row => row !== null);
}

function sortCandidateJobs(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    const ao = a.manual_rank_override;
    const bo = b.manual_rank_override;
    const aNull = ao == null;
    const bNull = bo == null;
    if (aNull !== bNull) return aNull ? 1 : -1;
    if (!aNull && !bNull && ao !== bo) return Number(ao) - Number(bo);
    const as = a.match_score;
    const bs = b.match_score;
    const aScoreNull = as == null;
    const bScoreNull = bs == null;
    if (aScoreNull !== bScoreNull) return aScoreNull ? 1 : -1;
    if (!aScoreNull && !bScoreNull && as !== bs) return Number(bs) - Number(as);
    return String(a.id).localeCompare(String(b.id));
  });
}

function tenantSupabase() {
  return {
    from(table: string) {
      const store = storeFor(table);
      const filters: Array<(r: Row) => boolean> = [];
      let range: { from: number; to: number } | null = null;
      let limitN: number | null = null;
      let orderCol: string | null = null;
      let orderAsc = true;
      let joinCandidates = false;
      let wantCount = false;

      const applyFilters = () => store.filter((r) => filters.every((f) => f(r)));

      const finishSelect = () => {
        let rows = applyFilters();
        if (table === "candidate_jobs" && joinCandidates) {
          rows = attachCandidates(sortCandidateJobs(rows));
        } else if (orderCol) {
          const col = orderCol;
          rows = [...rows].sort((a, b) => {
            const av = a[col];
            const bv = b[col];
            if (av === bv) return 0;
            const cmp = (av as never) > (bv as never) ? 1 : -1;
            return orderAsc ? cmp : -cmp;
          });
        }
        const count = rows.length;
        if (range) rows = rows.slice(range.from, range.to + 1);
        if (limitN != null) rows = rows.slice(0, limitN);
        return {
          data: rows.map((r) => ({ ...r })),
          error: null,
          count: wantCount ? count : null,
        };
      };

      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select(cols?: string, opts?: { count?: string }) {
          wantCount = opts?.count === "exact";
          if (table === "candidate_jobs" && typeof cols === "string") {
            joinCandidates = cols.includes("candidates");
          }
          return chain;
        },
        eq(col: string, val: unknown) {
          filters.push((r) => r[col] === val);
          return chain;
        },
        is(col: string, val: unknown) {
          if (col.includes("candidates.archived_at")) {
            filters.push((r) => {
              const candidate = candidatesTable.find((c) => c.id === r.candidate_id);
              return val === null
                ? candidate?.archived_at == null
                : candidate?.archived_at === val;
            });
          } else {
            filters.push((r) => (val === null ? r[col] == null : r[col] === val));
          }
          return chain;
        },
        or(expr: string) {
          filters.push((r) => matchesIlike(r, expr));
          return chain;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          if (!orderCol) {
            orderCol = col;
            orderAsc = !(opts && opts.ascending === false);
          }
          return chain;
        },
        limit(n: number) {
          limitN = n;
          return chain;
        },
        range(from: number, to: number) {
          range = { from, to };
          return chain;
        },
        maybeSingle() {
          const rows = applyFilters();
          const row = rows[0] ? { ...rows[0] } : null;
          return Promise.resolve({ data: row, error: null });
        },
        then(
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) {
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
  return origLoad.apply(this, args);
};

function parseJson(raw: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw);
  assert(parsed && typeof parsed === "object" && !Array.isArray(parsed), "JSON object");
  return parsed as Record<string, unknown>;
}

function leakKeys(text: string): string[] {
  const needles = [
    "riley@secret.test",
    "sam@secret.test",
    "maya@secret.test",
    "nia@secret.test",
    "spy@evil.test",
    "mole@evil.test",
    "555-0100",
    "555-0200",
    "Internal PIP notes",
    "Confidential recruiter notes",
    "https://secret.example/cv",
    "https://evil.example",
    "keep private",
  ];
  return needles.filter((n) => text.includes(n));
}

const ctxA = {
  get supabase() {
    return tenantSupabase() as never;
  },
  teamId: TEAM_A,
  workspaceId: WORKSPACE_ID,
  user: { id: USER_ID },
};

let passed = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  resetState();
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

(async () => {
  const {
    PEOPLE_READ_TOOLS,
    PEOPLE_READ_TOOL_NAMES,
    PEOPLE_READ_QUERY_MAX,
    executePeopleReadTool,
  } = await import("@/lib/chat/people-tools");

  await check("schema is the three read tools; no update_employee", async () => {
    assert(PEOPLE_READ_TOOL_NAMES.length === 3, "three names");
    const names = PEOPLE_READ_TOOLS.map((t) => t.function.name);
    assert(
      names.join(",") === "search_employees,search_candidates,list_job_pipeline",
      `schema names (got ${names.join(",")})`,
    );
    assert(
      !names.includes("update_employee" as never) &&
        !names.includes("send_email" as never),
      "no write tools",
    );
    for (const tool of PEOPLE_READ_TOOLS) {
      assert(tool.type === "function", "function type");
    }
  });

  await check("unknown tool is rejected", async () => {
    const raw = await executePeopleReadTool(
      "update_employee",
      { q: "Riley", employment_status: "offboarded" },
      ctxA,
    );
    const body = parseJson(raw);
    assert(body.error === "Unknown tool", `unknown (got ${String(body.error)})`);
    assert(leakKeys(raw).length === 0, "unknown tool leaks nothing");
  });

  await check("query length bound and missing q", async () => {
    const missing = parseJson(await executePeopleReadTool("search_employees", {}, ctxA));
    assert(missing.error === "q is required", "missing q");
    const long = parseJson(
      await executePeopleReadTool(
        "search_employees",
        { q: "x".repeat(PEOPLE_READ_QUERY_MAX + 1) },
        ctxA,
      ),
    );
    assert(
      typeof long.error === "string" && long.error.includes("80"),
      "over-long q rejected",
    );
    const jobMissing = parseJson(
      await executePeopleReadTool("list_job_pipeline", { q: "Engineer" }, ctxA),
    );
    assert(jobMissing.error === "job is required", "job required");
  });

  await check("search_employees strips PII and respects status", async () => {
    const raw = await executePeopleReadTool(
      "search_employees",
      JSON.stringify({ q: "Riley" }),
      ctxA,
    );
    const leaked = leakKeys(raw);
    assert(leaked.length === 0, `PII leaked: ${leaked.join(", ")}`);
    const body = parseJson(raw);
    const rows = body.rows as Array<Record<string, unknown>>;
    assert(Array.isArray(rows) && rows.length === 1, "one Riley");
    assert(rows[0].name === "Riley Chen", "name");
    assert(rows[0].role_title === "Ops", "role");
    assert(rows[0].employment_status === "active", "status");
    assert(!("email" in rows[0]) && !("phone" in rows[0]) && !("notes" in rows[0]), "no PII keys");

    const onboard = parseJson(
      await executePeopleReadTool(
        "search_employees",
        { q: "Sam", employment_status: "onboarding" },
        ctxA,
      ),
    );
    const onboardRows = onboard.rows as Array<Record<string, unknown>>;
    assert(onboardRows.length === 1 && onboardRows[0].name === "Sam Onboard", "status filter");

    const badStatus = parseJson(
      await executePeopleReadTool(
        "search_employees",
        { q: "Riley", employment_status: "fired" },
        ctxA,
      ),
    );
    assert(badStatus.error === "employment_status is invalid", "invalid status");
  });

  await check("search_employees is team-scoped", async () => {
    const raw = await executePeopleReadTool("search_employees", { q: "Spy" }, ctxA);
    assert(!raw.includes("B-Spy"), "no team B employee");
    assert(leakKeys(raw).length === 0, "no team B PII");
    const body = parseJson(raw);
    const rows = body.rows as unknown[];
    assert(Array.isArray(rows) && rows.length === 0, "team A spy search empty");
  });

  await check("search_candidates strips PII and is team-scoped", async () => {
    const raw = await executePeopleReadTool("search_candidates", { q: "Maya" }, ctxA);
    const leaked = leakKeys(raw);
    assert(leaked.length === 0, `candidate PII leaked: ${leaked.join(", ")}`);
    const body = parseJson(raw);
    const rows = body.rows as Array<Record<string, unknown>>;
    assert(rows.length === 1 && rows[0].name === "Maya Singh", "Maya");
    assert(rows[0].headline === "Frontend", "headline");
    assert(!("email" in rows[0]) && !("notes" in rows[0]) && !("source_url" in rows[0]), "no PII keys");

    const spy = await executePeopleReadTool("search_candidates", { q: "Mole" }, ctxA);
    assert(!spy.includes("B-Mole"), "no team B candidate");
  });

  await check("list_job_pipeline 0 / 1 / many titles", async () => {
    const none = parseJson(
      await executePeopleReadTool("list_job_pipeline", { job: "Chef" }, ctxA),
    );
    assert(none.error === "No job matching that title", "zero matches");

    const many = parseJson(
      await executePeopleReadTool("list_job_pipeline", { job: "Engineer" }, ctxA),
    );
    assert(many.disambiguate === true, "many → disambiguate");
    const titles = (many.jobs as Array<{ title: string }>).map((j) => j.title).sort();
    assert(
      titles.join(",") === "Engineer,Staff Engineer",
      `titles (got ${titles.join(",")})`,
    );
    assert(!JSON.stringify(many).includes(JOB_ENG), "no job ids on disambiguate");

    const one = parseJson(
      await executePeopleReadTool("list_job_pipeline", { job: "Staff Engineer" }, ctxA),
    );
    assert(one.job === "Staff Engineer", "single title");
    const rows = one.rows as unknown[];
    assert(Array.isArray(rows) && rows.length === 0, "staff role has no candidates");
  });

  await check("list_job_pipeline invalid stage is rejected", async () => {
    const bad = parseJson(
      await executePeopleReadTool(
        "list_job_pipeline",
        { job: "Staff Engineer", stage: "hired" },
        ctxA,
      ),
    );
    assert(bad.error === "stage is invalid", "invalid stage");
  });

  await check("list_job_pipeline unique title returns projected rows", async () => {
    const idx = jobsTable.findIndex((j) => j.id === JOB_STAFF);
    assert(idx >= 0, "staff job present before unique pipeline");
    jobsTable.splice(idx, 1);
    const raw = await executePeopleReadTool(
      "list_job_pipeline",
      { job: "Engineer", stage: "shortlisted" },
      ctxA,
    );
    const leaked = leakKeys(raw);
    assert(leaked.length === 0, `pipeline PII leaked: ${leaked.join(", ")}`);
    const body = parseJson(raw);
    assert(body.job === "Engineer", "job title");
    const rows = body.rows as Array<Record<string, unknown>>;
    assert(rows.length === 1 && rows[0].name === "Nia Park", "shortlisted Nia");
    assert(rows[0].stage === "shortlisted", "stage");
    assert(rows[0].match_score === 40, "score");
    assert(
      !("email" in rows[0]) &&
        !("notes" in rows[0]) &&
        !("source_url" in rows[0]) &&
        !("ai_explanation" in rows[0]) &&
        !("assigned_to" in rows[0]),
      "pipeline projection",
    );

    const allStages = parseJson(
      await executePeopleReadTool("list_job_pipeline", { job: "Engineer" }, ctxA),
    );
    const allRows = allStages.rows as Array<Record<string, unknown>>;
    assert(allRows.length === 2, "both stages when unfiltered");
    assert(
      allRows.some((r) => r.name === "Maya Singh") &&
        allRows.some((r) => r.name === "Nia Park"),
      "Maya and Nia",
    );
  });

  console.log(`\nchat_people_tools: ${passed}/9 checks passed`);
})().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
