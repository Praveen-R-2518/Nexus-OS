/**
 * Wave 1 C2 — Candidate API (mocked tenant + supabase).
 * Run: npx tsx scripts/people_candidates_api.test.ts  (or `npm run test:people-candidates`)
 *
 * Proves:
 *  1. Create stamps team/workspace from context, never from the body.
 *  2. Sparse create (name only) succeeds; skills default []; consent owner_imported.
 *  3. Extra fields (team_id, match_score, source_metadata) are rejected with 400.
 *  3b. persistNormalizedCandidate stores adapter source_metadata (HTTP still rejects it).
 *  4. Invalid consent_status / experience_years → 400; duplicate email → 409.
 *  5. List is team-scoped; archive hides unless include_archived and is audited.
 *  6. Unauthorized → 401; missing tenant → 403; missing id → 404.
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

const candidatesTable: Row[] = [];
const auditEventsTable: Row[] = [];
let authMode: AuthMode = "ok";
let idSeq = 0;

function resetState(): void {
  candidatesTable.length = 0;
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
        table === "candidates"
          ? candidatesTable
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
        if (table === "candidates" && uniqueConflict(insertRow)) {
          return {
            data: null,
            error: {
              code: "23505",
              message: "candidates_team_lower_email_active_uidx",
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
          skills: [],
          source_metadata: {},
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
        if (table === "candidates" && uniqueConflict(next, hit.id)) {
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
              const headline = String(r.headline ?? "").toLowerCase();
              const role = String(r.current_role ?? "").toLowerCase();
              return (
                name.includes(term) ||
                email.includes(term) ||
                headline.includes(term) ||
                role.includes(term)
              );
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
    new Request("https://example.com/api/people/candidates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function getList(GET: (r: Request) => Promise<Response>, search = "") {
  return GET(new Request(`https://example.com/api/people/candidates${search}`));
}

function getOne(
  GET: (r: Request, ctx: { params: { id: string } }) => Promise<Response>,
  id: string,
) {
  return GET(new Request(`https://example.com/api/people/candidates/${id}`), {
    params: { id },
  });
}

function patchOne(
  PATCH: (r: Request, ctx: { params: { id: string } }) => Promise<Response>,
  id: string,
  body: Record<string, unknown>,
) {
  return PATCH(
    new Request(`https://example.com/api/people/candidates/${id}`, {
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
  const collection = await import("@/app/api/people/candidates/route");
  const item = await import("@/app/api/people/candidates/[id]/route");
  const { persistNormalizedCandidate } = await import("@/lib/people/candidates");

  await check("create stamps tenant; omitted consent is owner_imported", async () => {
    const res = await post(collection.POST, { full_name: "Ada Lovelace" });
    const json = (await res.json()) as { data: Row; error?: string };
    assert(res.status === 201, `status ${res.status} ${json.error ?? ""}`);
    assert(json.data.full_name === "Ada Lovelace", "name stored");
    assert(json.data.team_id === TEAM_ID, "team_id from context");
    assert(json.data.workspace_id === WORKSPACE_ID, "workspace_id from context");
    assert(json.data.consent_status === "owner_imported", "default consent");
    assert(Array.isArray(json.data.skills) && json.data.skills.length === 0, "skills []");
    assert(json.data.email == null, "email optional");
    assert(
      JSON.stringify(json.data.source_metadata) === "{}",
      "source_metadata empty object",
    );
    assert(candidatesTable.length === 1, "one candidate row");
    assert(
      auditEventsTable.some(
        (e) => e.action === "create" && e.entity_type === "candidate",
      ),
      "create audited",
    );
  });

  await check("sparse create accepts optional fields without scores", async () => {
    const res = await post(collection.POST, {
      full_name: "Grace Hopper",
      headline: "Compiler pioneer",
      skills: ["cobol", "navy"],
      experience_years: 12,
    });
    const json = (await res.json()) as { data: Row; error?: string };
    assert(res.status === 201, `status ${res.status} ${json.error ?? ""}`);
    assert(json.data.headline === "Compiler pioneer", "headline stored");
    assert(
      JSON.stringify(json.data.skills) === JSON.stringify(["cobol", "navy"]),
      "skills stored",
    );
    assert(json.data.experience_years === 12, "years stored");
    assert(!("match_score" in json.data) || json.data.match_score == null, "no score");
  });

  await check("list is team-scoped", async () => {
    const created = await post(collection.POST, { full_name: "Ours" });
    assert(created.status === 201, "seed own candidate");
    candidatesTable.push({
      id: "other-1",
      team_id: OTHER_TEAM_ID,
      workspace_id: WORKSPACE_ID,
      full_name: "Other Team",
      email: null,
      consent_status: "unknown",
      skills: [],
      source_metadata: {},
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

  await check("rejects extra fields including team_id, match_score, source_metadata", async () => {
    const team = await post(collection.POST, {
      full_name: "Injected",
      team_id: OTHER_TEAM_ID,
    });
    const teamJson = (await team.json()) as { error?: string };
    assert(team.status === 400, `status ${team.status}`);
    assert(
      typeof teamJson.error === "string" && teamJson.error.includes("team_id"),
      teamJson.error ?? "",
    );
    assert(candidatesTable.length === 0, "no write on team_id");

    const score = await post(collection.POST, {
      full_name: "Injected",
      match_score: 99,
    });
    const scoreJson = (await score.json()) as { error?: string };
    assert(score.status === 400, "match_score rejected");
    assert(
      typeof scoreJson.error === "string" && scoreJson.error.includes("match_score"),
      scoreJson.error ?? "",
    );
    assert(candidatesTable.length === 0, "no write on match_score");

    const meta = await post(collection.POST, {
      full_name: "Injected",
      source_metadata: { scraped: true },
    });
    const metaJson = (await meta.json()) as { error?: string };
    assert(meta.status === 400, "source_metadata rejected");
    assert(
      typeof metaJson.error === "string" &&
        metaJson.error.includes("source_metadata"),
      metaJson.error ?? "",
    );
    assert(candidatesTable.length === 0, "no write on source_metadata");
  });

  await check("persistNormalizedCandidate stores source_metadata; HTTP still rejects it", async () => {
    const ctx = {
      supabase: tenantSupabase(),
      teamId: TEAM_ID,
      workspaceId: WORKSPACE_ID,
      user: { id: USER_ID },
    };
    const result = await persistNormalizedCandidate(ctx, {
      full_name: "Mona Lisa",
      email: null,
      phone: null,
      headline: null,
      current_role: null,
      experience_years: null,
      skills: [],
      location: null,
      source: "github",
      source_url: "https://github.com/octocat",
      source_metadata: {
        adapter: "github",
        external_id: "octocat",
        github_id: 1,
      },
      consent_status: "unknown",
      notes: null,
      external_id: "octocat",
    });
    assert(result.ok, "persist ok");
    if (!result.ok) return;
    assert(result.data.source === "github", "source");
    assert(result.data.consent_status === "unknown", "consent");
    assert(result.data.source_metadata.external_id === "octocat", "metadata");
    assert(result.data.source_metadata.github_id === 1, "github_id");
    assert(
      auditEventsTable.some(
        (e) =>
          e.action === "create" &&
          e.entity_type === "candidate" &&
          e.entity_id === result.data.id,
      ),
      "create audited",
    );

    const http = await post(collection.POST, {
      full_name: "Injected",
      source_metadata: { scraped: true },
    });
    assert(http.status === 400, "HTTP still rejects source_metadata");
    assert(candidatesTable.length === 1, "HTTP reject did not insert");
  });

  await check("persistNormalizedCandidate rejects nested source_metadata", async () => {
    const ctx = {
      supabase: tenantSupabase(),
      teamId: TEAM_ID,
      workspaceId: WORKSPACE_ID,
      user: { id: USER_ID },
    };
    const result = await persistNormalizedCandidate(ctx, {
      full_name: "Bad Meta",
      email: null,
      phone: null,
      headline: null,
      current_role: null,
      experience_years: null,
      skills: [],
      location: null,
      source: "github",
      source_url: null,
      source_metadata: { adapter: "github", extra: { nested: true } } as never,
      consent_status: "unknown",
      notes: null,
      external_id: "octocat",
    });
    assert(!result.ok && result.status === 400, "nested metadata rejected");
    assert(candidatesTable.length === 0, "no write");
  });

  await check("invalid consent_status and experience_years rejected", async () => {
    const consent = await post(collection.POST, {
      full_name: "Bad Consent",
      consent_status: "implied",
    });
    assert(consent.status === 400, "invalid consent");
    assert(candidatesTable.length === 0, "no write on invalid consent");

    const years = await post(collection.POST, {
      full_name: "Bad Years",
      experience_years: 51,
    });
    assert(years.status === 400, "years over cap");
    assert(candidatesTable.length === 0, "no write on invalid years");

    const negative = await post(collection.POST, {
      full_name: "Neg Years",
      experience_years: -1,
    });
    assert(negative.status === 400, "negative years");
    assert(candidatesTable.length === 0, "no write on negative years");
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
    assert(candidatesTable.length === 1, "only one row stored");
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
    assert(
      auditEventsTable.some(
        (e) =>
          e.action === "archive" &&
          e.entity_type === "candidate" &&
          e.entity_id === id,
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
    const res = await post(collection.POST, { full_name: "Nope" });
    assert(res.status === 401, `status ${res.status}`);
    assert(candidatesTable.length === 0, "no write when unauthorized");
  });

  await check("missing tenant returns 403", async () => {
    authMode = "no_tenant";
    const res = await getList(collection.GET);
    assert(res.status === 403, `status ${res.status}`);
  });

  await check("GET missing id returns 404", async () => {
    const res = await getOne(item.GET, "missing-id");
    assert(res.status === 404, `status ${res.status}`);
  });

  console.log(`\npeople-candidates-api: ${passed} checks passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
