/**
 * Revenue Analyst (Chat Agent) tests — Task 3. No live OpenAI, no live DB.
 * Run: npx tsx scripts/chat_analyst.test.ts   (or `npm run test:chat-analyst`)
 *
 * Proves, entirely from an in-memory Supabase fake + a FAKE OpenAI client:
 *  A. aggregateSnapshot computes correct aggregates from raw rows (pure).
 *  B. buildAnalystContext is tenant-scoped: team A never sees team B's data (isolation).
 *  C. An empty tenant yields the graceful empty snapshot (isEmpty, all-zero totals).
 *  D. System-prompt assembly injects business context + forbids fabrication + read-only rules.
 *  E. Route smoke test: POST /api/chat streams the (fake) reply and persists user + assistant
 *     messages to chat_messages, creating a chat_sessions row — with a fake OpenAI + fake tenant.
 *
 * `server-only`, `@/lib/api-security`, and `@/lib/chat/openai` are stubbed so the real
 * analyst-context, system-prompt, and route run unmodified.
 */

import Module from "node:module";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

// --- In-memory Supabase fake --------------------------------------------------------------------
type Row = Record<string, unknown> & { id: string };
type Store = Record<string, Row[]>;

function newStore(): Store {
  return {
    conversations: [],
    reply_drafts: [],
    business_profiles: [],
    chat_sessions: [],
    chat_messages: [],
  };
}

function pick(row: Row | undefined, cols: string | null): Record<string, unknown> | null {
  if (!row) return null;
  if (!cols || cols.trim() === "*") return { ...row };
  const out: Record<string, unknown> = {};
  for (const c of cols.split(",")) {
    const k = c.trim();
    if (k) out[k] = row[k];
  }
  return out;
}

type Filter = [op: string, col: string, val: unknown];
function matches(r: Row, filters: Filter[]): boolean {
  return filters.every(([op, c, v]) => {
    if (op === "eq") return r[c] === v;
    if (op === "in") return Array.isArray(v) && v.includes(r[c]);
    return true; // 'filter' (raw_payload->>seed) unused in these tests
  });
}
function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  return (a as never) > (b as never) ? 1 : -1;
}

function makeFakeClient(store: Store) {
  let seq = 0;
  return {
    from(table: string) {
      if (!store[table]) store[table] = [];
      const st = {
        filters: [] as Filter[],
        order: null as string | null,
        asc: true,
        limitN: null as number | null,
        selCols: null as string | null,
        single: false,
        maybeSingle: false,
        mode: "select" as "select" | "insert" | "update" | "delete",
        payload: null as Record<string, unknown> | Record<string, unknown>[] | null,
      };

      function exec(): { data: unknown; error: unknown } {
        const rows = store[table]!;
        if (st.mode === "insert") {
          const items = Array.isArray(st.payload) ? st.payload : [st.payload!];
          const inserted = items.map((it) => {
            const r: Row = {
              id: (it.id as string) ?? `${table.slice(0, 3)}_${++seq}`,
              created_at: (it.created_at as string) ?? new Date(Date.now() + ++seq).toISOString(),
              ...it,
            };
            rows.push(r);
            return r;
          });
          if (st.selCols) {
            return {
              data: st.single ? pick(inserted[0], st.selCols) : inserted.map((r) => pick(r, st.selCols)),
              error: null,
            };
          }
          return { data: null, error: null };
        }
        if (st.mode === "update") {
          for (const r of rows.filter((x) => matches(x, st.filters))) Object.assign(r, st.payload);
          return { data: null, error: null };
        }
        if (st.mode === "delete") {
          store[table] = rows.filter((x) => !matches(x, st.filters));
          return { data: null, error: null };
        }
        let out = rows.filter((r) => matches(r, st.filters));
        if (st.order) {
          const col = st.order;
          out = [...out].sort((a, b) => (st.asc ? cmp(a[col], b[col]) : cmp(b[col], a[col])));
        }
        if (st.limitN != null) out = out.slice(0, st.limitN);
        if (st.single || st.maybeSingle) return { data: out[0] ? pick(out[0], st.selCols) : null, error: null };
        return { data: out.map((r) => pick(r, st.selCols)), error: null };
      }

      const builder: Record<string, unknown> = {
        select(cols: string) {
          st.selCols = cols;
          return builder;
        },
        insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
          st.mode = "insert";
          st.payload = payload;
          return builder;
        },
        update(payload: Record<string, unknown>) {
          st.mode = "update";
          st.payload = payload;
          return builder;
        },
        delete() {
          st.mode = "delete";
          return builder;
        },
        eq(c: string, v: unknown) {
          st.filters.push(["eq", c, v]);
          return builder;
        },
        in(c: string, v: unknown) {
          st.filters.push(["in", c, v]);
          return builder;
        },
        filter(expr: string, _op: string, v: unknown) {
          st.filters.push(["filter", expr, v]);
          return builder;
        },
        order(c: string, opts?: { ascending?: boolean }) {
          st.order = c;
          st.asc = !(opts && opts.ascending === false);
          return builder;
        },
        limit(n: number) {
          st.limitN = n;
          return builder;
        },
        single() {
          st.single = true;
          return builder;
        },
        maybeSingle() {
          st.maybeSingle = true;
          return builder;
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          try {
            return Promise.resolve(exec()).then(resolve, reject);
          } catch (e) {
            return Promise.reject(e).then(resolve, reject);
          }
        },
      };
      return builder;
    },
  };
}

