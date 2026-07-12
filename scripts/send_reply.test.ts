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
const store: Record<string, Row[]> = { reply_drafts: [], conversations: [] };

function resetStore(): void {
  store.reply_drafts = [];
  store.conversations = [];
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

const fakeClient = {
  from(table: string) {
    const rows = store[table] ?? (store[table] = []);
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
  });

  console.log(`\nsend-reply: ${passed} checks passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
