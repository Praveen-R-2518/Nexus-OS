/**
 * Channel Sender executor tests — drives the real POST handler of
 * app/api/internal/n8n/send-reply/route.ts with mocked transport + Supabase (no network).
 * Run: npx tsx scripts/send_reply.test.ts  (or `npm run test:send-reply`)
 *
 * Proves (docs/channel_sender.md):
 *  1. An approved draft is sent: transport called once, draft→'sent'+sent_at, conversation→'replied'.
 *  2. Idempotency: a draft already 'sent' is a no-op (transport NOT called), returns alreadySent.
 *  3. A non-approved draft is rejected (409) and never sent.
 *  4. Missing customer_email → 409, no send.
 *  5. No connected Gmail credential → 409, no send.
 *  6. Missing draft_id/team_id → 400.
 *  7. Bad N8N_INGEST_TOKEN → 401.
 *  8. Transport failure (e.g. read-only scope 403) → 502, draft NOT marked sent (safe retry).
 */

import Module from "node:module";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const TOKEN = "test-n8n-token";
process.env.N8N_INGEST_TOKEN = TOKEN;

// --- In-memory Supabase fake --------------------------------------------------------------------
type Row = Record<string, unknown>;
const store: Record<string, Row[]> = { reply_drafts: [], conversations: [], outbound_jobs: [] };

function resetStore(): void {
  store.reply_drafts = [];
  store.conversations = [];
  store.outbound_jobs = [];
}

function selectBuilder(rows: Row[]) {
  const filters: Array<[string, unknown]> = [];
  const b = {
    eq(col: string, val: unknown) {
      filters.push([col, val]);
      return b;
    },
    maybeSingle() {
      const hit = rows.find((r) => filters.every(([c, v]) => r[c] === v));
      return Promise.resolve({ data: hit ? { ...hit } : null, error: null });
    },
  };
  return b;
}

function updateBuilder(rows: Row[], patch: Row) {
  const filters: Array<[string, unknown]> = [];
  const b = {
    eq(col: string, val: unknown) {
      filters.push([col, val]);
      return b;
    },
    then(resolve: (v: { data: null; error: null }) => void) {
      for (const r of rows) {
        if (filters.every(([c, v]) => r[c] === v)) Object.assign(r, patch);
      }
      resolve({ data: null, error: null });
    },
  };
  return b;
}

/** `outbound_jobs` upsert-by-draft_id fake (Task B.1/B.4 — `queueOutboundJob`/`markOutboundJobResult`
 * exercised transparently via the real `executeSendReply` core). */
function outboundJobsBuilder(rows: Row[]) {
  return {
    upsert(row: Row, _opts?: { onConflict?: string }) {
      return {
        select(_cols: string) {
          return {
            maybeSingle() {
              const existing = rows.find((r) => r.draft_id === row.draft_id);
              if (existing) {
                Object.assign(existing, row);
                return Promise.resolve({ data: { ...existing }, error: null });
              }
              const inserted = { id: `job-${rows.length + 1}`, attempts: 0, ...row };
              rows.push(inserted);
              return Promise.resolve({ data: { ...inserted }, error: null });
            },
          };
        },
      };
    },
    select(_cols: string) {
      const filters: Array<[string, unknown]> = [];
      const b = {
        eq(col: string, val: unknown) {
          filters.push([col, val]);
          return b;
        },
        maybeSingle() {
          const hit = rows.find((r) => filters.every(([c, v]) => r[c] === v));
          return Promise.resolve({ data: hit ? { ...hit } : null, error: null });
        },
      };
      return b;
    },
    update(patch: Row) {
      return updateBuilder(rows, patch);
    },
  };
}

const fakeClient = {
  from(table: string) {
    const rows = store[table] ?? (store[table] = []);
    if (table === "outbound_jobs") return outboundJobsBuilder(rows);
    return {
      select: () => selectBuilder(rows),
      update: (patch: Row) => updateBuilder(rows, patch),
    };
  },
};

// --- Controllable mocks for the credential resolver + transport ---------------------------------
type CredResult = {
  ok: boolean;
  credential?: { emailAddress: string; accessToken: string };
  error?: string;
};
let credResult: CredResult = {
  ok: true,
  credential: { emailAddress: "founder@acme.test", accessToken: "at_123" },
};

let transportCalls = 0;
let transportError: Error | null = null;

class GmailSendError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GmailSendError";
    this.status = status;
  }
}

// --- Module interception ------------------------------------------------------------------------
const moduleWithLoad = Module as unknown as { _load: (...args: unknown[]) => unknown };
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  const request = args[0] as string;
  if (request === "server-only") return {};
  if (request === "@/lib/supabase") {
    return { createServerClient: () => fakeClient, createBrowserClient: () => ({}) };
  }
  if (request === "@/lib/gmail/credentials") {
    return { getWorkspaceGmailCredential: async () => credResult };
  }
  if (request === "@/lib/gmail/send") {
    return {
      GmailSendError,
      sendGmailMessage: async () => {
        transportCalls += 1;
        if (transportError) throw transportError;
        return { messageId: "gmail_msg_1" };
      },
    };
  }
  return origLoad.apply(this, args);
};

// --- Fixtures / helpers -------------------------------------------------------------------------
const TEAM = "11111111-1111-4111-8111-111111111111";
const WS = "22222222-2222-4222-8222-222222222222";
const DRAFT = "33333333-3333-4333-8333-333333333333";
const CONV = "44444444-4444-4444-8444-444444444444";