// --- Fake tenant + OpenAI (mutable, driven by the tests) ----------------------------------------
let routeSupabase: ReturnType<typeof makeFakeClient>;
let routeTeamId = "team-route";
const routeWorkspaceId = "ws-route";
let fakeTokens: string[] = ["You have ", "1 hot lead", " worth $4,200."];

// The route fails fast without a key; the OpenAI call itself is stubbed (no live request).
process.env.OPENAI_API_KEY = "test-key-not-used";

// --- Module interception ------------------------------------------------------------------------
const moduleWithLoad = Module as unknown as { _load: (...args: unknown[]) => unknown };
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  const request = args[0] as string;
  if (request === "server-only") return {};
  if (request === "@/lib/api-security") {
    return {
      JSON_LIMITS: { small: 16 * 1024, medium: 64 * 1024, ingest: 256 * 1024 },
      jsonError: (error: string, status: number) =>
        new Response(JSON.stringify({ error }), {
          status,
          headers: { "content-type": "application/json" },
        }),
      rateLimit: () => null,
      readJsonObjectWithLimit: async (req: Request) => ({ ok: true, body: await req.json() }),
      requireApiTenantContext: async () => ({
        ok: true,
        user: { id: "user-1" },
        supabase: routeSupabase,
        teamId: routeTeamId,
        workspaceId: routeWorkspaceId,
      }),
    };
  }
  if (request === "@/lib/chat/openai") {
    return {
      async *streamAnalystReply() {
        for (const t of fakeTokens) yield t;
      },
    };
  }
  return origLoad.apply(this, args);
};

