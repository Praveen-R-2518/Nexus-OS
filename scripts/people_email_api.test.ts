/**
 * Wave 1 F2 — People email generate / patch / send API (mocked tenant + transports).
 * Run: npx tsx scripts/people_email_api.test.ts
 */

import Module from "node:module";

process.env.AI_PROVIDER = "mock";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TEAM_ID = "99999999-9999-4999-8999-999999999999";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "user-1";
const EMP_OK = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMP_NO_EMAIL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAND_OK = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_DRAFT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const JOB_OK = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const JOB_TWO = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const CJ_NEW = "12121212-1212-4121-8121-121212121212";
const CJ_SHORT = "13131313-1313-4131-8131-131313131313";
const CJ_DECISION = "14141414-1414-4141-8141-141414141414";
const CJ_WRONG_CAND = "15151515-1515-4151-8151-151515151515";

type Row = Record<string, unknown>;
type AuthMode = "ok" | "unauthorized" | "no_tenant";
type GmailMode = "ok" | "none" | "fail";
type SmtpMode = "ok" | "none";

const employeesTable: Row[] = [];
const candidatesTable: Row[] = [];
const draftsTable: Row[] = [];
const auditEventsTable: Row[] = [];
const profilesTable: Row[] = [];
const jobsTable: Row[] = [];
const candidateJobsTable: Row[] = [];
const aiUsageTable: Row[] = [];
const gmailSendCalls: Row[] = [];
const smtpSendCalls: Row[] = [];

let authMode: AuthMode = "ok";
let gmailMode: GmailMode = "ok";
let smtpMode: SmtpMode = "ok";
let idSeq = 0;

