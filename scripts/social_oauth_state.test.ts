/**
 * Security checks for the social-connect OAuth state + PKCE helpers:
 *  - state round-trips and carries org/user/platform
 *  - tampered or stale state is rejected (CSRF binding)
 *  - platformConfigured is false until provider app keys are set
 *  - PKCE challenge is the base64url SHA-256 of the verifier
 *
 * Run: tsx scripts/social_oauth_state.test.ts
 */

import { createHash } from "crypto";
import { createRequire } from "module";

// Stub `server-only` (it throws outside a Server Component bundle), mirroring the
// other route tests in this directory.
const require = createRequire(import.meta.url);
const Module = require("module") as { _load: (r: string, ...a: unknown[]) => unknown };
const origLoad = Module._load;
Module._load = function (request: string, ...args: unknown[]) {
  if (request === "server-only" || request.endsWith("server-only")) return {};
  return origLoad.call(this, request, ...args);
};

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "test-encryption-key-for-state-signing";
// Ensure provider keys are unset for the gating check.
delete process.env.X_CLIENT_ID;
delete process.env.X_CLIENT_SECRET;

const {
  decodeState,
  encodeState,
  makePkce,
  OAUTH_STATE_MAX_AGE_MS,
  platformConfigured,
} = require("../app/api/social/helpers") as typeof import("../app/api/social/helpers");

function assert(cond: unknown, msg?: string): void {
  if (!cond) throw new Error(msg || "assertion failed");
}

const ORG = "9f1c1b2a-0000-4000-8000-abcabcabcabc";
const USER = "1111aaaa-0000-4000-8000-abcabcabcabc";

// round-trip
const token = encodeState({ organization_id: ORG, user_id: USER, platform: "x" });
const decoded = decodeState(token);
assert(decoded?.organization_id === ORG, "org should round-trip");
assert(decoded?.user_id === USER, "user should round-trip");
assert(decoded?.platform === "x", "platform should round-trip");

// tamper
assert(decodeState(token.slice(0, -2) + "xy") === null, "tampered signature must be rejected");
assert(decodeState("not-a-real-state") === null, "garbage state must be rejected");

// staleness
const stale = encodeState(
  { organization_id: ORG, user_id: USER, platform: "x" },
  Date.now() - OAUTH_STATE_MAX_AGE_MS - 1000,
);
assert(decodeState(stale) === null, "stale state must be rejected");

// gating
assert(platformConfigured("x") === false, "x must be unconfigured without provider keys");

// pkce
const { verifier, challenge } = makePkce();
const expected = createHash("sha256").update(verifier).digest("base64url");
assert(challenge === expected, "PKCE challenge must be base64url(sha256(verifier))");

console.log("social_oauth_state.test.ts: all checks passed");
