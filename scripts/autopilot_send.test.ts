/**
 * Autopilot send tests — drives the real POST handler of
 * app/api/internal/n8n/autopilot-send/route.ts with mocked transport + Supabase (no network).
 * Run: npx tsx scripts/autopilot_send.test.ts  (or `npm run test:autopilot-send`)
 *
 * Proves the 1.5 rewire: the auto-send policy (lib/approval-policy.ts) is enforced server-side.
 *  1. autopilot + safe (low value/risk, high confidence) → approves & sends once, draft 'sent'.
 *  2. churn_risk lead → gated, draft stays 'pending', transport NOT called.
 *  3. high estimated_value → gated.
 *  4. low confidence → gated.
 *  5. non-autopilot business profile → gated.
 *  6. no business profile row → gated (approval_mode null).
 *  7. already-sent draft → idempotent no-op.
 *  8. missing draft_id → 400; bad token → 401.
 */

import Module from "node:module";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const TOKEN = "test-n8n-token";
process.env.N8N_INGEST_TOKEN = TOKEN;

// --- In-memory Supabase fake --------------------------------------------------------------------
type Row = Record<string, unknown>;
const store: Record<string, Row[]> = {
  reply_drafts: [],
  conversations: [],
  leads: [],
  business_profiles: [],
  outbound_jobs: [],
};

function selectBuilder(rows: Row[]) {
  const filters: Array<[string, unknown]> = [];
  const b = {
    eq(col: string, val: unknown) {
      filters.push([col, val]);
      return b;
    },
    limit(_n: number) {
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

/** `outbound_jobs` upsert-by-draft_id fake (Task B.2 — `queueOutboundJob`/`markOutboundJobResult`
 * exercised transparently via the real `executeSendReply` core that autopilot delegates to). */
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

// --- Controllable mocks for credential resolver + transport -------------------------------------
let credResult = {
  ok: true,
  credential: { emailAddress: "founder@acme.test", accessToken: "at_123" },
};
let transportCalls = 0;

class GmailSendError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GmailSendError";
    this.status = status;
  }
}

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
        return { messageId: "gmail_msg_1" };
      },
    };
  }
  return origLoad.apply(this, args);
};

// --- Fixtures -----------------------------------------------------------------------------------
const TEAM = "11111111-1111-4111-8111-111111111111";
const WS = "22222222-2222-4222-8222-222222222222";
const DRAFT = "33333333-3333-4333-8333-333333333333";
const CONV = "44444444-4444-4444-8444-444444444444";
const LEAD = "55555555-5555-4555-8555-555555555555";

type SeedOpts = {
  approvalMode?: string | null; // business_profiles.approval_mode; null => no bp row
  estimatedValue?: number;
  riskType?: string;
  riskScore?: number;
  confidence?: number;
  approvalStatus?: string;
  sentAt?: string | null;
};

function seed(opts: SeedOpts = {}) {
  store.reply_drafts = [
    {
      id: DRAFT,
      team_id: TEAM,
      workspace_id: WS,
      conversation_id: CONV,
      lead_id: LEAD,
      draft_text: "Thanks for reaching out — here is your answer.",
      approval_status: opts.approvalStatus ?? "pending",
      confidence: opts.confidence ?? 0.95,
      sent_at: opts.sentAt ?? null,
    },
  ];
  store.conversations = [
    {
      id: CONV,
      team_id: TEAM,
      workspace_id: WS,
      customer_email: "customer@example.com",
      status: "classified",
      raw_payload: { subject: "Question about pricing" },
    },
  ];
  store.leads = [
    {
      id: LEAD,
      team_id: TEAM,
      estimated_value: opts.estimatedValue ?? 50,
      risk_type: opts.riskType ?? "none",
      risk_score: opts.riskScore ?? 0.1,
    },
  ];
  store.business_profiles =
    opts.approvalMode === null
      ? []
      : [{ team_id: TEAM, approval_mode: opts.approvalMode ?? "autopilot" }];
  store.outbound_jobs = [];
}

