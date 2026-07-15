/**
 * Meta outbound send tests — kill-switch gating, Graph request shape, response
 * id parsing, and the channel-sender dispatch (docs/meta_outbound.md).
 * Run: npm run test:meta-send
 *
 * Proves:
 *  1. META_SEND_ENABLED unset → sendMetaMessage throws 501 (no fetch happens).
 *  2. Enabled WhatsApp session send → correct Graph URL/body/bearer, wamid parsed.
 *  3. Enabled Messenger HUMAN_AGENT send → message_id parsed.
 *  4. Graph API error → MetaSendError with upstream status, no message id.
 *  5. executeSendReply dispatch: whatsapp conversation + switch off → 501, draft untouched.
 *  6. executeSendReply dispatch: in-window whatsapp + switch on → sent, provider_message_id stored.
 *  7. Messenger outside 7d window → 409 blocked before any credential/transport use.
 */

import Module from "node:module";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

let passed = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

// --- fetch stub -----------------------------------------------------------------
type FetchCall = { url: string; init: RequestInit };
const fetchCalls: FetchCall[] = [];
let fetchResponse: { status: number; body: unknown } = { status: 200, body: {} };

const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
  fetchCalls.push({ url: String(url), init: init ?? {} });
  return new Response(JSON.stringify(fetchResponse.body), {
    status: fetchResponse.status,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

// --- module mocks for the channel-sender dispatch tests --------------------------
let metaCredResult: unknown = {
  ok: true,
  credential: {
    id: "cred1",
    workspaceId: "ws",
    teamId: "team",
    platform: "whatsapp",
    accessToken: "meta_token_123",
    senderId: "15550001111",
  },
};

const moduleWithLoad = Module as unknown as { _load: (...args: unknown[]) => unknown };
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  const request = args[0] as string;
  if (request === "server-only") return {};
  if (request === "@/lib/meta/credentials") {
    return { getWorkspaceMetaCredential: async () => metaCredResult };
  }
  if (request === "@/lib/gmail/credentials") {
    return { getWorkspaceGmailCredential: async () => ({ ok: false, error: "no_connected_credential" }) };
  }
  if (request === "@/lib/gmail/send") {
    class GmailSendError extends Error {
      status = 500;
    }
    return {
      GmailSendError,
      sendGmailMessage: async () => {
        throw new Error("gmail transport must not be called in meta tests");
      },
    };
  }
  return origLoad.apply(this, args);
};

// --- in-memory supabase fake (same shape as send_reply.test.ts) -------------------
type Row = Record<string, unknown>;
const store: Record<string, Row[]> = { reply_drafts: [], conversations: [] };

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
} as never;

const TEAM = "11111111-1111-4111-8111-111111111111";
const WS = "22222222-2222-4222-8222-222222222222";
const DRAFT = "33333333-3333-4333-8333-333333333333";
const CONV = "44444444-4444-4444-8444-444444444444";

