/**
 * Wave 2 G3 — confirmation-gated People Chat tools (mocked Supabase, no live LLM).
 * Run: npx tsx scripts/chat_proposed_actions.test.ts
 *
 * Proves:
 *   1. Propose schema is the two names; send_email / update_employee are absent.
 *   2. Unknown tools return an error and do not mutate.
 *   3. Query length is capped; invalid status/stage is rejected.
 *   4. 0 / 1 / many name matches; propose does not update employees or stages.
 *   5. Confirm executes once via lib/people; cancel does not; typed "yes" does not.
 *   6. Cross-tenant confirm is 404. Stale from-value is 409.
 *   7. people-tools.ts still does not import update/create/send helpers.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Module from "node:module";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const TEAM_A = "11111111-1111-4111-8111-111111111111";
const TEAM_B = "99999999-9999-4999-8999-999999999999";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "user-1";
const SESSION_A = "sess-a";
const SESSION_B = "sess-b";
const JOB_ENG = "job-eng";
const JOB_STAFF = "job-staff";
const CAND_MAYA = "cand-maya";
const CAND_NIA = "cand-nia";
const CJ_MAYA = "cj-maya";
const CJ_NIA = "cj-nia";

type Row = Record<string, unknown>;

const employeesTable: Row[] = [];
const candidatesTable: Row[] = [];
const jobsTable: Row[] = [];
const candidateJobsTable: Row[] = [];
const proposedTable: Row[] = [];
const sessionsTable: Row[] = [];
const auditEventsTable: Row[] = [];
let idSeq = 0;

function resetState(): void {
  employeesTable.length = 0;
  candidatesTable.length = 0;
  jobsTable.length = 0;
  candidateJobsTable.length = 0;
  proposedTable.length = 0;
  sessionsTable.length = 0;
  auditEventsTable.length = 0;
  idSeq = 0;

  sessionsTable.push(
    { id: SESSION_A, team_id: TEAM_A },
    { id: SESSION_B, team_id: TEAM_B },
  );

  employeesTable.push(
    {
      id: "emp-a",
      team_id: TEAM_A,
      full_name: "Riley Chen",
      email: "riley@secret.test",
      phone: "555-0100",
      role_title: "Ops",
      employment_status: "active",
      started_on: null,
      ended_on: null,
      location: "Colombo",
      notes: "Internal PIP notes",
      archived_at: null,
      created_at: "2026-09-01T10:00:00Z",
      updated_at: "2026-09-01T10:00:00Z",
    },
    {
      id: "emp-sam",
      team_id: TEAM_A,
      full_name: "Sam Onboard",
      email: "sam@secret.test",
      phone: null,
      role_title: "AE",
      employment_status: "onboarding",
      started_on: null,
      ended_on: null,
      location: null,
      notes: null,
      archived_at: null,
      created_at: "2026-09-01T09:00:00Z",
      updated_at: "2026-09-01T09:00:00Z",
    },
    {
      id: "emp-b",
      team_id: TEAM_B,
      full_name: "B-Spy",
      email: "spy@evil.test",
      phone: "555-9999",
      role_title: "Spy",
      employment_status: "active",
      started_on: null,
      ended_on: null,
      location: "Remote",
      notes: "Do not leak",
      archived_at: null,
      created_at: "2026-09-01T08:00:00Z",
      updated_at: "2026-09-01T08:00:00Z",
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
      updated_at: "2026-09-01T10:00:00Z",
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
      updated_at: "2026-09-01T09:00:00Z",
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
  if (table === "chat_proposed_actions") return proposedTable;
  if (table === "chat_sessions") return sessionsTable;
  if (table === "audit_events") return auditEventsTable;
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

function withCandidateJoin(row: Row): Row {
  const candidate = candidatesTable.find((c) => c.id === row.candidate_id);
  return {
    ...row,
    candidates: candidate ? { ...candidate } : null,
  };
}

function tenantSupabase() {
  return {
    from(table: string) {
      const store = storeFor(table);
      const filters: Array<(r: Row) => boolean> = [];
      let insertRow: Row | null = null;
      let updatePatch: Row | null = null;
      let joinCandidates = false;
      let range: { from: number; to: number } | null = null;
      let limitN: number | null = null;
      let orderCol: string | null = null;
      let orderAsc = true;
      let consumed = false;

      const applyFilters = () => store.filter((r) => filters.every((f) => f(r)));

      const finishInsert = () => {
        if (!insertRow) return { data: null, error: null };
        consumed = true;
        const now = new Date().toISOString();
        idSeq += 1;
        const row: Row = {
          id: insertRow.id ?? `${table}-${idSeq}`,
          created_at: now,
          updated_at: now,
          confirmed_at: null,
          confirmed_by: null,
          error: null,
          ...insertRow,
        };
        store.push(row);
        return { data: { ...row }, error: null };
      };

      const finishUpdate = () => {
        consumed = true;
        const hit = store.find((r) => filters.every((f) => f(r)));
        if (!hit || !updatePatch) {
          return { data: null, error: null };
        }
        Object.assign(hit, updatePatch, { updated_at: new Date().toISOString() });
        const data = joinCandidates ? withCandidateJoin(hit) : { ...hit };
        return { data, error: null };
      };

      const finishSelect = () => {
        let rows = applyFilters();
        if (table === "candidate_jobs" && joinCandidates) {
          rows = rows.map(withCandidateJoin);
        } else if (orderCol) {
          const col = orderCol;
          rows = [...rows].sort((a, b) => {
            const av = String(a[col] ?? "");
            const bv = String(b[col] ?? "");
            return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
          });
        }
        const count = rows.length;
        if (range) rows = rows.slice(range.from, range.to + 1);
        if (limitN != null) rows = rows.slice(0, limitN);
        return {
          data: rows.map((r) => ({ ...r })),
          error: null,
          count,
        };
      };

      const resolveWriteOrSelect = () => {
        if (insertRow && !consumed) return finishInsert();
        if (updatePatch && !consumed) return finishUpdate();
        return finishSelect();
      };

      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select(cols?: string, _opts?: { count?: string }) {
          if (table === "candidate_jobs" && typeof cols === "string") {
            joinCandidates = cols.includes("candidates");
          }
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
          if (insertRow) return Promise.resolve(finishInsert());
          if (updatePatch) return Promise.resolve(finishUpdate());
          const rows = applyFilters();
          const row = rows[0]
            ? joinCandidates
              ? withCandidateJoin(rows[0])
              : { ...rows[0] }
            : null;
          return Promise.resolve({ data: row, error: null });
        },
        single() {
          if (insertRow) return Promise.resolve(finishInsert());
          if (updatePatch) return Promise.resolve(finishUpdate());
          const rows = applyFilters();
          const row = rows[0]
            ? joinCandidates
              ? withCandidateJoin(rows[0])
              : { ...rows[0] }
            : null;
          return Promise.resolve({
            data: row,
            error: row ? null : { code: "PGRST116", message: "not found" },
          });
        },
        then(
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) {
          return Promise.resolve(resolveWriteOrSelect()).then(resolve, reject);
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

const ctxA = {
  get supabase() {
    return tenantSupabase() as never;
  },
  teamId: TEAM_A,
  workspaceId: WORKSPACE_ID,
  user: { id: USER_ID },
  sessionId: SESSION_A,
};

const ctxB = {
  get supabase() {
    return tenantSupabase() as never;
  },
  teamId: TEAM_B,
  workspaceId: WORKSPACE_ID,
  user: { id: USER_ID },
  sessionId: SESSION_B,
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
    PEOPLE_PROPOSE_TOOLS,
    PEOPLE_PROPOSE_TOOL_NAMES,
    executePeopleProposeTool,
    confirmProposedAction,
    cancelProposedAction,
    PEOPLE_PROPOSE_PENDING_CAP,
  } = await import("@/lib/chat/people-propose");

  await check("schema is the two propose tools; no send_email", async () => {
    assert(PEOPLE_PROPOSE_TOOL_NAMES.length === 2, "two names");
    const names = PEOPLE_PROPOSE_TOOLS.map((t) => t.function.name);
    assert(
      names.join(",") === "propose_pipeline_stage,propose_employment_status",
      `schema names (got ${names.join(",")})`,
    );
    assert(
      !names.includes("update_employee" as never) &&
        !names.includes("send_email" as never),
      "no send/update tools",
    );
  });

  await check("people-tools.ts does not import write helpers", async () => {
    const src = readFileSync(
      join(process.cwd(), "lib/chat/people-tools.ts"),
      "utf8",
    );
    assert(!src.includes("updateEmployee"), "no updateEmployee");
    assert(!src.includes("updateCandidateJobPipeline"), "no pipeline update");
    assert(!src.includes("generateDraft"), "no generateDraft");
    assert(!src.includes("sendDraft"), "no sendDraft");
    assert(!src.includes("people-propose"), "read module does not import propose");
  });

  await check("unknown tool is rejected and does not write", async () => {
    const raw = await executePeopleProposeTool(
      "send_email",
      { q: "Riley", yes: true },
      ctxA,
    );
    const body = parseJson(raw);
    assert(body.error === "Unknown tool", `unknown (got ${String(body.error)})`);
    assert(proposedTable.length === 0, "no pending row");
    assert(
      employeesTable.find((e) => e.id === "emp-a")?.employment_status === "active",
      "employee unchanged",
    );
  });

  await check("query length bound and invalid enums", async () => {
    const missing = parseJson(
      await executePeopleProposeTool("propose_employment_status", {}, ctxA),
    );
    assert(missing.error === "q is required", "missing q");
    const long = parseJson(
      await executePeopleProposeTool(
        "propose_employment_status",
        { q: "x".repeat(81), employment_status: "active" },
        ctxA,
      ),
    );
    assert(
      typeof long.error === "string" && long.error.includes("80"),
      "over-long q rejected",
    );
    const badStatus = parseJson(
      await executePeopleProposeTool(
        "propose_employment_status",
        { q: "Riley", employment_status: "fired" },
        ctxA,
      ),
    );
    assert(badStatus.error === "employment_status is invalid", "invalid status");
    const badStage = parseJson(
      await executePeopleProposeTool(
        "propose_pipeline_stage",
        { candidate: "Maya", job: "Engineer", stage: "hired" },
        ctxA,
      ),
    );
    assert(badStage.error === "stage is invalid", "invalid stage");
  });

  await check("employment propose 0 / 1 / many; does not mutate", async () => {
    const none = parseJson(
      await executePeopleProposeTool(
        "propose_employment_status",
        { q: "Nobody", employment_status: "offboarded" },
        ctxA,
      ),
    );
    assert(none.error === "No employee matching that name", "zero");

    employeesTable.push({
      id: "emp-riley-2",
      team_id: TEAM_A,
      full_name: "Riley Other",
      email: null,
      phone: null,
      role_title: "CS",
      employment_status: "active",
      archived_at: null,
      created_at: "2026-09-01T07:00:00Z",
    });
    const many = parseJson(
      await executePeopleProposeTool(
        "propose_employment_status",
        { q: "Riley", employment_status: "resignation_pending" },
        ctxA,
      ),
    );
    assert(many.disambiguate === true, "many → disambiguate");
    assert(proposedTable.length === 0, "disambiguate does not persist");
    const names = (many.employees as Array<{ name: string }>).map((e) => e.name).sort();
    assert(names.join(",") === "Riley Chen,Riley Other", "names only");
    assert(!JSON.stringify(many).includes("riley@secret.test"), "no email");

    employeesTable.splice(
      employeesTable.findIndex((e) => e.id === "emp-riley-2"),
      1,
    );
    const one = parseJson(
      await executePeopleProposeTool(
        "propose_employment_status",
        { q: "Riley", employment_status: "resignation_pending", yes: true },
        ctxA,
      ),
    );
    assert(one.proposed === true, "proposed");
    assert(typeof one.action_id === "string", "action_id");
    assert(one.kind === "set_employment_status", "kind");
    assert(
      employeesTable.find((e) => e.id === "emp-a")?.employment_status === "active",
      "propose does not update",
    );
    assert(proposedTable.length === 1, "one pending");
    const payload = proposedTable[0].payload as Record<string, unknown>;
    assert(payload.employee_id === "emp-a", "id stored server-side");
    assert(!("email" in payload), "payload has no email");
    assert(
      auditEventsTable.some((r) => r.action === "propose"),
      "propose audited",
    );
  });

  await check("same-target pending is reused; cap is enforced", async () => {
    const first = parseJson(
      await executePeopleProposeTool(
        "propose_employment_status",
        { q: "Riley", employment_status: "offboarded" },
        ctxA,
      ),
    );
    const second = parseJson(
      await executePeopleProposeTool(
        "propose_employment_status",
        { q: "Riley", employment_status: "offboarded" },
        ctxA,
      ),
    );
    assert(first.action_id === second.action_id, "reuse same-target");
    assert(proposedTable.length === 1, "still one row");

    const staffIdx = jobsTable.findIndex((j) => j.id === JOB_STAFF);
    if (staffIdx >= 0) jobsTable.splice(staffIdx, 1);

    await executePeopleProposeTool(
      "propose_employment_status",
      { q: "Riley", employment_status: "resignation_pending" },
      ctxA,
    );
    await executePeopleProposeTool(
      "propose_employment_status",
      { q: "Sam", employment_status: "active" },
      ctxA,
    );
    await executePeopleProposeTool(
      "propose_employment_status",
      { q: "Sam", employment_status: "offboarded" },
      ctxA,
    );
    await executePeopleProposeTool(
      "propose_pipeline_stage",
      { candidate: "Maya", job: "Engineer", stage: "shortlisted" },
      ctxA,
    );
    assert(proposedTable.length === PEOPLE_PROPOSE_PENDING_CAP, "hit cap");
    const overflow = parseJson(
      await executePeopleProposeTool(
        "propose_pipeline_stage",
        { candidate: "Nia", job: "Engineer", stage: "decision" },
        ctxA,
      ),
    );
    assert(
      typeof overflow.error === "string" && overflow.error.includes("Too many"),
      "cap error",
    );
  });

  await check("pipeline propose unique pair; many titles disambiguate", async () => {
    const none = parseJson(
      await executePeopleProposeTool(
        "propose_pipeline_stage",
        { candidate: "Maya", job: "Chef", stage: "shortlisted" },
        ctxA,
      ),
    );
    assert(none.error === "No job matching that title", "no job");

    const many = parseJson(
      await executePeopleProposeTool(
        "propose_pipeline_stage",
        { candidate: "Maya", job: "Engineer", stage: "shortlisted" },
        ctxA,
      ),
    );
    assert(many.disambiguate === true, "job substring disambiguate");
    assert(proposedTable.length === 0, "no persist");

    const one = parseJson(
      await executePeopleProposeTool(
        "propose_pipeline_stage",
        { candidate: "Maya", job: "Engineer", stage: "shortlisted" },
        ctxA,
      ),
    );
    // Still two Engineer titles — force unique by removing Staff.
    assert(many.disambiguate === true, "still disambiguate with both jobs");
    const staffIdx = jobsTable.findIndex((j) => j.id === JOB_STAFF);
    jobsTable.splice(staffIdx, 1);
    const unique = parseJson(
      await executePeopleProposeTool(
        "propose_pipeline_stage",
        { candidate: "Maya", job: "Engineer", stage: "shortlisted" },
        ctxA,
      ),
    );
    assert(unique.proposed === true, "unique proposed");
    assert(
      candidateJobsTable.find((r) => r.id === CJ_MAYA)?.stage === "new",
      "stage unchanged",
    );
    assert(!JSON.stringify(unique).includes(CAND_MAYA), "no candidate id in tool result");
  });

  await check("confirm applies employment once; cancel does not mutate", async () => {
    const proposed = parseJson(
      await executePeopleProposeTool(
        "propose_employment_status",
        { q: "Riley", employment_status: "resignation_pending" },
        ctxA,
      ),
    );
    const actionId = String(proposed.action_id);

    const cancelled = await cancelProposedAction(ctxA, actionId);
    assert(cancelled.ok && cancelled.data.status === "cancelled", "cancelled");
    assert(
      employeesTable.find((e) => e.id === "emp-a")?.employment_status === "active",
      "cancel does not mutate",
    );

    const again = parseJson(
      await executePeopleProposeTool(
        "propose_employment_status",
        { q: "Riley", employment_status: "resignation_pending" },
        ctxA,
      ),
    );
    const confirmId = String(again.action_id);
    const confirmed = await confirmProposedAction(ctxA, confirmId);
    assert(confirmed.ok && confirmed.data.status === "confirmed", "confirmed");
    assert(confirmed.ok && confirmed.skipped === false, "not skipped");
    assert(
      employeesTable.find((e) => e.id === "emp-a")?.employment_status ===
        "resignation_pending",
      "status applied",
    );
    const second = await confirmProposedAction(ctxA, confirmId);
    assert(!second.ok && second.status === 409, "second confirm 409");
  });

  await check("confirm pipeline stage via updateCandidateJobPipeline", async () => {
    jobsTable.splice(
      jobsTable.findIndex((j) => j.id === JOB_STAFF),
      1,
    );
    const proposed = parseJson(
      await executePeopleProposeTool(
        "propose_pipeline_stage",
        { candidate: "Maya", job: "Engineer", stage: "shortlisted" },
        ctxA,
      ),
    );
    const result = await confirmProposedAction(ctxA, String(proposed.action_id));
    assert(result.ok && result.data.status === "confirmed", "confirmed stage");
    assert(
      candidateJobsTable.find((r) => r.id === CJ_MAYA)?.stage === "shortlisted",
      "stage applied",
    );
  });

  await check("cross-tenant confirm is 404; stale from-value is 409", async () => {
    const proposed = parseJson(
      await executePeopleProposeTool(
        "propose_employment_status",
        { q: "Riley", employment_status: "offboarded" },
        ctxA,
      ),
    );
    const actionId = String(proposed.action_id);
    const other = await confirmProposedAction(ctxB, actionId);
    assert(!other.ok && other.status === 404, "team B cannot confirm");
    assert(
      employeesTable.find((e) => e.id === "emp-a")?.employment_status === "active",
      "no cross-tenant mutate",
    );

    const emp = employeesTable.find((e) => e.id === "emp-a");
    assert(emp, "riley present");
    emp!.employment_status = "onboarding";
    const stale = await confirmProposedAction(ctxA, actionId);
    assert(!stale.ok && stale.status === 409, "stale from-value");
    assert(
      employeesTable.find((e) => e.id === "emp-a")?.employment_status === "onboarding",
      "stale confirm did not apply target",
    );
  });

  console.log(`\nchat_proposed_actions: ${passed}/10 checks passed`);
})().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