function post(
  POST: (r: Request) => Promise<Response>,
  body: Record<string, unknown>,
  token: string = TOKEN,
) {
  return POST(
    new Request("https://example.com/api/internal/n8n/autopilot-send", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  );
}

let passed = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  transportCalls = 0;
  credResult = {
    ok: true,
    credential: { emailAddress: "founder@acme.test", accessToken: "at_123" },
  };
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

(async () => {
  const { POST } = await import("@/app/api/internal/n8n/autopilot-send/route");

  await check("autopilot + safe → approves & sends once", async () => {
    seed({ approvalMode: "autopilot" });
    const res = await post(POST, { draft_id: DRAFT, team_id: TEAM, lead_id: LEAD });
    const json = (await res.json()) as Record<string, unknown>;
    assert(res.status === 200, `status ${res.status}`);
    assert(json.autoSend === true, "autoSend true");
    assert(json.success === true, "success true");
    assert(transportCalls === 1, `transport called once, got ${transportCalls}`);
    assert(store.reply_drafts[0].approval_status === "sent", "draft marked sent");
    assert(store.conversations[0].status === "replied", "conversation replied");
    assert(store.outbound_jobs.length === 1, "outbound_jobs row created for autopilot send");
    assert(store.outbound_jobs[0].status === "sent", "outbound_jobs row marked sent");
    assert(store.outbound_jobs[0].draft_id === DRAFT, "outbound_jobs.draft_id matches");
    assert(store.outbound_jobs[0].team_id === TEAM, "outbound_jobs.team_id matches");
  });

  await check("churn_risk → gated, draft stays pending, no send", async () => {
    seed({ approvalMode: "autopilot", riskType: "churn_risk" });
    const res = await post(POST, { draft_id: DRAFT, team_id: TEAM, lead_id: LEAD });
    const json = (await res.json()) as Record<string, unknown>;
    assert(json.gated === true && json.autoSend === false, "gated");
    assert(json.reason === "gated_churn_risk", `reason ${json.reason}`);
    assert(transportCalls === 0, "no send");
    assert(store.reply_drafts[0].approval_status === "pending", "still pending");
    assert(store.outbound_jobs.length === 0, "gated draft never queues an outbound job");
  });

  await check("high estimated_value → gated", async () => {
    seed({ approvalMode: "autopilot", estimatedValue: 1000 });
    const res = await post(POST, { draft_id: DRAFT, team_id: TEAM, lead_id: LEAD });
    const json = (await res.json()) as Record<string, unknown>;
    assert(json.reason === "gated_high_value", `reason ${json.reason}`);
    assert(transportCalls === 0, "no send");
    assert(store.reply_drafts[0].approval_status === "pending", "still pending");
  });

  await check("low confidence → gated", async () => {
    seed({ approvalMode: "autopilot", confidence: 0.4 });
    const res = await post(POST, { draft_id: DRAFT, team_id: TEAM, lead_id: LEAD });
    const json = (await res.json()) as Record<string, unknown>;
    assert(json.reason === "gated_low_confidence", `reason ${json.reason}`);
    assert(transportCalls === 0, "no send");
  });

  await check("non-autopilot business profile → gated", async () => {
    seed({ approvalMode: "approval_queue" });
    const res = await post(POST, { draft_id: DRAFT, team_id: TEAM, lead_id: LEAD });
    const json = (await res.json()) as Record<string, unknown>;
    assert(json.reason === "gated_not_autopilot", `reason ${json.reason}`);
    assert(transportCalls === 0, "no send");
  });

  await check("no business profile row → gated", async () => {
    seed({ approvalMode: null });
    const res = await post(POST, { draft_id: DRAFT, team_id: TEAM, lead_id: LEAD });
    const json = (await res.json()) as Record<string, unknown>;
    assert(json.reason === "gated_not_autopilot", `reason ${json.reason}`);
    assert(transportCalls === 0, "no send");
  });

  await check("already-sent draft → idempotent no-op", async () => {
    seed({ approvalMode: "autopilot", approvalStatus: "sent", sentAt: new Date().toISOString() });
    const res = await post(POST, { draft_id: DRAFT, team_id: TEAM, lead_id: LEAD });
    const json = (await res.json()) as Record<string, unknown>;
    assert(json.alreadySent === true, "alreadySent");
    assert(transportCalls === 0, "no send");
  });

  await check("missing draft_id → 400", async () => {
    seed({ approvalMode: "autopilot" });
    const res = await post(POST, { team_id: TEAM });
    assert(res.status === 400, `status ${res.status}`);
  });

  await check("bad token → 401", async () => {
    seed({ approvalMode: "autopilot" });
    const res = await post(POST, { draft_id: DRAFT, team_id: TEAM }, "wrong");
    assert(res.status === 401, `status ${res.status}`);
    assert(transportCalls === 0, "no send");
  });

  console.log(`\nautopilot-send: ${passed} checks passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