function post(POST: (r: Request) => Promise<Response>, body: Record<string, unknown>) {
  return POST(
    new Request("https://example.com/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

(async () => {
  const { aggregateSnapshot, buildAnalystContext, emptySnapshot } = await import(
    "@/lib/chat/analyst-context"
  );
  const { buildAnalystSystemPrompt } = await import("@/lib/chat/system-prompt");

  // ==============================================================================================
  // A. aggregateSnapshot — pure aggregates.
  const convs = [
    { customer_name: "Jordan", intent: "purchase", urgency: "high", estimated_value: 4200, risk_score: 18, status: "draft_ready", message: "unit?", created_at: "2026-07-05T10:00:00Z" },
    { customer_name: "Priya", intent: "churn_risk", urgency: "critical", estimated_value: 9000, risk_score: 88, status: "classified", message: "leaving", created_at: "2026-07-05T09:00:00Z" },
    { customer_name: "Sam", intent: "support", urgency: "low", estimated_value: 0, risk_score: 6, status: "new", message: "hours?", created_at: "2026-07-05T08:00:00Z" },
    { customer_name: "Closed", intent: "purchase", urgency: "high", estimated_value: 5000, risk_score: 10, status: "sent", message: "done", created_at: "2026-07-05T07:00:00Z" },
  ];
  const drafts = [{ approval_status: "pending" }, { approval_status: "approved" }, { approval_status: "pending" }];
  const snap = aggregateSnapshot(convs, drafts, "2026-07-05T12:00:00Z");
  assert(snap.isEmpty === false, "A: not empty");
  assert(snap.totals.conversations === 4, "A: conversation count");
  // Revenue at risk excludes the terminal (sent) 5000 → 4200 + 9000 + 0 = 13200.
  assert(snap.totals.revenueAtRisk === 13200, `A: revenueAtRisk = 13200 (got ${snap.totals.revenueAtRisk})`);
  assert(snap.totals.pendingDrafts === 2, "A: pending drafts");
  // Hot lead = purchase & high/critical; the sent one is terminal but still counts to the label total.
  assert(snap.totals.hotLeads === 2, `A: hotLeads label total (got ${snap.totals.hotLeads})`);
  assert(snap.totals.churnRisks === 1, "A: churn risk count");
  assert(snap.byUrgency.critical === 1 && snap.byUrgency.high === 2 && snap.byUrgency.low === 1, "A: urgency histogram");
  assert(snap.byIntent.purchase === 2 && snap.byIntent.churn_risk === 1 && snap.byIntent.support === 1, "A: intent histogram");
  // hotLeads list excludes terminal rows, sorted by value desc → Priya(9000), Jordan(4200).
  assert(snap.hotLeads[0]?.customerName === "Priya" && snap.hotLeads[0]?.estimatedValue === 9000, "A: top hot lead by value");
  assert(snap.hotLeads.every((l) => l.customerName !== "Closed"), "A: terminal row excluded from hot leads list");
  assert(snap.churnRisk.length === 1 && snap.churnRisk[0]?.customerName === "Priya", "A: churn list");

  // ==============================================================================================
  // B. buildAnalystContext — tenant isolation.
  const store = newStore();
  const fake = makeFakeClient(store);
  const TEAM_A = "team-a";
  const TEAM_B = "team-b";
  store.conversations.push(
    { id: "a1", team_id: TEAM_A, customer_name: "A-Jordan", intent: "purchase", urgency: "high", estimated_value: 4200, risk_score: 18, status: "draft_ready", message: "a", created_at: "2026-07-05T10:00:00Z" } as Row,
    { id: "a2", team_id: TEAM_A, customer_name: "A-Priya", intent: "churn_risk", urgency: "critical", estimated_value: 1000, risk_score: 80, status: "new", message: "a", created_at: "2026-07-05T09:00:00Z" } as Row,
    { id: "b1", team_id: TEAM_B, customer_name: "B-Whale", intent: "purchase", urgency: "critical", estimated_value: 999999, risk_score: 5, status: "new", message: "b", created_at: "2026-07-05T11:00:00Z" } as Row,
  );
  store.reply_drafts.push(
    { id: "d1", team_id: TEAM_A, approval_status: "pending" } as Row,
    { id: "d2", team_id: TEAM_B, approval_status: "pending" } as Row,
  );
  store.business_profiles.push(
    { id: "bpA", team_id: TEAM_A, name: "Acme Realty", industry: "Real estate", tone: "warm, concise", services: ["Leasing", "Sales"], approval_mode: "approval_queue", created_at: "2026-01-01T00:00:00Z" } as Row,
    { id: "bpB", team_id: TEAM_B, name: "Beta Corp", industry: "SaaS", tone: "formal", services: ["Onboarding"], approval_mode: "auto", created_at: "2026-01-01T00:00:00Z" } as Row,
  );

  const ctxA = await buildAnalystContext({ supabase: fake as never, teamId: TEAM_A });
  assert(ctxA.snapshot.totals.conversations === 2, "B: team A sees only its 2 conversations");
  assert(ctxA.snapshot.totals.revenueAtRisk === 5200, `B: team A revenue = 5200 (no B leak; got ${ctxA.snapshot.totals.revenueAtRisk})`);
  assert(ctxA.snapshot.totals.pendingDrafts === 1, "B: team A pending drafts = 1");
  assert(ctxA.business?.name === "Acme Realty", "B: team A business profile");
  assert(!JSON.stringify(ctxA.snapshot).includes("B-Whale"), "B: no cross-tenant customer leak");

  const ctxB = await buildAnalystContext({ supabase: fake as never, teamId: TEAM_B });
  assert(ctxB.snapshot.totals.conversations === 1, "B: team B sees only its 1 conversation");
  assert(ctxB.snapshot.totals.revenueAtRisk === 999999, "B: team B revenue isolated");
  assert(ctxB.business?.name === "Beta Corp", "B: team B business profile");

  // ==============================================================================================
  // C. Empty tenant → graceful empty snapshot.
  const ctxEmpty = await buildAnalystContext({ supabase: fake as never, teamId: "team-nobody" });
  assert(ctxEmpty.snapshot.isEmpty === true, "C: empty tenant isEmpty");
  assert(ctxEmpty.snapshot.totals.conversations === 0 && ctxEmpty.snapshot.totals.revenueAtRisk === 0, "C: empty totals zero");
  assert(ctxEmpty.business === null, "C: empty tenant has no business profile");
  assert(emptySnapshot().isEmpty === true, "C: emptySnapshot helper");

  // ==============================================================================================
  // D. System-prompt assembly.
  const prompt = buildAnalystSystemPrompt(ctxA);
  assert(prompt.includes("Acme Realty") && prompt.includes("Real estate"), "D: prompt includes business name + industry");
  assert(prompt.includes("Leasing"), "D: prompt includes a service");
  assert(/NEVER fabricate/i.test(prompt), "D: prompt forbids fabrication");
  assert(/READ-ONLY/i.test(prompt), "D: prompt states read-only");
  assert(/never claim to have sent/i.test(prompt), "D: prompt forbids claiming to have sent");
  const emptyPrompt = buildAnalystSystemPrompt(ctxEmpty);
  assert(/no conversations yet|empty/i.test(emptyPrompt), "D: empty prompt states inbox empty");

  // ==============================================================================================
  // E. Route smoke test — fake OpenAI + fake tenant.
  const routeStore = newStore();
  routeSupabase = makeFakeClient(routeStore);
  routeTeamId = "team-route";
  routeStore.conversations.push(
    { id: "rc1", team_id: routeTeamId, customer_name: "Jordan", intent: "purchase", urgency: "high", estimated_value: 4200, risk_score: 18, status: "draft_ready", message: "unit?", created_at: "2026-07-05T10:00:00Z" } as Row,
  );
  routeStore.business_profiles.push(
    { id: "rbp", team_id: routeTeamId, name: "Acme Realty", industry: "Real estate", tone: "warm", services: ["Leasing"], approval_mode: "approval_queue", created_at: "2026-01-01T00:00:00Z" } as Row,
  );

  const { POST } = await import("@/app/api/chat/route");

  const res = await post(POST, { message: "What's at risk today?" });
  assert(res.status === 200, `E: 200 (got ${res.status})`);
  const sessionId = res.headers.get("x-session-id");
  assert(!!sessionId, "E: x-session-id header present");
  const text = await res.text();
  assert(text === fakeTokens.join(""), `E: streamed body = fake reply (got "${text}")`);

  assert(routeStore.chat_sessions.length === 1, "E: one chat_sessions row created");
  const msgs = routeStore.chat_messages;
  assert(msgs.length === 2, `E: user + assistant persisted (got ${msgs.length})`);
  const userMsg = msgs.find((m) => m.role === "user");
  const asstMsg = msgs.find((m) => m.role === "assistant");
  assert(userMsg?.content === "What's at risk today?", "E: user message persisted");
  assert(asstMsg?.content === fakeTokens.join(""), "E: assistant message persisted");
  assert(userMsg?.team_id === routeTeamId && asstMsg?.team_id === routeTeamId, "E: messages tenant-stamped");
  assert(msgs.every((m) => m.session_id === sessionId), "E: messages linked to the session");

  // E2. Continuation on the same session appends (does not create a new session).
  const res2 = await post(POST, { message: "Who first?", session_id: sessionId });
  assert(res2.status === 200, "E2: continuation 200");
  assert((await res2.text()) === fakeTokens.join(""), "E2: streamed reply");
  assert(routeStore.chat_sessions.length === 1, "E2: no new session created");
  assert(routeStore.chat_messages.length === 4, "E2: two more messages appended");

  // E3. Unknown session id → 404.
  const res3 = await post(POST, { message: "hi", session_id: "does-not-exist" });
  assert(res3.status === 404, `E3: unknown session → 404 (got ${res3.status})`);

  // E4. Empty message → 400.
  const res4 = await post(POST, { message: "   " });
  assert(res4.status === 400, `E4: empty message → 400 (got ${res4.status})`);

  console.log("chat_analyst.test.ts: all checks passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