function seed(opts: { source?: string; receivedAt?: string; phone?: string | null } = {}) {
  store.reply_drafts = [
    {
      id: DRAFT,
      team_id: TEAM,
      workspace_id: WS,
      conversation_id: CONV,
      draft_text: "Thanks — your order ships Monday.",
      approval_status: "approved",
      sent_at: null,
    },
  ];
  store.conversations = [
    {
      id: CONV,
      team_id: TEAM,
      workspace_id: WS,
      source: opts.source ?? "whatsapp",
      customer_email: "15559998888",
      customer_phone: opts.phone === undefined ? "15559998888" : opts.phone,
      status: "approved",
      raw_payload: {},
      received_at: opts.receivedAt ?? new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
  ];
}

(async () => {
  const { sendMetaMessage, MetaSendError, buildMetaSendRequest } = await import("@/lib/meta/send");
  const { executeSendReply } = await import("@/lib/channel-sender");

  await check("kill-switch off → 501, fetch never called", async () => {
    delete process.env.META_SEND_ENABLED;
    let caught: unknown = null;
    try {
      await sendMetaMessage(
        {
          platform: "whatsapp",
          senderId: "15550001111",
          recipientId: "15559998888",
          text: "hi",
          strategy: { kind: "session_text" },
        },
        { accessToken: "t" },
      );
    } catch (e) {
      caught = e;
    }
    assert(caught instanceof MetaSendError && caught.status === 501, "501 when disabled");
    assert(fetchCalls.length === 0, "no Graph call when disabled");
  });

  await check("enabled WhatsApp session → correct request + wamid", async () => {
    process.env.META_SEND_ENABLED = "true";
    fetchResponse = { status: 200, body: { messages: [{ id: "wamid.ABC123" }] } };
    const { messageId } = await sendMetaMessage(
      {
        platform: "whatsapp",
        senderId: "15550001111",
        recipientId: "15559998888",
        text: "Thanks!",
        strategy: { kind: "session_text" },
      },
      { accessToken: "meta_token_123" },
    );
    assert(messageId === "wamid.ABC123", "wamid parsed");
    const call = fetchCalls[fetchCalls.length - 1];
    assert(call.url === "https://graph.facebook.com/v21.0/15550001111/messages", `url ${call.url}`);
    const headers = call.init.headers as Record<string, string>;
    assert(headers.Authorization === "Bearer meta_token_123", "bearer token set");
    const body = JSON.parse(String(call.init.body));
    const expected = buildMetaSendRequest({
      platform: "whatsapp",
      senderId: "15550001111",
      recipientId: "15559998888",
      text: "Thanks!",
      strategy: { kind: "session_text" },
    });
    assert(JSON.stringify(body) === JSON.stringify(expected.body), "body matches builder");
  });

  await check("enabled Messenger HUMAN_AGENT → message_id parsed", async () => {
    fetchResponse = { status: 200, body: { message_id: "m_98765" } };
    const { messageId } = await sendMetaMessage(
      {
        platform: "facebook",
        senderId: "page_1",
        recipientId: "psid_1",
        text: "Following up",
        strategy: { kind: "human_agent_tag" },
      },
      { accessToken: "meta_token_123" },
    );
    assert(messageId === "m_98765", "message_id parsed");
    const body = JSON.parse(String(fetchCalls[fetchCalls.length - 1].init.body));
    assert(body.tag === "HUMAN_AGENT" && body.messaging_type === "MESSAGE_TAG", "tagged send");
  });

  await check("Graph error → MetaSendError with upstream status", async () => {
    fetchResponse = { status: 400, body: { error: { message: "(#100) Param invalid" } } };
    let caught: unknown = null;
    try {
      await sendMetaMessage(
        {
          platform: "whatsapp",
          senderId: "15550001111",
          recipientId: "bad",
          text: "x",
          strategy: { kind: "session_text" },
        },
        { accessToken: "meta_token_123" },
      );
    } catch (e) {
      caught = e;
    }
    assert(caught instanceof MetaSendError && caught.status === 400, "status mapped");
  });

  await check("dispatch: whatsapp + switch off → 501, draft untouched", async () => {
    delete process.env.META_SEND_ENABLED;
    seed();
    const res = await executeSendReply(fakeClient, { draftId: DRAFT, teamId: TEAM });
    assert(res.status === 501, `expected 501, got ${res.status}`);
    assert(store.reply_drafts[0].approval_status === "approved", "draft not marked sent");
    assert(store.reply_drafts[0].sent_at === null, "sent_at untouched");
  });

  await check("dispatch: in-window whatsapp + switch on → sent + provider_message_id", async () => {
    process.env.META_SEND_ENABLED = "true";
    seed();
    fetchResponse = { status: 200, body: { messages: [{ id: "wamid.SENT1" }] } };
    const res = await executeSendReply(fakeClient, { draftId: DRAFT, teamId: TEAM });
    assert(res.status === 200 && res.body.success === true, `sent, got ${res.status}`);
    assert(store.reply_drafts[0].approval_status === "sent", "draft marked sent");
    assert(
      store.reply_drafts[0].provider_message_id === "wamid.SENT1",
      "provider_message_id recorded",
    );
  });

  await check("dispatch: messenger outside 7d window → 409 blocked, no transport", async () => {
    const before = fetchCalls.length;
    seed({
      source: "facebook",
      receivedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      phone: null,
    });
    const res = await executeSendReply(fakeClient, { draftId: DRAFT, teamId: TEAM });
    assert(res.status === 409, `blocked -> 409, got ${res.status}`);
    assert(fetchCalls.length === before, "no Graph call for blocked window");
    assert(store.reply_drafts[0].approval_status === "approved", "draft untouched");
  });

  globalThis.fetch = realFetch;
  delete process.env.META_SEND_ENABLED;
  console.log(`\nmeta_send: ${passed}/7 checks passed`);
})().catch((e) => {
  globalThis.fetch = realFetch;
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
