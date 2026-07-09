import { strict as assert } from "node:assert";
import { handleGmailOAuthCallback } from "../app/api/gmail/callback/handler";

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

async function run() {
  // 1) Missing params => redirect with reason code (never throw)
  {
    const req = makeReq({ state: "x" });
    const res = await handleGmailOAuthCallback(req, {
      createSupabase: () => fakeSupabase({ user: { id: USER } }) as any,
      fetchFn: async () => {
        throw new Error("fetch should not run");
      },
      encrypt: () => "enc",
      isEncryptionReady: () => true,
      oauthConfigHasError: () => false,
      redirectUri: () => "https://example.test/api/gmail/callback",
    });
    expectRedirectTo(
      res,
      (loc) => loc.includes("/signup?") && loc.includes("gmail_error=missing_params"),
      "missing params should redirect with reason",
    );
  }

  // 2) Invalid state => redirect
  {
    const req = makeReq({ code: "abc", state: "not-base64" });
    const res = await handleGmailOAuthCallback(req, {
      createSupabase: () => fakeSupabase({ user: { id: USER } }) as any,
      fetchFn: async () => {
        throw new Error("fetch should not run");
      },
      encrypt: () => "enc",
      isEncryptionReady: () => true,
      oauthConfigHasError: () => false,
      redirectUri: () => "https://example.test/api/gmail/callback",
    });
    expectRedirectTo(
      res,
      (loc) => loc.includes("gmail_error=invalid_state"),
      "invalid state should redirect",
    );
  }

  const goodState = makeStateBase64Url({
    workspace_id: WS,
    team_id: TEAM,
    user_id: USER,
  });

  // 3) Missing session => /login redirect (never 500)
  {
    const req = makeReq({ code: "abc", state: goodState });
    const res = await handleGmailOAuthCallback(req, {
      createSupabase: () => fakeSupabase({ user: null }) as any,
      fetchFn: async () => {
        throw new Error("fetch should not run");
      },
      encrypt: () => "enc",
      isEncryptionReady: () => true,
      oauthConfigHasError: () => false,
      redirectUri: () => "https://example.test/api/gmail/callback",
    });
    expectRedirectTo(
      res,
      (loc) => loc.includes("/login?next="),
      "missing session should redirect to login",
    );
  }

  // 4) Already connected => success redirect, no token exchange needed
  {
    const req = makeReq({ code: "abc", state: goodState });
    const res = await handleGmailOAuthCallback(req, {
      createSupabase: () =>
        fakeSupabase({ user: { id: USER }, alreadyConnected: true }) as any,
      fetchFn: async () => {
        throw new Error("fetch should not be called when already connected");
      },
      encrypt: () => "enc",
      isEncryptionReady: () => true,
      oauthConfigHasError: () => false,
      redirectUri: () => "https://example.test/api/gmail/callback",
    });
    expectRedirectTo(
      res,
      (loc) => loc.includes("gmail_connected=true"),
      "already connected should redirect to success",
    );
  }

  // 5) invalid_grant + not connected => graceful error redirect
  {
    const req = makeReq({ code: "abc", state: goodState });
    const res = await handleGmailOAuthCallback(req, {
      createSupabase: () => fakeSupabase({ user: { id: USER } }) as any,
      fetchFn: async (url: any) => {
        if (String(url).includes("/token")) {
          return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
        }
        throw new Error("unexpected fetch url");
      },
      encrypt: () => "enc",
      isEncryptionReady: () => true,
      oauthConfigHasError: () => false,
      redirectUri: () => "https://example.test/api/gmail/callback",
    });
    expectRedirectTo(
      res,
      (loc) => loc.includes("gmail_error=token_invalid_grant"),
      "invalid_grant should redirect with reason",
    );
  }

  // 6) userinfo missing email => graceful error redirect
  {
    const req = makeReq({ code: "abc", state: goodState });
    const res = await handleGmailOAuthCallback(req, {
      createSupabase: () => fakeSupabase({ user: { id: USER } }) as any,
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
      encrypt: () => "enc",
      isEncryptionReady: () => true,
      oauthConfigHasError: () => false,
      redirectUri: () => "https://example.test/api/gmail/callback",
    });
    expectRedirectTo(
      res,
      (loc) => loc.includes("gmail_error=userinfo_missing_email"),
      "missing email should redirect with reason",
    );
  }

  // 7) Upsert failure => graceful error redirect (never throw)
  {
    const req = makeReq({ code: "abc", state: goodState });
    const res = await handleGmailOAuthCallback(req, {
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
      encrypt: () => "enc",
      isEncryptionReady: () => true,
      oauthConfigHasError: () => false,
      redirectUri: () => "https://example.test/api/gmail/callback",
    });
    expectRedirectTo(
      res,
      (loc) => loc.includes("gmail_error=upsert_gmail_credentials"),
      "upsert failure should redirect with reason",
    );
  }

  console.log("gmail_callback_hardening.test.ts: all checks passed");
}

run().catch((e) => {
  console.error("gmail_callback_hardening.test.ts: failed", e);
  process.exitCode = 1;
});

