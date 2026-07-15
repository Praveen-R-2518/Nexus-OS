/**
 * Unit tests for POST /api/internal/n8n/match-embeddings — the token-auth
 * retrieval endpoint WF3 uses for "similar past context".
 * Run: npm run test:match-embeddings
 *
 * Covers: auth, validation, unknown team 404, and that results flow through the
 * thresholded/weighted matchKnowledge path (weak matches filtered out).
 */

import Module from "module";

const TOKEN = "test-ingest-token";
const TEAM_ID = "11111111-2222-3333-4444-555555555555";

let rpcRows: Array<{ content: string; kind: string; similarity: number }> = [];

const fakeClient = {
  from(table: string) {
    return {
      select(_cols: string) {
        return {
          eq(_col: string, val: string) {
            return {
              maybeSingle() {
                if (table === "teams" && val === TEAM_ID) {
                  return Promise.resolve({ data: { id: TEAM_ID }, error: null });
                }
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
        };
      },
    };
  },
  rpc(name: string, _params: Record<string, unknown>) {
    if (name === "rate_limit_hit") {
      return Promise.resolve({ data: { allowed: true }, error: null });
    }
    if (name === "match_embeddings") {
      return Promise.resolve({ data: rpcRows, error: null });
    }
    return Promise.resolve({ data: null, error: { message: `unknown rpc ${name}` } });
  },
};

const moduleWithLoad = Module as unknown as {
  _load: (...args: unknown[]) => unknown;
};
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  const request = args[0] as string;
  const parent = args[1] as { filename?: string } | undefined;
  if (request === "server-only") return {};
  if (request === "@/lib/supabase") {
    return { createServerClient: () => fakeClient, createBrowserClient: () => ({}) };
  }
  if (request === "@/lib/supabase/route-handler") {
    return { createSupabaseRouteHandlerClient: () => ({}) };
  }
  // lib/embeddings/store.ts imports "./openai" — stub the embedder so no
  // OPENAI_API_KEY or network is needed.
  if (request === "./openai" && parent?.filename?.includes("lib/embeddings")) {
    return {
      embedText: async () => Array.from({ length: 4 }, () => 0.5),
      embedBatch: async (texts: string[]) =>
        texts.map(() => Array.from({ length: 4 }, () => 0.5)),
    };
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
    new Request("https://app.test/api/internal/n8n/match-embeddings", {
      method: "POST",
      headers,
      body: JSON.stringify(opts.body ?? {}),
    }),
  );
}

(async () => {
  const { POST } = await import("@/app/api/internal/n8n/match-embeddings/route");
  const validBody = { team_id: TEAM_ID, query: "refund policy for enterprise plans" };

  await check("missing/wrong token → 401", async () => {
    const noAuth = await post(POST, { body: validBody });
    assert(noAuth.status === 401, `no token -> 401, got ${noAuth.status}`);
    const bad = await post(POST, { token: "wrong", body: validBody });
    assert(bad.status === 401, `bad token -> 401, got ${bad.status}`);
  });

  await check("missing team_id or query → 400", async () => {
    const noTeam = await post(POST, { token: TOKEN, body: { query: "x" } });
    assert(noTeam.status === 400, `missing team_id -> 400, got ${noTeam.status}`);
    const noQuery = await post(POST, { token: TOKEN, body: { team_id: TEAM_ID } });
    assert(noQuery.status === 400, `missing query -> 400, got ${noQuery.status}`);
  });

  await check("unknown team → 404", async () => {
    const res = await post(POST, {
      token: TOKEN,
      body: { team_id: "99999999-0000-0000-0000-000000000000", query: "x" },
    });
    assert(res.status === 404, `unknown team -> 404, got ${res.status}`);
  });

  await check("returns thresholded, weighted chunks", async () => {
    rpcRows = [
      { content: "Enterprise refunds are 30 days.", kind: "business_doc", similarity: 0.82 },
      { content: "Customer asked about refunds.", kind: "conversation", similarity: 0.8 },
      { content: "Noise chunk.", kind: "summary", similarity: 0.1 }, // below floor
    ];
    const res = await post(POST, { token: TOKEN, body: validBody });
    assert(res.status === 200, `ok -> 200, got ${res.status}`);
    const json = (await res.json()) as {
      count: number;
      chunks: Array<{ kind: string; similarity: number }>;
    };
    assert(json.count === 2, `weak match filtered (floor), got count=${json.count}`);
    // business_doc 0.82×1.0 = 0.82 beats conversation 0.80×0.9 = 0.72
    assert(json.chunks[0].kind === "business_doc", "doc ranked first by kind weight");
  });

  console.log(`\nmatch_embeddings_route: ${passed}/4 checks passed`);
})().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
