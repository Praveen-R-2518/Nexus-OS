/**
 * Wave 2 H2 — one consented GitHub profile import (mocked tenant + GitHub).
 * Run: npx tsx scripts/people_from_source.test.ts
 *      (or `npm run test:people-from-source`)
 */

import Module from "node:module";
import { GITHUB_USERS_API } from "@/lib/people/sources";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TEAM_ID = "99999999-9999-4999-8999-999999999999";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "user-1";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_JOB_ID = "44444444-4444-4444-8444-444444444444";
const ARCHIVED_JOB_ID = "55555555-5555-4555-8555-555555555555";
const FROM_SOURCE_URL = "https://example.com/api/people/candidates/from-source";

type Row = Record<string, unknown>;
type AuthMode = "ok" | "unauthorized" | "no_tenant";

const candidatesTable: Row[] = [];
const jobsTable: Row[] = [];
const candidateJobsTable: Row[] = [];
const auditEventsTable: Row[] = [];
const backgroundJobsTable: Row[] = [];
let authMode: AuthMode = "ok";
let idSeq = 0;

let githubStatus = 200;
let githubBody: unknown = {
  login: "octocat",
  id: 1,
  name: "The Octocat",
  email: null,
  bio: "GitHub mascot",
  location: "San Francisco",
  html_url: "https://github.com/octocat",
};
const githubCalls: string[] = [];

const origFetch = globalThis.fetch;

function resetGithub(): void {
  githubStatus = 200;
  githubBody = {
    login: "octocat",
    id: 1,
    name: "The Octocat",
    email: null,
    bio: "GitHub mascot",
    location: "San Francisco",
    html_url: "https://github.com/octocat",
  };
  githubCalls.length = 0;
}

function resetState(): void {
  candidatesTable.length = 0;
  jobsTable.length = 0;
  candidateJobsTable.length = 0;
  auditEventsTable.length = 0;
  backgroundJobsTable.length = 0;
  authMode = "ok";
  idSeq = 0;
  resetGithub();
  seedDefaultJob();
}