function seed(opts: { approvalStatus?: string; sentAt?: string | null; email?: string } = {}) {
  resetStore();
  store.reply_drafts.push({
    id: DRAFT,
    team_id: TEAM,
    workspace_id: WS,
    conversation_id: CONV,
    draft_text: "Thanks for reaching out — here is your answer.",
    approval_status: opts.approvalStatus ?? "approved",
    sent_at: opts.sentAt ?? null,
  });
  store.conversations.push({
    id: CONV,
    team_id: TEAM,
    workspace_id: WS,
    customer_email: opts.email === undefined ? "customer@example.com" : opts.email,
    status: "approved",
    raw_payload: { subject: "Question about pricing" },
  });
}

function post(
  POST: (r: Request) => Promise<Response>,
  body: Record<string, unknown>,
  token: string = TOKEN,
) {
  return POST(
    new Request("https://example.com/api/internal/n8n/send-reply", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }),
  );
}

let passed = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  transportCalls = 0;
  transportError = null;
  credResult = {
    ok: true,
    credential: { emailAddress: "founder@acme.test", accessToken: "at_123" },
  };
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

(async () => {
  const { POST } = await import("@/app/api/internal/n8n/send-reply/route");

  await check("approved draft sends once and updates statuses", async () => {
    seed();
    const res = await post(POST, { draft_id: DRAFT, team_id: TEAM });
    const json = (await res.json()) as Record<string, unknown>;
    assert(res.status === 200, `status ${res.status}`);
    assert(json.success === true && json.alreadySent === false, "success + not alreadySent");
    assert(json.messageId === "gmail_msg_1", "messageId returned");
    assert(transportCalls === 1, `transport called once, got ${transportCalls}`);
    assert(store.reply_drafts[0].approval_status === "sent", "draft marked sent");
    assert(typeof store.reply_drafts[0].sent_at === "string", "sent_at set");
    assert(store.conversations[0].status === "replied", "conversation marked replied");
    assert(store.outbound_jobs.length === 1, "outbound_jobs row created");
    assert(store.outbound_jobs[0].status === "sent", "outbound_jobs row marked sent");
    assert(
      store.outbound_jobs[0].provider_message_id === "gmail_msg_1",
      "outbound_jobs.provider_message_id set from send result",
    );
  });

  await check("already-sent draft is an idempotent no-op", async () => {
    seed({ approvalStatus: "sent", sentAt: new Date().toISOString() });
    const res = await post(POST, { draft_id: DRAFT, team_id: TEAM });
    const json = (await res.json()) as Record<string, unknown>;
    assert(res.status === 200, `status ${res.status}`);
    assert(json.alreadySent === true, "alreadySent true");
    assert(transportCalls === 0, "transport NOT called for already-sent");
  });

  await check("non-approved draft is rejected 409 and not sent", async () => {
    seed({ approvalStatus: "pending" });
    const res = await post(POST, { draft_id: DRAFT, team_id: TEAM });
    assert(res.status === 409, `status ${res.status}`);
    assert(transportCalls === 0, "transport not called");
    assert(store.reply_drafts[0].approval_status === "pending", "draft unchanged");
    assert(store.outbound_jobs.length === 0, "non-approved draft never queues an outbound job");
  });

  await check("missing customer_email → 409, no send", async () => {
    seed({ email: "" });
    const res = await post(POST, { draft_id: DRAFT, team_id: TEAM });
    assert(res.status === 409, `status ${res.status}`);
    assert(transportCalls === 0, "transport not called");
  });

  await check("no connected Gmail credential → 409, no send", async () => {
    seed();
    credResult = { ok: false, error: "no_connected_credential" };
    const res = await post(POST, { draft_id: DRAFT, team_id: TEAM });
    assert(res.status === 409, `status ${res.status}`);
    assert(transportCalls === 0, "transport not called");
    assert(store.reply_drafts[0].approval_status === "approved", "draft unchanged");
  });

  await check("missing draft_id → 400", async () => {
    seed();
    const res = await post(POST, { team_id: TEAM });
    assert(res.status === 400, `status ${res.status}`);
  });

  await check("missing team_id → 400", async () => {
    seed();
    const res = await post(POST, { draft_id: DRAFT });
    assert(res.status === 400, `status ${res.status}`);
  });

  await check("bad n8n token → 401", async () => {
    seed();
    const res = await post(POST, { draft_id: DRAFT, team_id: TEAM }, "wrong-token");
    assert(res.status === 401, `status ${res.status}`);
    assert(transportCalls === 0, "transport not called");
  });

  await check("transport failure (403 read-only) → 502, draft NOT marked sent", async () => {
    seed();
    transportError = new GmailSendError("Gmail send failed (403): insufficient scope", 403);
    const res = await post(POST, { draft_id: DRAFT, team_id: TEAM });
    assert(res.status === 502, `status ${res.status}`);
    assert(transportCalls === 1, "transport attempted");
    assert(store.reply_drafts[0].approval_status === "approved", "draft NOT marked sent");
    assert(store.reply_drafts[0].sent_at === null, "sent_at NOT set");
    assert(store.conversations[0].status === "approved", "conversation NOT marked replied");
    assert(store.outbound_jobs.length === 1, "outbound_jobs row still exists (retryable)");
    assert(store.outbound_jobs[0].status === "failed", "outbound_jobs row marked failed, not lost");
  });

  console.log(`\nsend-reply: ${passed} checks passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
