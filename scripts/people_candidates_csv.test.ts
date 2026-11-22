/**
 * Wave 1 C3 — Candidate CSV import onto a job (mocked tenant + supabase).
 * Run: npx tsx scripts/people_candidates_csv.test.ts  (or `npm run test:people-candidates-csv`)
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
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_JOB_ID = "44444444-4444-4444-8444-444444444444";
const ARCHIVED_JOB_ID = "55555555-5555-4555-8555-555555555555";

type Row = Record<string, unknown>;
type AuthMode = "ok" | "unauthorized" | "no_tenant";

const candidatesTable: Row[] = [];
const jobsTable: Row[] = [];
const candidateJobsTable: Row[] = [];
const auditEventsTable: Row[] = [];
const backgroundJobsTable: Row[] = [];
let authMode: AuthMode = "ok";
let idSeq = 0;

function resetState(): void {
  candidatesTable.length = 0;
  jobsTable.length = 0;
  candidateJobsTable.length = 0;
  auditEventsTable.length = 0;
  backgroundJobsTable.length = 0;
  authMode = "ok";
  idSeq = 0;
  seedDefaultJob();
}

function jsonResponse(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function candidateEmailConflict(candidate: Row, ignoreId?: unknown): boolean {
  const email = candidate.email;
  if (typeof email !== "string" || !email) return false;
  const teamId = candidate.team_id;
  const lower = email.toLowerCase();
  return candidatesTable.some(
    (r) =>
      r.id !== ignoreId &&
      r.team_id === teamId &&
      typeof r.email === "string" &&
      r.email.toLowerCase() === lower &&
      r.archived_at == null,
  );
}

function candidateJobConflict(row: Row): boolean {
  return candidateJobsTable.some(
    (r) =>
      r.candidate_id === row.candidate_id && r.job_id === row.job_id,
  );
}

function backgroundJobConflict(row: Row): boolean {
  const key = row.idempotency_key;
  if (typeof key !== "string" || !key) return false;
  return backgroundJobsTable.some(
    (r) => r.team_id === row.team_id && r.idempotency_key === key,
  );
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
        const next = { ...hit, ...updatePatch };
        if (table === "candidates" && candidateEmailConflict(next, hit.id)) {
          return {
            data: null,
            error: {
              code: "23505",
              message: "candidates_team_lower_email_active_uidx",
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
    source: null,
    source_url: null,
    source_metadata: {},
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
  const preview = await import(
    "@/app/api/people/candidates/import/preview/route"
  );
  const commit = await import("@/app/api/people/candidates/import/route");
  const exported = await import("@/app/api/people/candidates/export/route");

  const previewUrl = "https://example.com/api/people/candidates/import/preview";
  const importUrl = "https://example.com/api/people/candidates/import";
  const exportUrl = "https://example.com/api/people/candidates/export";

  await check("preview maps candidate aliases and does not write", async () => {
    const res = await postJson(preview.POST, previewUrl, {
      job_id: JOB_ID,
      csv:
        "Name,Title,Years of experience,Skills\n" +
        "Ada Lovelace,Engineer,5,Python; SQL\n",
    });
    const json = (await res.json()) as {
      ok?: boolean;
      mapping?: Record<string, string>;
      summary?: { imported: number };
      error?: string;
    };
    assert(res.status === 200, `status ${res.status} ${json.error ?? ""}`);
    assert(json.ok === true, "ok");
    assert(json.mapping?.Name === "full_name", "mapped name");
    assert(json.mapping?.Title === "current_role", "mapped role");
    assert(json.mapping?.["Years of experience"] === "experience_years", "yoe");
    assert(json.mapping?.Skills === "skills", "skills");
    assert(json.summary?.imported === 1, "preview counts import");
    assert(candidatesTable.length === 0, "preview must not write candidates");
    assert(candidateJobsTable.length === 0, "preview must not write links");
    assert(auditEventsTable.length === 0, "preview must not write audit");
  });

  await check("new email creates candidate and candidate_jobs at stage new", async () => {
    const res = await postJson(commit.POST, importUrl, {
      job_id: JOB_ID,
      csv: "full_name,email\nGrace Hopper,grace@example.com\n",
    });
    const json = (await res.json()) as {
      ok?: boolean;
      summary?: { imported: number };
      attached?: number;
      error?: string;
    };
    assert(res.status === 200, `status ${res.status} ${json.error ?? ""}`);
    assert(json.summary?.imported === 1, "imported");
    assert(json.attached === 1, "attached");
    assert(candidatesTable.length === 1, "one candidate");
    assert(candidateJobsTable.length === 1, "one link");
    const link = candidateJobsTable[0];
    assert(link.stage === "new", "stage new");
    assert(link.match_score == null, "no score");
    assert(link.data_quality === "pending", "pending quality");
    assert(link.job_id === JOB_ID, "correct job");
    assert(backgroundJobsTable.length === 1, "match job enqueued");
    assert(backgroundJobsTable[0].kind === "people.match", "people.match kind");
    assert(
      backgroundJobsTable[0].idempotency_key === `people.match:${JOB_ID}`,
      "idempotency key",
    );
  });

  await check("existing email updates candidate; re-import does not duplicate link", async () => {
    const existing = seedCandidate({
      full_name: "Ada",
      email: "ada@example.com",
      headline: "Old",
    });
    candidateJobsTable.push({
      id: "cj-1",
      team_id: TEAM_ID,
      workspace_id: WORKSPACE_ID,
      candidate_id: existing.id,
      job_id: JOB_ID,
      stage: "new",
      data_quality: "pending",
      match_score: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res = await postJson(commit.POST, importUrl, {
      job_id: JOB_ID,
      csv: "full_name,email,headline\nAda Lovelace,ada@example.com,Mathematician\n",
    });
    const json = (await res.json()) as {
      summary?: { updated: number; imported: number };
      attached?: number;
      error?: string;
    };
    assert(res.status === 200, `status ${res.status} ${json.error ?? ""}`);
    assert(json.summary?.updated === 1, "updated");
    assert(json.summary?.imported === 0, "no new import");
    assert(json.attached === 0, "no duplicate attach");
    assert(candidatesTable.length === 1, "still one candidate");
    assert(candidateJobsTable.length === 1, "still one link");
    assert(backgroundJobsTable.length === 1, "match job enqueued once");
    const ada = candidatesTable[0];
    assert(ada.full_name === "Ada Lovelace", "name updated");
    assert(ada.headline === "Mathematician", "headline updated");
  });

  await check("same email twice in file yields duplicate row", async () => {
    const res = await postJson(commit.POST, importUrl, {
      job_id: JOB_ID,
      csv:
        "full_name,email\n" +
        "Ada Lovelace,ada@example.com\n" +
        "Ada Again,ada@example.com\n",
    });
    const json = (await res.json()) as {
      summary?: { imported: number; duplicates: number };
      error?: string;
    };
    assert(res.status === 200, `status ${res.status} ${json.error ?? ""}`);
    assert(json.summary?.imported === 1, "one import");
    assert(json.summary?.duplicates === 1, "one duplicate");
    assert(candidatesTable.length === 1, "one candidate stored");
    assert(candidateJobsTable.length === 1, "one link");
  });

  await check("name-only sparse row imports without email", async () => {
    const res = await postJson(commit.POST, importUrl, {
      job_id: JOB_ID,
      csv: "full_name\nMystery Applicant\n",
    });
    const json = (await res.json()) as {
      summary?: { imported: number };
      attached?: number;
      error?: string;
    };
    assert(res.status === 200, `status ${res.status} ${json.error ?? ""}`);
    assert(json.summary?.imported === 1, "imported sparse");
    assert(json.attached === 1, "attached sparse");
    assert(candidatesTable.length === 1, "sparse candidate");
    assert(candidatesTable[0].email == null, "no email");
  });

  await check("missing job_id returns 400", async () => {
    const res = await postJson(commit.POST, importUrl, {
      csv: "full_name,email\nAda,ada@example.com\n",
    });
    const json = (await res.json()) as { error?: string };
    assert(res.status === 400, `status ${res.status}`);
    assert(/job_id/i.test(json.error ?? ""), `error ${json.error}`);
    assert(candidatesTable.length === 0, "no writes");
  });

  await check("other-team job returns 404", async () => {
    const res = await postJson(commit.POST, importUrl, {
      job_id: OTHER_JOB_ID,
      csv: "full_name,email\nAda,ada@example.com\n",
    });
    const json = (await res.json()) as { error?: string };
    assert(res.status === 404, `status ${res.status}`);
    assert(candidatesTable.length === 0, "no writes");
  });

  await check("archived job returns 400", async () => {
    const res = await postJson(commit.POST, importUrl, {
      job_id: ARCHIVED_JOB_ID,
      csv: "full_name,email\nAda,ada@example.com\n",
    });
    const json = (await res.json()) as { error?: string };
    assert(res.status === 400, `status ${res.status}`);
    assert(/archived/i.test(json.error ?? ""), `error ${json.error}`);
    assert(candidatesTable.length === 0, "no writes");
  });

  await check("import rejects client team_id", async () => {
    const res = await postJson(commit.POST, importUrl, {
      job_id: JOB_ID,
      team_id: OTHER_TEAM_ID,
      csv: "full_name,email\nAda,ada@example.com\n",
    });
    assert(res.status === 400, `status ${res.status}`);
    assert(candidatesTable.length === 0, "no write on extra fields");
  });

  await check("over-cap CSV is rejected with no writes", async () => {
    const lines = ["full_name,email"];
    for (let i = 0; i < CSV_IMPORT_MAX_ROWS + 1; i += 1) {
      lines.push(`Person ${i},p${i}@example.com`);
    }
    const res = await postJson(commit.POST, importUrl, {
      job_id: JOB_ID,
      csv: `${lines.join("\n")}\n`,
    });
    const json = (await res.json()) as { error?: string };
    assert(res.status === 400, `status ${res.status}`);
    assert(/row limit/i.test(json.error ?? ""), `error ${json.error}`);
    assert(candidatesTable.length === 0, "no writes over cap");
  });

  await check("over 1 MB CSV returns 413", async () => {
    const csv = `full_name,notes\nAda,${"n".repeat(1_000_000)}\n`;
    const res = await postJson(commit.POST, importUrl, { job_id: JOB_ID, csv });
    const json = (await res.json()) as { error?: string };
    assert(res.status === 413, `status ${res.status}`);
    assert(/1 MB/i.test(json.error ?? ""), `error ${json.error}`);
    assert(candidatesTable.length === 0, "no writes over size");
  });

  await check("partial success keeps good rows and reports the failed row", async () => {
    const res = await postJson(commit.POST, importUrl, {
      job_id: JOB_ID,
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
    assert(json.errors?.some((e) => e.row === 3), "row 3 in errors");
    assert(candidatesTable.length === 2, "two candidates stored");
    assert(candidateJobsTable.length === 2, "two links");
  });

  await check("=CMD formula cells fail the candidate import row", async () => {
    const res = await postJson(preview.POST, previewUrl, {
      job_id: JOB_ID,
      csv: "full_name,email,notes\nAda Lovelace,ada@example.com,=CMD\n",
    });
    const json = (await res.json()) as {
      summary?: { failed: number };
      errors?: Array<{ message: string }>;
      error?: string;
    };
    assert(res.status === 200, `status ${res.status} ${json.error ?? ""}`);
    assert(json.summary?.failed === 1, `failed ${json.summary?.failed}`);
    assert(
      json.errors?.some((e) => /formula/i.test(e.message)),
      "formula error message",
    );
    assert(candidatesTable.length === 0, "preview does not write");
  });

  await check("export omits archived and other-team rows; formula cells escaped", async () => {
    seedCandidate({
      full_name: "Ada Lovelace",
      email: "ada@example.com",
      notes: "=CMD",
    });
    seedCandidate({
      full_name: "Archived One",
      email: "arch@example.com",
      archived_at: new Date().toISOString(),
    });
    seedCandidate({
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
      job_id: JOB_ID,
      csv: "full_name,email\nAda Lovelace,ada@example.com\n",
    });
    assert(res.status === 401, `status ${res.status}`);
    assert(candidatesTable.length === 0, "no write when unauthorized");
  });

  await check("import audit stores counts without PII", async () => {
    const res = await postJson(commit.POST, importUrl, {
      job_id: JOB_ID,
      csv: "full_name,email\nAda Lovelace,ada@example.com\n",
    });
    assert(res.status === 200, `status ${res.status}`);
    const audit = auditEventsTable.find(
      (e) => e.action === "import" && e.entity_type === "candidate_csv",
    );
    assert(audit, "audit row");
    assert(audit.entity_id === JOB_ID, "job id on audit");
    const meta = (audit.metadata ?? {}) as Record<string, unknown>;
    assert(meta.imported === 1, "imported in audit");
    assert(meta.attached === 1, "attached in audit");
    assert(!("email" in meta), "no email in audit metadata");
  });

  console.log(`\npeople-candidates-csv: ${passed} checks passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
