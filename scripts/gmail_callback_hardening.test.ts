import { strict as assert } from "node:assert";
import Module from "node:module";

// The OAuth state is HMAC-signed with ENCRYPTION_KEY; set it before the
// handler/helpers are imported so encode/decode share the same key.
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "test-encryption-key-for-oauth-state";

const moduleWithLoad = Module as unknown as { _load: (...args: unknown[]) => unknown };
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  const request = String(args[0] ?? "");
  if (request === "server-only" || request.endsWith("server-only")) return {};
  return origLoad.apply(this, args);
};

type FakeUser = { id: string };

function locationOf(res: Response): string {
  const loc = res.headers.get("location");
  assert(loc, "expected redirect location header");
  return loc;
}

function expectRedirectTo(res: Response, predicate: (loc: string) => boolean, msg: string) {
  assert(res.status >= 300 && res.status < 400, `expected redirect status, got ${res.status}`);
  const loc = locationOf(res);
  assert(predicate(loc), `${msg}. location=${loc}`);
}

function makeReq(qs: Record<string, string | undefined>): Request {
  const url = new URL("https://example.test/api/gmail/callback");
  for (const [k, v] of Object.entries(qs)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  return new Request(url.toString(), { method: "GET" });
}

function makeStateBase64Url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

const TEAM = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const WS = "11111111-2222-4333-8444-555555555555";
const USER = "22222222-3333-4333-8444-555555555555";

function fakeSupabase(opts: {
  user: FakeUser | null;
  workspaceOwnerId?: string;
  alreadyConnected?: boolean;
  upsertOk?: boolean;
  businessProfileOk?: boolean;
}) {
  const state = {
    alreadyConnected: Boolean(opts.alreadyConnected),
    upsertOk: opts.upsertOk ?? true,
    businessProfileOk: opts.businessProfileOk ?? true,
  };

  const api = {
    auth: {
      async getUser() {
        return { data: { user: opts.user }, error: null };
      },
    },
    from(table: string) {
      const qb: any = {
        _table: table,
        _filters: [] as Array<[string, string]>,
        select() {
          return qb;
        },
        eq(col: string, val: string) {
          qb._filters.push([col, val]);
          return qb;
        },
        async maybeSingle() {
          if (table === "gmail_credentials") {
            return state.alreadyConnected
              ? { data: { id: "cred1", status: "connected" }, error: null }
              : { data: null, error: null };
          }
          if (table === "workspaces") {
            return {
              data: { id: WS, owner_user_id: opts.workspaceOwnerId ?? USER },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        async upsert() {
          if (table === "gmail_credentials") {
            return state.upsertOk ? { error: null } : { error: { message: "upsert failed" } };
          }
          if (table === "business_profiles") {
            return state.businessProfileOk
              ? { error: null }
              : { error: { message: "bp upsert failed" } };
          }
          return { error: null };
        },
        delete() {
          return qb;
        },
        async insert() {
          if (table === "gmail_credentials") {
            return state.upsertOk ? { error: null } : { error: { message: "insert failed" } };
          }
          return { error: null };
        },
      };
      return qb;
    },
  };

  return api;
}

function baseDeps(overrides: Partial<Parameters<typeof handleGmailOAuthCallback>[1]> = {}) {
  let enqueued = 0;
  return {
    createSupabase: () => fakeSupabase({ user: { id: USER } }) as any,
    createServiceSupabase: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }) as any,
    fetchFn: async () => {
      throw new Error("fetch should not run");
    },
    encrypt: () => "enc",
    isEncryptionReady: () => true,
    oauthConfigHasError: () => false,
    redirectUri: () => "https://example.test/api/gmail/callback",
    enqueueBackfill: async () => {
      enqueued += 1;
      return { enqueued: true, jobId: "job1", error: null };
    },
    get enqueuedCount() {
      return enqueued;
    },
    ...overrides,
  };
}

async function run() {
  const { handleGmailOAuthCallback } = await import("../app/api/gmail/callback/handler");
  const { encodeOAuthState } = await import("../app/api/gmail/helpers");

  // 1) Missing params => redirect with reason code (never throw)
  {
    const req = makeReq({ state: "x" });
    const deps = baseDeps();
    const res = await handleGmailOAuthCallback(req, deps);
    expectRedirectTo(
      res,
      (loc) => loc.includes("/signup?") && loc.includes("gmail_error=missing_params"),
      "missing params should redirect with reason",
    );
  }

  // 2) Invalid state => redirect
  {
    const req = makeReq({ code: "abc", state: "not-base64" });
    const res = await handleGmailOAuthCallback(req, baseDeps());
    expectRedirectTo(
      res,
      (loc) => loc.includes("gmail_error=invalid_state"),
      "invalid state should redirect",
    );
  }

  const goodState = encodeOAuthState({
    workspace_id: WS,
    team_id: TEAM,
    user_id: USER,
  });

  // 2b) Legacy unsigned base64 state => rejected as invalid_state
  {
    const legacyState = makeStateBase64Url({
      workspace_id: WS,
      team_id: TEAM,
      user_id: USER,
    });
    const req = makeReq({ code: "abc", state: legacyState });
    const res = await handleGmailOAuthCallback(req, baseDeps());
    expectRedirectTo(
      res,
      (loc) => loc.includes("gmail_error=invalid_state"),
      "unsigned legacy state should be rejected",
    );
  }

  // 3) Missing session cookie + valid signed state => completes via the
  //    service-role client (Safari ITP path), NOT a /login dead-end.
  {
    const req = makeReq({ code: "abc", state: goodState });
    const deps = baseDeps({
      createSupabase: () => fakeSupabase({ user: null }) as any,
      createServiceSupabase: () => fakeSupabase({ user: null }) as any,
      fetchFn: (async (url: any) => {
        if (String(url).includes("/token")) {
          return new Response(
            JSON.stringify({ access_token: "at", expires_in: 3600, refresh_token: "rt" }),
            { status: 200 },
          );
        }
        if (String(url).includes("/userinfo")) {
          return new Response(JSON.stringify({ email: "a@b.com" }), { status: 200 });
        }
        throw new Error("unexpected fetch url");
      }) as any,
    });
    const res = await handleGmailOAuthCallback(req, deps);
    expectRedirectTo(
      res,
      (loc) => loc.includes("gmail_connected=true"),
      "cookie-less callback with valid signed state should succeed",
    );
  }

  // 3b) Session present but for a DIFFERENT user => auth_user_mismatch
  {
    const req = makeReq({ code: "abc", state: goodState });
    const res = await handleGmailOAuthCallback(req, baseDeps({
      createSupabase: () =>
        fakeSupabase({ user: { id: "33333333-4444-4333-8444-555555555555" } }) as any,
    }));
    expectRedirectTo(
      res,
      (loc) => loc.includes("gmail_error=auth_user_mismatch"),
      "mismatched session user should be rejected",
    );
  }

  // 4) Already connected => success redirect, no token exchange needed
  {
    const req = makeReq({ code: "abc", state: goodState });
    const res = await handleGmailOAuthCallback(req, baseDeps({
      createSupabase: () =>
        fakeSupabase({ user: { id: USER }, alreadyConnected: true }) as any,
      fetchFn: async () => {
        throw new Error("fetch should not be called when already connected");
      },
    }));
    expectRedirectTo(
      res,
      (loc) => loc.includes("gmail_connected=true"),
      "already connected should redirect to success",
    );
  }

  // 5) invalid_grant + not connected => graceful error redirect
  {
    const req = makeReq({ code: "abc", state: goodState });
    const res = await handleGmailOAuthCallback(req, baseDeps({
      fetchFn: async (url: any) => {
        if (String(url).includes("/token")) {
          return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
        }
        throw new Error("unexpected fetch url");
      },
    }));
    expectRedirectTo(
      res,
      (loc) => loc.includes("gmail_error=token_invalid_grant"),
      "invalid_grant should redirect with reason",
    );
  }

  // 6) userinfo missing email => graceful error redirect
  {
    const req = makeReq({ code: "abc", state: goodState });
    const res = await handleGmailOAuthCallback(req, baseDeps({
      fetchFn: async (url: any) => {
        if (String(url).includes("/token")) {
          return new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }), {
            status: 200,
          });
        }
        if (String(url).includes("/userinfo")) {
          return new Response(JSON.stringify({}), { status: 200 });
        }
        throw new Error("unexpected fetch url");
      },
    }));
    expectRedirectTo(
      res,
      (loc) => loc.includes("gmail_error=userinfo_missing_email"),
      "missing email should redirect with reason",
    );
  }

  // 7) Upsert failure => graceful error redirect (never throw)
  {
    const req = makeReq({ code: "abc", state: goodState });
    const res = await handleGmailOAuthCallback(req, baseDeps({
      createSupabase: () =>
        fakeSupabase({ user: { id: USER }, upsertOk: false }) as any,
      fetchFn: async (url: any) => {
        if (String(url).includes("/token")) {
          return new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }), {
            status: 200,
          });
        }
        if (String(url).includes("/userinfo")) {
          return new Response(JSON.stringify({ email: "a@b.com" }), { status: 200 });
        }
        throw new Error("unexpected fetch url");
      },
    }));
    expectRedirectTo(
      res,
      (loc) => loc.includes("gmail_error=upsert_gmail_credentials"),
      "upsert failure should redirect with reason",
    );
  }

  // 8) Successful OAuth enqueues backfill job (best-effort)
  {
    const req = makeReq({ code: "abc", state: goodState });
    const deps = baseDeps({
      fetchFn: async (url: any) => {
        if (String(url).includes("/token")) {
          return new Response(JSON.stringify({ access_token: "at", expires_in: 3600, refresh_token: "rt" }), {
            status: 200,
          });
        }
        if (String(url).includes("/userinfo")) {
          return new Response(JSON.stringify({ email: "a@b.com" }), { status: 200 });
        }
        throw new Error("unexpected fetch url");
      },
    });
    const res = await handleGmailOAuthCallback(req, deps);
    expectRedirectTo(
      res,
      (loc) => loc.includes("gmail_connected=true"),
      "successful oauth should redirect to success",
    );
    assert.equal(deps.enqueuedCount, 1, "should enqueue one backfill job");
  }

  console.log("gmail_callback_hardening.test.ts: all checks passed");
}

run().catch((e) => {
  console.error("gmail_callback_hardening.test.ts: failed", e);
  process.exitCode = 1;
});

