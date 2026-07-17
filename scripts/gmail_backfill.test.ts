/**
 * Gmail backfill worker tests (Task 3.4) for app/api/internal/n8n/gmail-backfill.
 * Run: npx tsx scripts/gmail_backfill.test.ts  (or `npm run test:gmail-backfill`)
 */

import Module from "node:module";

const TOKEN = "test-ingest-token";
const WS = "11111111-2222-4333-8444-555555555555";
const TEAM = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

type Row = Record<string, unknown> & { id: string };

const store: Record<string, Row[]> = {
  gmail_backfill_jobs: [
    {
      id: "job-1",
      workspace_id: WS,
      team_id: TEAM,
      status: "pending",
      after_date: new Date(Date.now() - 86_400_000 * 90).toISOString(),
      page_token: null,
      messages_fetched: 0,
      messages_forwarded: 0,
      last_error: null,
      created_at: new Date().toISOString(),
    },
  ],
  gmail_credentials: [
    {
      id: "cred-1",
      workspace_id: WS,
      team_id: TEAM,
      email_address: "inbox@test.dev",
      access_token_encrypted: "enc-at",
      refresh_token_encrypted: "enc-rt",
      token_expiry: new Date(Date.now() + 3_600_000).toISOString(),
      credential_type: "oauth",
      status: "connected",
      sync_enabled: true,
      updated_at: new Date().toISOString(),
    },
  ],
};

const forwards: unknown[] = [];

