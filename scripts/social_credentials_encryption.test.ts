/**
 * Social credentials encryption tests (Task 4.3).
 * Run: npm run test:social-credentials
 *
 * Proves:
 *  1. encryptSecret / decryptSecret round-trip
 *  2. upsertSocialCredential writes only *_encrypted columns (no plaintext)
 *  3. GET /api/internal/n8n/social-credentials decrypts and returns tokens
 *  4. 401 without Bearer token; 400 with invalid organization_id
 */

import Module from "node:module";
import {
  decryptSecret,
  encryptSecret,
} from "@/lib/encryption/credential-secret";

const TOKEN = "test-ingest-token";
const ORG = "9f1c1b2a-0000-4000-8000-abcabcabcabc";
const ACCESS = "test-access-token-plain";
const REFRESH = "test-refresh-token-plain";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

type Row = Record<string, unknown> & { id: string };
const store: Record<string, Row[]> = { social_credentials: [] };
let rowSeq = 0;

const fakeClient = {
  from(table: string) {
    const rows = (store[table] ??= []);
    return {
      upsert(row: Record<string, unknown>, opts: { onConflict: string }) {
        const keys = String(opts.onConflict).split(",").map((s) => s.trim());
        const hit = rows.find((r) => keys.every((k) => r[k] === row[k]));
        if (hit) {
          Object.assign(hit, row);
          return Promise.resolve({ error: null });
        }
        const inserted: Row = { id: `cred_${++rowSeq}`, ...row };
        rows.push(inserted);
        return Promise.resolve({ error: null });
      },
      select(_cols: string) {
        const chain = {
          eq(col: string, val: unknown) {
            const filtered = rows.filter((r) => r[col] === val);
            return Promise.resolve({ data: filtered, error: null });
          },
        };
        return chain;
      },
    };
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

process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars-min!!";
process.env.N8N_INGEST_TOKEN = TOKEN;

async function main() {
  // --- round-trip -----------------------------------------------------------
  const encrypted = encryptSecret(ACCESS);
  assert(decryptSecret(encrypted) === ACCESS, "encrypt/decrypt round-trip");

  // --- upsert helper --------------------------------------------------------
  const { upsertSocialCredential } = await import("@/lib/social/credentials");
  const upsertResult = await upsertSocialCredential(fakeClient as never, {
    organizationId: ORG,
    platform: "instagram",
    accessToken: ACCESS,
    refreshToken: REFRESH,
    tokenExpiresAt: "2026-12-31T00:00:00.000Z",
  });
  assert(upsertResult.ok, "upsert should succeed");

  const stored = store.social_credentials[0];
  assert(stored.access_token_encrypted, "must write access_token_encrypted");
  assert(stored.refresh_token_encrypted, "must write refresh_token_encrypted");
  assert(stored.access_token === null, "must not write plaintext access_token");
  assert(stored.refresh_token === null, "must not write plaintext refresh_token");
  assert(
    decryptSecret(String(stored.access_token_encrypted)) === ACCESS,
    "stored access token decrypts correctly",
  );

  // --- GET endpoint ---------------------------------------------------------
  const { GET } = await import("@/app/api/internal/n8n/social-credentials/route");

  const unauthorized = await GET(
    new Request(
      `https://app.test/api/internal/n8n/social-credentials?organization_id=${ORG}`,
    ),
  );
  assert(unauthorized.status === 401, "missing token -> 401");

  const badOrg = await GET(
    new Request(
      "https://app.test/api/internal/n8n/social-credentials?organization_id=not-a-uuid",
      { headers: { authorization: `Bearer ${TOKEN}` } },
    ),
  );
  assert(badOrg.status === 400, "invalid organization_id -> 400");

  const ok = await GET(
    new Request(
      `https://app.test/api/internal/n8n/social-credentials?organization_id=${ORG}`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    ),
  );
  assert(ok.status === 200, "valid request -> 200");
  const body = (await ok.json()) as {
    success: boolean;
    data: Array<{ platform: string; access_token: string; refresh_token: string }>;
  };
  assert(body.success && body.data.length === 1, "returns one credential");
  assert(body.data[0].platform === "instagram", "platform preserved");
  assert(body.data[0].access_token === ACCESS, "access_token decrypted");
  assert(body.data[0].refresh_token === REFRESH, "refresh_token decrypted");

  // --- skip rows missing encrypted payload ----------------------------------
  store.social_credentials.push({
    id: "cred_legacy",
    organization_id: ORG,
    platform: "facebook",
    access_token_encrypted: null,
    refresh_token_encrypted: null,
    token_expires_at: null,
  });

  const partial = await GET(
    new Request(
      `https://app.test/api/internal/n8n/social-credentials?organization_id=${ORG}`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    ),
  );
  const partialBody = (await partial.json()) as { data: Array<{ platform: string }> };
  assert(partialBody.data.length === 1, "skips rows without access_token_encrypted");
  assert(partialBody.data[0].platform === "instagram", "returns only decryptable row");

  console.log("social_credentials_encryption.test.ts: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
