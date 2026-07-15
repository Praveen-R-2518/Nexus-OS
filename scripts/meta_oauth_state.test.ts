/**
 * Unit tests for the HMAC-signed Meta OAuth state (app/api/meta/helpers.ts).
 * Run: npx tsx scripts/meta_oauth_state.test.ts  (or `npm run test:meta-oauth-state`)
 *
 * Meta's OAuth state was previously plain (unsigned) base64url JSON; it is now
 * HMAC-signed with an issued-at timestamp, mirroring the Gmail flow. The
 * signature, expiry, and tamper rejection are load-bearing security checks that
 * make the callback state unforgeable.
 */

process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "test-encryption-key-for-oauth-state";

import {
  encodeOAuthState,
  decodeOAuthState,
  OAUTH_STATE_MAX_AGE_MS,
  type MetaOAuthState,
} from "@/app/api/meta/helpers";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const STATE: MetaOAuthState = {
  workspace_id: "2472750e-9152-4206-a602-237a71f10fbe",
  team_id: "ce71d8cf-f3e3-4dc2-bf8c-5bba049a4d46",
  user_id: "6d265fe4-97f8-4556-822f-08833303787b",
  platform: "instagram",
};

check("sign/verify round-trip preserves state incl. platform", () => {
  const decoded = decodeOAuthState(encodeOAuthState(STATE));
  assert(decoded, "decode returned null");
  assert(decoded!.workspace_id === STATE.workspace_id, "workspace_id mismatch");
  assert(decoded!.team_id === STATE.team_id, "team_id mismatch");
  assert(decoded!.user_id === STATE.user_id, "user_id mismatch");
  assert(decoded!.platform === "instagram", "platform mismatch");
});

check("tampered payload is rejected", () => {
  const token = encodeOAuthState(STATE);
  const [payload, sig] = token.split(".");
  const forged = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  forged.team_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const forgedPayload = Buffer.from(JSON.stringify(forged)).toString("base64url");
  assert(
    decodeOAuthState(`${forgedPayload}.${sig}`) === null,
    "forged payload accepted",
  );
});

check("tampered signature is rejected", () => {
  const token = encodeOAuthState(STATE);
  const [payload] = token.split(".");
  const badSig = Buffer.from("0".repeat(32)).toString("base64url");
  assert(
    decodeOAuthState(`${payload}.${badSig}`) === null,
    "bad signature accepted",
  );
});

check("legacy unsigned base64 state is rejected", () => {
  const legacy = Buffer.from(JSON.stringify(STATE)).toString("base64url");
  assert(decodeOAuthState(legacy) === null, "unsigned state accepted");
});

check("expired state is rejected", () => {
  const issued = Date.now() - OAUTH_STATE_MAX_AGE_MS - 1000;
  assert(
    decodeOAuthState(encodeOAuthState(STATE, issued)) === null,
    "expired state accepted",
  );
});

check("state just under max age is accepted", () => {
  const issued = Date.now() - OAUTH_STATE_MAX_AGE_MS + 5000;
  assert(
    decodeOAuthState(encodeOAuthState(STATE, issued)) !== null,
    "fresh state rejected",
  );
});

check("future-dated state beyond skew tolerance is rejected", () => {
  assert(
    decodeOAuthState(encodeOAuthState(STATE, Date.now() + 5 * 60 * 1000)) === null,
    "future state accepted",
  );
});

check("non-uuid fields are rejected even when correctly signed", () => {
  const token = encodeOAuthState({
    ...STATE,
    user_id: "not-a-uuid",
  } as MetaOAuthState);
  assert(decodeOAuthState(token) === null, "non-uuid state accepted");
});

check("unknown platform is dropped, not fatal", () => {
  const token = encodeOAuthState({
    ...STATE,
    platform: "linkedin" as unknown as MetaOAuthState["platform"],
  });
  const decoded = decodeOAuthState(token);
  assert(decoded, "decode returned null for unknown platform");
  assert(decoded!.platform === undefined, "unknown platform not dropped");
});

check("garbage input returns null, never throws", () => {
  assert(decodeOAuthState("") === null, "empty accepted");
  assert(decodeOAuthState("a.b.c") === null, "triple-part accepted");
  assert(decodeOAuthState("%%%.###") === null, "garbage accepted");
});

console.log(`\nmeta_oauth_state: ${passed}/10 checks passed`);
