/**
 * Unit tests for POST /api/internal/n8n/ai/classify — the ONLY place n8n reaches to classify a
 * message. Proves n8n never needs (or can use) an OpenAI key directly.
 * Run: npx tsx scripts/ai_classify_route.test.ts  (or `npm run test:ai-classify-route`)
 *
 * Covers: auth, validation, 503 `ai_not_configured` when the key is missing, and a working
 * 200 response in mock mode (`AI_PROVIDER=mock`) with no network call.
 */

import Module from "module";

const TOKEN = "test-ingest-token";
const TEAM_ID = "11111111-2222-4333-8444-555555555555";

const fakeClient = {
  from() {
    return {
      insert() {
        return Promise.resolve({ data: null, error: null });
      },
    };
  },
  rpc(name: string) {
    if (name === "rate_limit_hit") {
      return Promise.resolve({ data: { allowed: true }, error: null });
    }
    return Promise.resolve({ data: null, error: { message: `unknown rpc ${name}` } });
  },
};

const moduleWithLoad = Module as unknown as { _load: (...args: unknown[]) => unknown };
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  const request = args[0] as string;
  if (request === "server-only") return {};
  if (request === "@/lib/supabase") {
    return { createServerClient: () => fakeClient, createBrowserClient: () => ({}) };
  }
  return origLoad.apply(this, args);
};

process.env.N8N_INGEST_TOKEN = TOKEN;

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

let passed = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

function post(
  POST: (r: Request) => Promise<Response>,
  opts: { token?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return POST(
    new Request("https://app.test/api/internal/n8n/ai/classify", {
      method: "POST",
      headers,
      body: JSON.stringify(opts.body ?? {}),
    }),
  );
}

(async () => {
  delete process.env.AI_PROVIDER;
  delete process.env.OPENAI_API_KEY;

  const { POST } = await import("@/app/api/internal/n8n/ai/classify/route");
  const validBody = { team_id: TEAM_ID, message: "How much for a website?" };

  await check("missing/wrong token → 401", async () => {
    const noAuth = await post(POST, { body: validBody });
    assert(noAuth.status === 401, `no token -> 401, got ${noAuth.status}`);
    const bad = await post(POST, { token: "wrong", body: validBody });
    assert(bad.status === 401, `bad token -> 401, got ${bad.status}`);
  });

  await check("no key configured → 503 ai_not_configured", async () => {
    const res = await post(POST, { token: TOKEN, body: validBody });
    assert(res.status === 503, `not configured -> 503, got ${res.status}`);
    const json = (await res.json()) as { code?: string };
    assert(json.code === "ai_not_configured", `code ai_not_configured, got ${JSON.stringify(json)}`);
  });

  await check("mock mode → 200 with classification, no network", async () => {
    process.env.AI_PROVIDER = "mock";
    const res = await post(POST, { token: TOKEN, body: validBody });
    assert(res.status === 200, `mock configured -> 200, got ${res.status}`);
    const json = (await res.json()) as { classification?: { intent_type?: string }; source?: string };
    assert(json.source === "mock", `source mock, got ${JSON.stringify(json)}`);
    assert(!!json.classification?.intent_type, "has classification.intent_type");
  });

  await check("missing team_id/message → 400", async () => {
    const noTeam = await post(POST, { token: TOKEN, body: { message: "x" } });
    assert(noTeam.status === 400, `missing team_id -> 400, got ${noTeam.status}`);
    const noMessage = await post(POST, { token: TOKEN, body: { team_id: TEAM_ID } });
    assert(noMessage.status === 400, `missing message -> 400, got ${noMessage.status}`);
  });

  console.log(`\nai_classify_route: ${passed}/4 checks passed`);
})().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