function seedPeople(): void {
  employeesTable.push(
    {
      id: EMP_OK,
      team_id: TEAM_ID,
      workspace_id: WORKSPACE_ID,
      full_name: "Ada Lovelace",
      email: "ada@example.com",
      role_title: "Engineer",
      employment_status: "active",
      archived_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: EMP_NO_EMAIL,
      team_id: TEAM_ID,
      workspace_id: WORKSPACE_ID,
      full_name: "No Mail",
      email: null,
      role_title: "Analyst",
      employment_status: "active",
      archived_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  );
  candidatesTable.push({
    id: CAND_OK,
    team_id: TEAM_ID,
    workspace_id: WORKSPACE_ID,
    full_name: "Casey Candidate",
    email: "casey@example.com",
    current_role: "Designer",
    headline: "Product designer",
    consent_status: "unknown",
    notes: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });
  jobsTable.push(
    {
      id: JOB_OK,
      team_id: TEAM_ID,
      title: "Product Designer",
      archived_at: null,
    },
    {
      id: JOB_TWO,
      team_id: TEAM_ID,
      title: "Brand Designer",
      archived_at: null,
    },
  );
  candidateJobsTable.push(
    {
      id: CJ_NEW,
      team_id: TEAM_ID,
      candidate_id: CAND_OK,
      job_id: JOB_OK,
      stage: "new",
      assigned_to: null,
      match_score: null,
      match_components: null,
      match_weights_used: null,
      scoring_version: null,
      data_quality: "pending",
      insufficient_reason: null,
      ai_explanation: null,
      ai_model: null,
      ai_prompt_version: null,
      manual_rank_override: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: CJ_SHORT,
      team_id: TEAM_ID,
      candidate_id: CAND_OK,
      job_id: JOB_TWO,
      stage: "shortlisted",
      assigned_to: null,
      match_score: null,
      match_components: null,
      match_weights_used: null,
      scoring_version: null,
      data_quality: "pending",
      insufficient_reason: null,
      ai_explanation: null,
      ai_model: null,
      ai_prompt_version: null,
      manual_rank_override: null,
      created_at: "2026-01-02T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    },
    {
      id: CJ_DECISION,
      team_id: TEAM_ID,
      candidate_id: CAND_OK,
      job_id: JOB_OK,
      stage: "decision",
      assigned_to: null,
      match_score: null,
      match_components: null,
      match_weights_used: null,
      scoring_version: null,
      data_quality: "pending",
      insufficient_reason: null,
      ai_explanation: null,
      ai_model: null,
      ai_prompt_version: null,
      manual_rank_override: null,
      created_at: "2026-01-03T00:00:00Z",
      updated_at: "2026-01-03T00:00:00Z",
    },
    {
      id: CJ_WRONG_CAND,
      team_id: TEAM_ID,
      candidate_id: EMP_OK,
      job_id: JOB_OK,
      stage: "new",
      assigned_to: null,
      match_score: null,
      match_components: null,
      match_weights_used: null,
      scoring_version: null,
      data_quality: "pending",
      insufficient_reason: null,
      ai_explanation: null,
      ai_model: null,
      ai_prompt_version: null,
      manual_rank_override: null,
      created_at: "2026-01-04T00:00:00Z",
      updated_at: "2026-01-04T00:00:00Z",
    },
  );
  profilesTable.push({
    team_id: TEAM_ID,
    workspace_id: WORKSPACE_ID,
    name: "Acme",
    industry: "Technology",
    tone: "warm, concise, founder-led",
    services: ["Operations"],
  });
}

function resetState(): void {
  employeesTable.length = 0;
  candidatesTable.length = 0;
  draftsTable.length = 0;
  auditEventsTable.length = 0;
  profilesTable.length = 0;
  jobsTable.length = 0;
  candidateJobsTable.length = 0;
  aiUsageTable.length = 0;
  gmailSendCalls.length = 0;
  smtpSendCalls.length = 0;
  authMode = "ok";
  gmailMode = "ok";
  smtpMode = "ok";
  idSeq = 0;
  seedPeople();
}

function jsonResponse(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function storeFor(table: string): Row[] {
  if (table === "employees") return employeesTable;
  if (table === "candidates") return candidatesTable;
  if (table === "people_message_drafts") return draftsTable;
  if (table === "audit_events") return auditEventsTable;
  if (table === "business_profiles") return profilesTable;
  if (table === "jobs") return jobsTable;
  if (table === "candidate_jobs") return candidateJobsTable;
  if (table === "ai_usage") return aiUsageTable;
  return [];
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

function tenantSupabase() {
  return {
    from(table: string) {
      const store = storeFor(table);
      const filters: Array<(r: Row) => boolean> = [];
      let insertRow: Row | null = null;
      let updatePatch: Row | null = null;
      let isCandidateJobsJoin = false;

      const applyFilters = () => store.filter((r) => filters.every((f) => f(r)));

      const hydrate = (row: Row | null): Row | null => {
        if (!row) return null;
        if (table === "candidate_jobs" && isCandidateJobsJoin) {
          return attachCandidates([row])[0] ?? null;
        }
        return { ...row };
      };

      const finishInsert = () => {
        if (!insertRow) return { data: null, error: null };
        idSeq += 1;
        const now = new Date().toISOString();
        const row: Row = {
          id: insertRow.id ?? `${table}-${idSeq}`,
          created_at: now,
          updated_at: now,
          ...insertRow,
        };
        store.push(row);
        insertRow = null;
        return { data: { ...row }, error: null };
      };

      const finishUpdate = () => {
        const rows = applyFilters();
        if (!updatePatch) return { data: null, error: null };
        if (!rows[0]) {
          updatePatch = null;
          return {
            data: null,
            error: { code: "PGRST116", message: "not found" },
          };
        }
        Object.assign(rows[0], updatePatch, {
          updated_at: new Date().toISOString(),
        });
        const data = hydrate({ ...rows[0] });
        updatePatch = null;
        if (!data) {
          return { data: null, error: { message: "not found" } };
        }
        return { data, error: null };
      };

      const chain = {
        select(cols?: string) {
          if (table === "candidate_jobs" && typeof cols === "string") {
            isCandidateJobsJoin = cols.includes("candidates");
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
        gte(col: string, val: unknown) {
          filters.push((r) => String(r[col] ?? "") >= String(val));
          return chain;
        },
        limit() {
          return chain;
        },
        in(col: string, vals: unknown[]) {
          const set = new Set(vals);
          filters.push((r) => set.has(r[col]));
          return chain;
        },
        maybeSingle() {
          if (insertRow) return Promise.resolve(finishInsert());
          if (updatePatch) return Promise.resolve(finishUpdate());
          const rows = applyFilters();
          return Promise.resolve({
            data: hydrate(rows[0] ? { ...rows[0] } : null),
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
          const data = hydrate({ ...rows[0] });
          if (!data) {
            return Promise.resolve({
              data: null,
              error: { code: "PGRST116", message: "not found" },
            });
          }
          return Promise.resolve({ data, error: null });
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
          return Promise.resolve({
            data: applyFilters().map((r) => ({ ...r })),
            error: null,
          }).then(resolve, reject);
        },
      };
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
  if (request === "@/lib/gmail/credentials") {
    return {
      getWorkspaceGmailCredential: async () => {
        if (gmailMode === "none") {
          return { ok: false, error: "no_connected_credential" };
        }
        return {
          ok: true,
          credential: {
            id: "gmail-1",
            workspaceId: WORKSPACE_ID,
            teamId: TEAM_ID,
            emailAddress: "founder@example.com",
            accessToken: "token",
            tokenExpiry: new Date(Date.now() + 3600_000).toISOString(),
          },
        };
      },
    };
  }
  if (request === "@/lib/gmail/send") {
    return {
      sendGmailMessage: async (params: Row) => {
        if (gmailMode === "fail") {
          throw Object.assign(new Error("gmail down"), { status: 502 });
        }
        gmailSendCalls.push(params);
        return { messageId: "gmail-msg-1" };
      },
    };
  }
  if (request === "@/lib/mailbox/credentials") {
    return {
      getWorkspaceMailboxCredential: async () => {
        if (smtpMode === "none") {
          return { ok: false, error: "no_connected_credential" };
        }
        return {
          ok: true,
          credential: {
            id: "imap-1",
            workspaceId: WORKSPACE_ID,
            teamId: TEAM_ID,
            emailAddress: "mail@example.com",
            smtp: {
              host: "smtp.example.com",
              port: 587,
              tls: true,
              user: "mail@example.com",
              pass: "secret",
            },
          },
        };
      },
    };
  }
  if (request === "@/lib/mailbox/smtp-send") {
    return {
      sendSmtpMessage: async (params: Row) => {
        smtpSendCalls.push(params);
        return { messageId: "smtp-msg-1" };
      },
    };
  }
  return origLoad.apply(this, args);
};

const GENERATE_BODY = {
  recipient_type: "employee",
  recipient_id: EMP_OK,
  purpose: "follow_up",
  tone: "professional",
  situation: "Follow up on the start date conversation.",
};

function postGenerate(
  POST: (r: Request) => Promise<Response>,
  body: Record<string, unknown>,
) {
  return POST(
    new Request("https://example.com/api/people/email/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function patchDraft(
  PATCH: (r: Request, ctx: { params: { id: string } }) => Promise<Response>,
  id: string,
  body: Record<string, unknown>,
) {
  return PATCH(
    new Request(`https://example.com/api/people/email/drafts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id } },
  );
}

function postSend(
  POST: (r: Request, ctx: { params: { id: string } }) => Promise<Response>,
  id: string,
  body: Record<string, unknown> = {},
) {
  return POST(
    new Request(`https://example.com/api/people/email/drafts/${id}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id } },
  );
}

function getFollowUp(
  GET: (r: Request, ctx: { params: { id: string } }) => Promise<Response>,
  id: string,
) {
  return GET(
    new Request(`https://example.com/api/people/email/drafts/${id}/follow-up`, {
      method: "GET",
    }),
    { params: { id } },
  );
}

function postFollowUp(
  POST: (r: Request, ctx: { params: { id: string } }) => Promise<Response>,
  id: string,
  body: Record<string, unknown>,
) {
  return POST(
    new Request(`https://example.com/api/people/email/drafts/${id}/follow-up`, {
      method: "POST",
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
  const collection = await import("@/app/api/people/email/drafts/route");
  const item = await import("@/app/api/people/email/drafts/[id]/route");
  const send = await import("@/app/api/people/email/drafts/[id]/send/route");
  const followUp = await import(
    "@/app/api/people/email/drafts/[id]/follow-up/route"
  );

  await check("generate stamps tenant from context, not body", async () => {
    const res = await postGenerate(collection.POST, GENERATE_BODY);
    const json = (await res.json()) as { data: Row; error?: string };
    assert(res.status === 201, `status ${res.status} ${json.error ?? ""}`);
    assert(json.data.team_id === TEAM_ID, "team_id from context");
    assert(json.data.workspace_id === WORKSPACE_ID, "workspace_id from context");
    assert(json.data.status === "draft", "status draft");
    assert(json.data.recipient_email === "ada@example.com", "snapshot email");
    assert(typeof json.data.subject === "string" && json.data.subject, "subject");
    assert(typeof json.data.body === "string" && json.data.body, "body");
    assert(gmailSendCalls.length === 0, "generate must not send gmail");
    assert(smtpSendCalls.length === 0, "generate must not send smtp");
    assert(
      auditEventsTable.some(
        (e) => e.action === "generate" && e.entity_type === "people_message_draft",
      ),
      "generate audited",
    );
  });

  await check("generate returns 429 when monthly People AI budget is exceeded", async () => {
    const profile = profilesTable.find((row) => row.team_id === TEAM_ID);
    assert(profile, "seeded profile");
    profile.ai_monthly_token_budget = 10;
    aiUsageTable.push({
      team_id: TEAM_ID,
      input_tokens: 8,
      output_tokens: 4,
      created_at: new Date().toISOString(),
    });

    const res = await postGenerate(collection.POST, GENERATE_BODY);
    const json = (await res.json()) as { error?: string };
    assert(res.status === 429, `status ${res.status} ${json.error ?? ""}`);
    assert(/budget/i.test(json.error ?? ""), json.error ?? "");
    assert(draftsTable.length === 0, "no draft persisted");
    assert(gmailSendCalls.length === 0, "must not send");
  });

  await check("rejects extra fields including team_id", async () => {
    const res = await postGenerate(collection.POST, {
      ...GENERATE_BODY,
      team_id: OTHER_TEAM_ID,
    });
    const json = (await res.json()) as { error?: string };
    assert(res.status === 400, `status ${res.status}`);
    assert(typeof json.error === "string" && json.error.includes("team_id"), json.error ?? "");
    assert(draftsTable.length === 0, "no write on extra fields");
  });

  await check("recipient with no email is rejected", async () => {
    const res = await postGenerate(collection.POST, {
      ...GENERATE_BODY,
      recipient_id: EMP_NO_EMAIL,
    });
    assert(res.status === 400, `status ${res.status}`);
    assert(draftsTable.length === 0, "no draft without email");
  });

  await check("send uses stored draft and marks sent", async () => {
    const created = await postGenerate(collection.POST, GENERATE_BODY);
    const createdJson = (await created.json()) as { data: Row };
    const id = String(createdJson.data.id);

    const patched = await patchDraft(item.PATCH, id, {
      subject: "Updated subject",
      body: "Updated body for Ada.",
    });
    assert(patched.status === 200, `patch ${patched.status}`);

    const res = await postSend(send.POST, id, {});
    const json = (await res.json()) as { data: Row; error?: string };
    assert(res.status === 200, `status ${res.status} ${json.error ?? ""}`);
    assert(json.data.status === "sent", "status sent");
    assert(json.data.transport === "gmail", "gmail transport");
    assert(gmailSendCalls.length === 1, "gmail called once");
    assert(gmailSendCalls[0].to === "ada@example.com", "send to snapshot");
    assert(gmailSendCalls[0].subject === "Updated subject", "stored subject");
    assert(smtpSendCalls.length === 0, "smtp not used when gmail connected");
    assert(employeesTable[0].email === "ada@example.com", "employee email unchanged");
    assert(
      auditEventsTable.some(
        (e) => e.action === "send" && e.entity_id === id,
      ),
      "send audited",
    );
  });

  await check("failed send keeps draft and does not mutate people rows", async () => {
    const created = await postGenerate(collection.POST, GENERATE_BODY);
    const createdJson = (await created.json()) as { data: Row };
    const id = String(createdJson.data.id);
    const beforeEmployee = { ...employeesTable[0] };
    gmailMode = "fail";

    const res = await postSend(send.POST, id, {});
    const json = (await res.json()) as { error?: string };
    assert(res.status === 502, `status ${res.status} ${json.error ?? ""}`);
    assert(draftsTable[0].status === "draft", "status stays draft");
    assert(draftsTable[0].sent_at == null, "sent_at unset");
    assert(employeesTable[0].email === beforeEmployee.email, "employee email unchanged");
    assert(employeesTable[0].full_name === beforeEmployee.full_name, "employee name unchanged");
    assert(candidatesTable[0].email === "casey@example.com", "candidate unchanged");
  });

  await check("already sent returns 409 and does not resend", async () => {
    const created = await postGenerate(collection.POST, GENERATE_BODY);
    const createdJson = (await created.json()) as { data: Row };
    const id = String(createdJson.data.id);
    const first = await postSend(send.POST, id, {});
    assert(first.status === 200, "first send ok");
    assert(gmailSendCalls.length === 1, "one send");

    const second = await postSend(send.POST, id, {});
    assert(second.status === 409, `status ${second.status}`);
    assert(gmailSendCalls.length === 1, "no second transport call");
  });

  await check("missing draft or other team returns 404", async () => {
    const missing = await postSend(send.POST, OTHER_DRAFT, {});
    assert(missing.status === 404, `missing ${missing.status}`);

    draftsTable.push({
      id: OTHER_DRAFT,
      team_id: OTHER_TEAM_ID,
      workspace_id: WORKSPACE_ID,
      recipient_type: "employee",
      employee_id: EMP_OK,
      candidate_id: null,
      recipient_email: "other@example.com",
      subject: "Nope",
      body: "Nope",
      status: "draft",
    });
    const foreign = await postSend(send.POST, OTHER_DRAFT, {});
    assert(foreign.status === 404, `foreign ${foreign.status}`);
    assert(gmailSendCalls.length === 0, "foreign draft not sent");
  });

  await check("no mailbox returns 409 without sending", async () => {
    const created = await postGenerate(collection.POST, GENERATE_BODY);
    const createdJson = (await created.json()) as { data: Row };
    gmailMode = "none";
    smtpMode = "none";
    const res = await postSend(send.POST, String(createdJson.data.id), {});
    assert(res.status === 409, `status ${res.status}`);
    assert(gmailSendCalls.length === 0, "no gmail");
    assert(smtpSendCalls.length === 0, "no smtp");
    assert(draftsTable[0].status === "draft", "still draft");
  });

  await check("smtp fallback when gmail is not connected", async () => {
    const created = await postGenerate(collection.POST, GENERATE_BODY);
    const createdJson = (await created.json()) as { data: Row };
    gmailMode = "none";
    smtpMode = "ok";
    const res = await postSend(send.POST, String(createdJson.data.id), {});
    const json = (await res.json()) as { data: Row; error?: string };
    assert(res.status === 200, `status ${res.status} ${json.error ?? ""}`);
    assert(json.data.transport === "smtp", "smtp transport");
    assert(gmailSendCalls.length === 0, "gmail unused");
    assert(smtpSendCalls.length === 1, "smtp used");
  });

  await check("unauthorized returns 401", async () => {
    authMode = "unauthorized";
    const res = await postGenerate(collection.POST, GENERATE_BODY);
    assert(res.status === 401, `status ${res.status}`);
    assert(draftsTable.length === 0, "no write when unauthorized");
  });

  await check("missing tenant returns 403", async () => {
    authMode = "no_tenant";
    const res = await postGenerate(collection.POST, GENERATE_BODY);
    assert(res.status === 403, `status ${res.status}`);
  });

  await check("candidate generate uses candidate snapshot", async () => {
    const res = await postGenerate(collection.POST, {
      recipient_type: "candidate",
      recipient_id: CAND_OK,
      purpose: "outreach",
      tone: "warm",
      situation: "Invite Casey to a screening call next week.",
    });
    const json = (await res.json()) as { data: Row; error?: string };
    assert(res.status === 201, `status ${res.status} ${json.error ?? ""}`);
    assert(json.data.recipient_type === "candidate", "type");
    assert(json.data.candidate_id === CAND_OK, "candidate_id");
    assert(json.data.employee_id == null, "employee_id null");
    assert(json.data.recipient_email === "casey@example.com", "candidate email");
  });

  await check("unsent draft follow-up is 409 and does not mutate", async () => {
    const created = await postGenerate(collection.POST, GENERATE_BODY);
    const createdJson = (await created.json()) as { data: Row };
    const id = String(createdJson.data.id);
    const before = employeesTable[0].employment_status;

    const listed = await getFollowUp(followUp.GET, id);
    assert(listed.status === 409, `get ${listed.status}`);

    const applied = await postFollowUp(followUp.POST, id, {
      kind: "set_employment_status",
      employment_status: "resignation_pending",
    });
    assert(applied.status === 409, `post ${applied.status}`);
    assert(
      employeesTable[0].employment_status === before,
      "employee status unchanged",
    );
  });

  await check("failed send follow-up is 409 and employee stays active", async () => {
    const created = await postGenerate(collection.POST, GENERATE_BODY);
    const createdJson = (await created.json()) as { data: Row };
    gmailMode = "fail";
    const sentRes = await postSend(send.POST, String(createdJson.data.id), {});
    assert(sentRes.status === 502, "send failed");
    assert(employeesTable[0].employment_status === "active", "still active");

    const listed = await getFollowUp(followUp.GET, String(createdJson.data.id));
    assert(listed.status === 409, `get ${listed.status}`);
  });

  await check("sent employee proposes resignation_pending and apply audits", async () => {
    const created = await postGenerate(collection.POST, GENERATE_BODY);
    const createdJson = (await created.json()) as { data: Row };
    const id = String(createdJson.data.id);
    const sentRes = await postSend(send.POST, id, {});
    assert(sentRes.status === 200, "sent");
    assert(employeesTable[0].employment_status === "active", "send did not mutate status");

    const listed = await getFollowUp(followUp.GET, id);
    const listJson = (await listed.json()) as {
      data: { proposals: Row[] };
      error?: string;
    };
    assert(listed.status === 200, `get ${listed.status} ${listJson.error ?? ""}`);
    assert(listJson.data.proposals.length === 1, "one proposal");
    assert(listJson.data.proposals[0].kind === "set_employment_status", "kind");
    assert(
      listJson.data.proposals[0].employment_status === "resignation_pending",
      "next status",
    );

    const applied = await postFollowUp(followUp.POST, id, {
      kind: "set_employment_status",
      employment_status: "resignation_pending",
    });
    const appliedJson = (await applied.json()) as { data: Row; error?: string };
    assert(applied.status === 200, `post ${applied.status} ${appliedJson.error ?? ""}`);
    assert(appliedJson.data.skipped === false, "not skipped");
    assert(employeesTable[0].employment_status === "resignation_pending", "status applied");
    assert(
      auditEventsTable.some(
        (e) =>
          e.action === "follow_up" &&
          e.entity_type === "employee" &&
          (e.metadata as Row)?.draft_id === id,
      ),
      "follow_up audited",
    );
  });

  await check("sent resignation_pending employee proposes offboarded", async () => {
    employeesTable[0].employment_status = "resignation_pending";
    const created = await postGenerate(collection.POST, GENERATE_BODY);
    const createdJson = (await created.json()) as { data: Row };
    const id = String(createdJson.data.id);
    const sentRes = await postSend(send.POST, id, {});
    assert(sentRes.status === 200, "sent");

    const listed = await getFollowUp(followUp.GET, id);
    const listJson = (await listed.json()) as { data: { proposals: Row[] } };
    assert(listJson.data.proposals[0]?.employment_status === "offboarded", "offboarded");
  });

  await check("employment follow-up is idempotent when already at target", async () => {
    employeesTable[0].employment_status = "resignation_pending";
    const created = await postGenerate(collection.POST, GENERATE_BODY);
    const createdJson = (await created.json()) as { data: Row };
    const id = String(createdJson.data.id);
    await postSend(send.POST, id, {});

    const applied = await postFollowUp(followUp.POST, id, {
      kind: "set_employment_status",
      employment_status: "resignation_pending",
    });
    const json = (await applied.json()) as { data: Row; error?: string };
    assert(applied.status === 200, `status ${applied.status} ${json.error ?? ""}`);
    assert(json.data.skipped === true, "skipped");
    assert(employeesTable[0].employment_status === "resignation_pending", "unchanged");
  });

  await check("candidate follow-up proposes contacted and rejects decision", async () => {
    const created = await postGenerate(collection.POST, {
      recipient_type: "candidate",
      recipient_id: CAND_OK,
      purpose: "outreach",
      tone: "warm",
      situation: "Invite Casey to a screening call next week.",
    });
    const createdJson = (await created.json()) as { data: Row };
    const id = String(createdJson.data.id);
    const sentRes = await postSend(send.POST, id, {});
    assert(sentRes.status === 200, "sent");

    const listed = await getFollowUp(followUp.GET, id);
    const listJson = (await listed.json()) as { data: { proposals: Row[] } };
    const kinds = listJson.data.proposals.map((p) => p.candidate_job_id);
    assert(kinds.includes(CJ_NEW), "new proposed");
    assert(kinds.includes(CJ_SHORT), "shortlisted proposed");
    assert(!kinds.includes(CJ_DECISION), "decision not proposed");

    const decision = await postFollowUp(followUp.POST, id, {
      kind: "set_candidate_job_stage",
      candidate_job_id: CJ_DECISION,
      stage: "contacted",
    });
    assert(decision.status === 400, `decision ${decision.status}`);
    assert(
      candidateJobsTable.find((r) => r.id === CJ_DECISION)?.stage === "decision",
      "decision unchanged",
    );

    const wrong = await postFollowUp(followUp.POST, id, {
      kind: "set_candidate_job_stage",
      candidate_job_id: CJ_WRONG_CAND,
      stage: "contacted",
    });
    assert(wrong.status === 400, `wrong cand ${wrong.status}`);

    const applied = await postFollowUp(followUp.POST, id, {
      kind: "set_candidate_job_stage",
      candidate_job_id: CJ_NEW,
      stage: "contacted",
    });
    const appliedJson = (await applied.json()) as { data: Row; error?: string };
    assert(applied.status === 200, `post ${applied.status} ${appliedJson.error ?? ""}`);
    assert(candidateJobsTable.find((r) => r.id === CJ_NEW)?.stage === "contacted", "contacted");
    assert(
      auditEventsTable.some(
        (e) => e.action === "follow_up" && e.entity_type === "candidate_job",
      ),
      "stage follow_up audited",
    );
  });

  await check("candidate contacted follow-up is idempotent", async () => {
    const created = await postGenerate(collection.POST, {
      recipient_type: "candidate",
      recipient_id: CAND_OK,
      purpose: "outreach",
      tone: "warm",
      situation: "Invite Casey to a screening call next week.",
    });
    const createdJson = (await created.json()) as { data: Row };
    const id = String(createdJson.data.id);
    await postSend(send.POST, id, {});
    const cj = candidateJobsTable.find((r) => r.id === CJ_NEW);
    if (cj) cj.stage = "contacted";

    const applied = await postFollowUp(followUp.POST, id, {
      kind: "set_candidate_job_stage",
      candidate_job_id: CJ_NEW,
      stage: "contacted",
    });
    const json = (await applied.json()) as { data: Row; error?: string };
    assert(applied.status === 200, `status ${applied.status} ${json.error ?? ""}`);
    assert(json.data.skipped === true, "skipped");
  });

  await check("follow-up extra fields and unknown kind are 400", async () => {
    const created = await postGenerate(collection.POST, GENERATE_BODY);
    const createdJson = (await created.json()) as { data: Row };
    const id = String(createdJson.data.id);
    await postSend(send.POST, id, {});

    const extra = await postFollowUp(followUp.POST, id, {
      kind: "set_employment_status",
      employment_status: "resignation_pending",
      team_id: OTHER_TEAM_ID,
    });
    assert(extra.status === 400, `extra ${extra.status}`);
    assert(employeesTable[0].employment_status === "active", "no mutate on extra");

    const unknown = await postFollowUp(followUp.POST, id, {
      kind: "delete_employee",
    });
    assert(unknown.status === 400, `unknown ${unknown.status}`);
  });

  await check("follow-up other team draft is 404", async () => {
    draftsTable.push({
      id: OTHER_DRAFT,
      team_id: OTHER_TEAM_ID,
      workspace_id: WORKSPACE_ID,
      recipient_type: "employee",
      employee_id: EMP_OK,
      candidate_id: null,
      recipient_email: "other@example.com",
      subject: "Nope",
      body: "Nope",
      status: "sent",
    });
    const listed = await getFollowUp(followUp.GET, OTHER_DRAFT);
    assert(listed.status === 404, `get ${listed.status}`);
    const applied = await postFollowUp(followUp.POST, OTHER_DRAFT, {
      kind: "set_employment_status",
      employment_status: "resignation_pending",
    });
    assert(applied.status === 404, `post ${applied.status}`);
    assert(employeesTable[0].employment_status === "active", "foreign not applied");
  });

  console.log(`\npeople-email-api: ${passed} checks passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