function makeClient() {
  return {
    from(table: string) {
      const rows = (store[table] ??= []);
      return {
        select() {
          const qb: any = {
            _filters: [] as Array<[string, unknown]>,
            _in: [] as Array<[string, unknown[]]>,
            eq(col: string, val: unknown) {
              qb._filters.push([col, val]);
              return qb;
            },
            in(col: string, vals: unknown[]) {
              qb._in.push([col, vals]);
              return qb;
            },
            order() {
              return qb;
            },
            limit() {
              return qb;
            },
            maybeSingle() {
              let res = rows.filter((r) =>
                qb._filters.every(([c, v]) => r[c] === v) &&
                qb._in.every(([c, a]) => a.includes(r[c])),
              );
              return Promise.resolve({ data: res[0] ?? null, error: null });
            },
          };
          return qb;
        },
        insert(row: Record<string, unknown>) {
          return {
            select() {
              return {
                maybeSingle() {
                  const id = `job-${rows.length + 1}`;
                  rows.push({ id, ...row } as Row);
                  return Promise.resolve({ data: { id }, error: null });
                },
              };
            },
          };
        },
        // Minimal upsert for `recordInboundEvent` (Task A.1 ledger write): dedups on the
        // onConflict columns, honoring ignoreDuplicates the same way the real table's unique
        // index does.
        upsert(row: Record<string, unknown>, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
          return {
            select(_cols: string) {
              const conflictCols = (opts?.onConflict ?? "id").split(",");
              const existing = rows.find((r) =>
                conflictCols.every((c) => r[c] === (row as Record<string, unknown>)[c]),
              );
              if (existing) {
                if (opts?.ignoreDuplicates) return Promise.resolve({ data: [], error: null });
                Object.assign(existing, row);
                return Promise.resolve({ data: [{ ...existing }], error: null });
              }
              const id = `row-${rows.length + 1}`;
              const newRow = { id, ...row } as Row;
              rows.push(newRow);
              return Promise.resolve({ data: [{ ...newRow }], error: null });
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq(col: string, val: unknown) {
              return {
                in(col2: string, vals: unknown[]) {
                  for (const r of rows) {
                    if (r[col] === val && vals.includes(r[col2])) Object.assign(r, patch);
                  }
                  return Promise.resolve({ data: null, error: null });
                },
              };
            },
            in(col: string, vals: unknown[]) {
              for (const r of rows) {
                if (vals.includes(r[col])) Object.assign(r, patch);
              }
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };
}

const moduleWithLoad = Module as unknown as { _load: (...args: unknown[]) => unknown };
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  const request = String(args[0] ?? "");
  if (request === "server-only" || request.endsWith("server-only")) return {};
  if (request === "@/lib/supabase" || request.includes("lib/supabase")) {
    return { createServerClient: () => makeClient() };
  }
  if (request.includes("lib/gmail/credentials")) {
    return {
      getWorkspaceGmailCredential: async () => ({
        ok: true,
        credential: {
          id: "cred-1",
          workspaceId: WS,
          teamId: TEAM,
          emailAddress: "inbox@test.dev",
          accessToken: "at-test",
          tokenExpiry: new Date(Date.now() + 3_600_000).toISOString(),
        },
      }),
    };
  }
  if (request.includes("lib/gmail/backfill-jobs")) {
    return {
      claimGmailBackfillJob: async (_client: unknown, input: { workspaceId?: string; jobId?: string }) => {
        const job = store.gmail_backfill_jobs.find((j) => {
          if (!["pending", "running"].includes(String(j.status))) return false;
          if (input.jobId) return j.id === input.jobId;
          if (input.workspaceId) return j.workspace_id === input.workspaceId;
          return j.status === "pending";
        });
        if (!job) return null;
        job.status = "running";
        return {
          id: job.id as string,
          workspaceId: job.workspace_id as string,
          teamId: (job.team_id as string | null) ?? null,
          status: "running",
          afterDate: job.after_date as string,
          pageToken: (job.page_token as string | null) ?? null,
          messagesFetched: Number(job.messages_fetched ?? 0),
          messagesForwarded: Number(job.messages_forwarded ?? 0),
          lastError: (job.last_error as string | null) ?? null,
        };
      },
      updateGmailBackfillJobProgress: async (_client: unknown, jobId: string, patch: Record<string, unknown>) => {
        const job = store.gmail_backfill_jobs.find((j) => j.id === jobId);
        if (!job) return false;
        if (patch.pageToken !== undefined) job.page_token = patch.pageToken;
        if (patch.messagesFetchedDelta) job.messages_fetched = Number(job.messages_fetched ?? 0) + Number(patch.messagesFetchedDelta);
        if (patch.messagesForwardedDelta) job.messages_forwarded = Number(job.messages_forwarded ?? 0) + Number(patch.messagesForwardedDelta);
        if (patch.status) job.status = patch.status;
        if (patch.lastError !== undefined) job.last_error = patch.lastError;
        return true;
      },
    };
  }
  if (request.includes("lib/gmail/backfill")) {
    return {
      DEFAULT_BATCH_SIZE: 50,
      listGmailMessageIds: async () => ({
        messageIds: ["msg-1"],
        nextPageToken: null,
      }),
      fetchGmailMessage: async () => ({
        id: "msg-1",
        threadId: "thread-1",
        internalDate: String(Date.now()),
        payload: {
          headers: [
            { name: "Subject", value: "Backfill hello" },
            { name: "From", value: "Customer <c@test.dev>" },
            { name: "Message-ID", value: "<backfill-msg-1@test.dev>" },
          ],
          mimeType: "text/plain",
          body: { data: Buffer.from("Need help with my order").toString("base64") },
        },
      }),
      gmailMessageToIntakePayload: (msg: any, dest: string) => ({
        __source: "gmail",
        to: dest,
        headers: { "message-id": "<backfill-msg-1@test.dev>" },
        from: { text: "Customer <c@test.dev>" },
        subject: "Backfill hello",
        textPlain: "Need help with my order",
        threadId: msg.threadId,
        date: new Date().toISOString(),
      }),
    };
  }
  if (request.includes("lib/n8n-intake")) {
    return {
      forwardInboundToN8n: async (payload: unknown) => {
        forwards.push(payload);
        return "forwarded";
      },
    };
  }
  return origLoad.apply(this, args);
};

process.env.N8N_INGEST_TOKEN = TOKEN;
process.env.N8N_WEBHOOK_BASE_URL = "https://knurdz3o.app.n8n.cloud";

async function post(body?: Record<string, unknown>) {
  const { POST } = await import("@/app/api/internal/n8n/gmail-backfill/route");
  return POST(
    new Request("https://app.test/api/internal/n8n/gmail-backfill", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
}

async function run() {
  const res = await post({ workspace_id: WS });
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const json = await res.json();
  assert(json.success === true, JSON.stringify(json));
  assert(json.forwarded === 1, JSON.stringify(json));
  assert(json.completed === true, JSON.stringify(json));
  assert(forwards.length === 1, "should forward one message");

  const job = store.gmail_backfill_jobs.find((j) => j.id === "job-1");
  assert(job?.status === "completed", `job status=${job?.status}`);
  assert(Number(job?.messages_forwarded) === 1, "job forwarded count");

  const bad = await post({ workspace_id: "00000000-0000-4000-8000-000000000000" });
  const badJson = await bad.json();
  assert(badJson.claimed === false, "unknown workspace should not claim");

  console.log("gmail_backfill.test.ts: all checks passed");
}

run().catch((e) => {
  console.error("gmail_backfill.test.ts: failed", e);
  process.exitCode = 1;
});