function jsonResponse(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function columnValue(row: Row, col: string): unknown {
  if (col.includes("->>")) {
    const [left, right] = col.split("->>");
    const obj = row[left ?? ""];
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return undefined;
    return (obj as Row)[right ?? ""];
  }
  return row[col];
}

function tenantSupabase() {
  return {
    from(table: string) {
      const store =
        table === "candidates"
          ? candidatesTable
          : table === "jobs"
            ? jobsTable
            : table === "candidate_jobs"
              ? candidateJobsTable
              : table === "audit_events"
                ? auditEventsTable
                : table === "background_jobs"
                  ? backgroundJobsTable
                  : [];
      const filters: Array<(r: Row) => boolean> = [];
      let insertRow: Row | null = null;
      let updatePatch: Row | null = null;
      let range: { from: number; to: number } | null = null;
      let orderCol = "created_at";
      let orderAsc = false;

      const applyFilters = () => store.filter((r) => filters.every((f) => f(r)));

      const candidateEmailConflict = (candidate: Row, ignoreId?: unknown) => {
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

      const candidateJobConflict = (row: Row) =>
        store.some(
          (r) =>
            r.candidate_id === row.candidate_id && r.job_id === row.job_id,
        );

      const backgroundJobConflict = (row: Row) => {
        const key = row.idempotency_key;
        if (typeof key !== "string" || !key) return false;
        return store.some(
          (r) => r.team_id === row.team_id && r.idempotency_key === key,
        );
      };

      const finishInsert = () => {
        if (!insertRow) return { data: null, error: null };
        if (table === "candidates" && candidateEmailConflict(insertRow)) {
          return {
            data: null,
            error: {
              code: "23505",
              message: "candidates_team_lower_email_active_uidx",
            },
          };
        }
        if (table === "candidate_jobs" && candidateJobConflict(insertRow)) {
          return {
            data: null,
            error: {
              code: "23505",
              message: "candidate_jobs candidate_id job_id",
            },
          };
        }
        if (table === "background_jobs" && backgroundJobConflict(insertRow)) {
          return {
            data: null,
            error: {
              code: "23505",
              message: "background_jobs_team_idempotency_uidx",
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
        if (table === "candidates") {
          row.skills = row.skills ?? [];
          row.source_metadata = row.source_metadata ?? {};
          row.consent_status = row.consent_status ?? "owner_imported";
        }
        if (table === "candidate_jobs") {
          row.stage = row.stage ?? "new";
          row.data_quality = row.data_quality ?? "pending";
          row.match_score = row.match_score ?? null;
        }
        if (table === "background_jobs") {
          row.status = row.status ?? "queued";
          row.payload = row.payload ?? {};
          row.progress = row.progress ?? {};
          row.attempts = row.attempts ?? 0;
        }
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
          filters.push((r) => columnValue(r, col) === val);
          return chain;
        },
        is(col: string, val: unknown) {
          filters.push((r) => (val === null ? r[col] == null : r[col] === val));
          return chain;
        },
        in(col: string, vals: unknown[]) {
          filters.push((r) => vals.includes(r[col]));
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

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  githubCalls.push(url);
  if (url.includes("/search") || url.includes("/followers") || url.includes("/repos")) {
    throw new Error(`forbidden GitHub URL: ${url}`);
  }
  return new Response(JSON.stringify(githubBody), {
    status: githubStatus,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

function postJson(POST: (r: Request) => Promise<Response>, body: Record<string, unknown>) {
  return POST(
    new Request(FROM_SOURCE_URL, {
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

function seedJob(partial: Row): Row {
  const now = new Date().toISOString();
  idSeq += 1;
  const row: Row = {
    id: partial.id ?? `jobs-${idSeq}`,
    team_id: TEAM_ID,
    workspace_id: WORKSPACE_ID,
    title: "Engineer",
    description: null,
    status: "open",
    required_skills: [],
    preferred_skills: [],
    experience_min_years: null,
    experience_max_years: null,
    seniority: null,
    location: null,
    remote_policy: null,
    scoring_weights: {},
    scoring_weights_version: 1,
    archived_at: null,
    created_at: now,
    updated_at: now,
    ...partial,
  };
  jobsTable.push(row);
  return row;
}

function seedDefaultJob(): void {
  seedJob({ id: JOB_ID, title: "Backend Engineer" });
  seedJob({
    id: OTHER_JOB_ID,
    team_id: OTHER_TEAM_ID,
    title: "Other team job",
  });
  seedJob({
    id: ARCHIVED_JOB_ID,
    title: "Archived role",
    archived_at: new Date().toISOString(),
  });
}

function seedCandidate(partial: Row): Row {
  const now = new Date().toISOString();
  idSeq += 1;
  const row: Row = {
    id: partial.id ?? `candidates-${idSeq}`,
    team_id: TEAM_ID,
    workspace_id: WORKSPACE_ID,
    full_name: "Seed",
    email: null,
    phone: null,
    headline: null,
    current_role: null,
    experience_years: null,
    skills: [],
    location: null,
    source: "github",
    source_url: "https://github.com/octocat",
    source_metadata: { adapter: "github", external_id: "octocat" },
    consent_status: "owner_imported",
    notes: null,
    archived_at: null,
    created_at: now,
    updated_at: now,
    ...partial,
  };
  candidatesTable.push(row);
  return row;
}

(async () => {
  const route = await import("@/app/api/people/candidates/from-source/route");

  await check("unauthorized returns 401", async () => {
    authMode = "unauthorized";
    const res = await postJson(route.POST, {
      source: "github",
      ref: "octocat",
      consent_status: "owner_imported",
    });
    assert(res.status === 401, `status ${res.status}`);
    assert(candidatesTable.length === 0, "no write");
    assert(githubCalls.length === 0, "no GitHub call");
  });

  await check("missing tenant returns 403", async () => {
    authMode = "no_tenant";
    const res = await postJson(route.POST, {
      source: "github",
      ref: "octocat",
      consent_status: "owner_imported",
    });
    assert(res.status === 403, `status ${res.status}`);
    assert(candidatesTable.length === 0, "no write");
  });

  await check("rejects source_metadata and extra fields", async () => {
    const res = await postJson(route.POST, {
      source: "github",
      ref: "octocat",
      consent_status: "owner_imported",
      source_metadata: { scraped: true },
    });
    assert(res.status === 400, `status ${res.status}`);
    assert(candidatesTable.length === 0, "no write");
    assert(githubCalls.length === 0, "no GitHub call");
  });

  await check("rejects search and repo refs before fetch", async () => {
    const search = await postJson(route.POST, {
      source: "github",
      ref: "https://github.com/search?q=octocat",
      consent_status: "owner_imported",
    });
    assert(search.status === 400, `search status ${search.status}`);

    const repo = await postJson(route.POST, {
      source: "github",
      ref: "https://github.com/octocat/Hello-World",
      consent_status: "owner_imported",
    });
    assert(repo.status === 400, `repo status ${repo.status}`);
    assert(githubCalls.length === 0, "parseRef fails closed");
  });

  await check("rejects csv/manual source and candidate_applied", async () => {
    const csv = await postJson(route.POST, {
      source: "csv",
      ref: "octocat",
      consent_status: "owner_imported",
    });
    assert(csv.status === 400, `csv status ${csv.status}`);

    const applied = await postJson(route.POST, {
      source: "github",
      ref: "octocat",
      consent_status: "candidate_applied",
    });
    assert(applied.status === 400, `applied status ${applied.status}`);
    assert(githubCalls.length === 0, "no fetch for rejected bodies");
  });

  await check("fetches Users API and persists with founder consent", async () => {
    githubBody = {
      login: "octocat",
      id: 1,
      name: "The Octocat",
      email: "octocat@users.noreply.github.com",
      consent_status: "candidate_applied",
      bio: "GitHub mascot",
      location: "San Francisco",
      html_url: "https://github.com/octocat",
    };
    const res = await postJson(route.POST, {
      source: "github",
      ref: "https://github.com/octocat",
      consent_status: "owner_imported",
    });
    const json = (await res.json()) as {
      data?: Row;
      created?: boolean;
      attached?: boolean;
      error?: string;
    };
    assert(res.status === 201, `status ${res.status} ${json.error ?? ""}`);
    assert(json.created === true, "created");
    assert(json.attached === false, "no job");
    assert(githubCalls.length === 1, "one fetch");
    assert(githubCalls[0] === `${GITHUB_USERS_API}/octocat`, githubCalls[0] ?? "missing url");
    assert(candidatesTable.length === 1, "one candidate");
    const row = candidatesTable[0];
    assert(row.team_id === TEAM_ID, "tenant from context");
    assert(row.full_name === "The Octocat", "name");
    assert(row.email == null, "noreply dropped");
    assert(row.consent_status === "owner_imported", "consent from body");
    assert(row.source === "github", "source");
    const meta = row.source_metadata as Row;
    assert(meta.external_id === "octocat", "external_id");
    assert(meta.github_id === 1, "github_id");
    assert(row.skills && (row.skills as unknown[]).length === 0, "no invented skills");
    assert(row.experience_years == null, "no invented years");
  });

  await check("maps GitHub 404 and 403", async () => {
    githubStatus = 404;
    const missing = await postJson(route.POST, {
      source: "github",
      ref: "octocat",
      consent_status: "owner_imported",
    });
    const missingJson = (await missing.json()) as { error?: string };
    assert(missing.status === 404, `404 status ${missing.status}`);
    assert(missingJson.error === "GitHub user not found", missingJson.error ?? "");
    assert(candidatesTable.length === 0, "no write on 404");

    resetState();
    githubStatus = 403;
    const limited = await postJson(route.POST, {
      source: "github",
      ref: "octocat",
      consent_status: "unknown",
    });
    const limitedJson = (await limited.json()) as { error?: string };
    assert(limited.status === 403, `403 status ${limited.status}`);
    assert(limitedJson.error === "GitHub rate limited", limitedJson.error ?? "");
    assert(candidatesTable.length === 0, "no write on 403");
  });

  await check("optional job_id attaches at stage new and enqueues match", async () => {
    const res = await postJson(route.POST, {
      source: "github",
      ref: "octocat",
      consent_status: "owner_imported",
      job_id: JOB_ID,
    });
    const json = (await res.json()) as {
      created?: boolean;
      attached?: boolean;
      error?: string;
    };
    assert(res.status === 201, `status ${res.status} ${json.error ?? ""}`);
    assert(json.created === true, "created");
    assert(json.attached === true, "attached");
    assert(candidateJobsTable.length === 1, "one link");
    assert(candidateJobsTable[0].stage === "new", "stage new");
    assert(candidateJobsTable[0].job_id === JOB_ID, "job");
    assert(candidateJobsTable[0].match_score == null, "no score");
    assert(backgroundJobsTable.length === 1, "match enqueued");
    assert(backgroundJobsTable[0].kind === "people.match", "kind");
  });

  await check("missing and archived jobs return 404", async () => {
    const missing = await postJson(route.POST, {
      source: "github",
      ref: "octocat",
      consent_status: "owner_imported",
      job_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    assert(missing.status === 404, `missing ${missing.status}`);
    assert(githubCalls.length === 0, "no fetch for missing job");
    assert(candidatesTable.length === 0, "no candidate on missing job");

    resetState();
    const archived = await postJson(route.POST, {
      source: "github",
      ref: "octocat",
      consent_status: "owner_imported",
      job_id: ARCHIVED_JOB_ID,
    });
    assert(archived.status === 404, `archived ${archived.status}`);
    assert(candidatesTable.length === 0, "no candidate on archived job");
    assert(candidateJobsTable.length === 0, "no link on archived");
  });

  await check("second import of same login is idempotent", async () => {
    const first = await postJson(route.POST, {
      source: "github",
      ref: "octocat",
      consent_status: "owner_imported",
    });
    assert(first.status === 201, `first ${first.status}`);
    const existing = candidatesTable[0];
    existing.full_name = "Founder Edited";
    existing.consent_status = "unknown";

    const second = await postJson(route.POST, {
      source: "github",
      ref: "OctoCat",
      consent_status: "owner_imported",
      job_id: JOB_ID,
    });
    const json = (await second.json()) as {
      data?: Row;
      created?: boolean;
      attached?: boolean;
      error?: string;
    };
    assert(second.status === 200, `second ${second.status} ${json.error ?? ""}`);
    assert(json.created === false, "not created");
    assert(json.attached === true, "attached on reuse");
    assert(candidatesTable.length === 1, "still one candidate");
    assert(candidatesTable[0].full_name === "Founder Edited", "no overwrite");
    assert(candidatesTable[0].consent_status === "unknown", "consent kept");
    assert(json.data?.id === existing.id, "same id");
  });

  await check("other-team GitHub login is not reused", async () => {
    seedCandidate({
      team_id: OTHER_TEAM_ID,
      full_name: "Other Octocat",
      source_metadata: { adapter: "github", external_id: "octocat" },
    });
    const res = await postJson(route.POST, {
      source: "github",
      ref: "octocat",
      consent_status: "owner_imported",
    });
    assert(res.status === 201, `status ${res.status}`);
    const mine = candidatesTable.filter((r) => r.team_id === TEAM_ID);
    const theirs = candidatesTable.filter((r) => r.team_id === OTHER_TEAM_ID);
    assert(mine.length === 1, "created for this team");
    assert(theirs.length === 1, "other team untouched");
    assert(mine[0].full_name === "The Octocat", "this team name");
    assert(theirs[0].full_name === "Other Octocat", "other name kept");
  });

  globalThis.fetch = origFetch;
  console.log(`\npeople-from-source: ${passed} checks passed`);
})().catch((err) => {
  globalThis.fetch = origFetch;
  console.error(err);
  process.exit(1);
});
