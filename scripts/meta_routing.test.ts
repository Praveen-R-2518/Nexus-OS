/**
 * Meta tenant-routing + normalization + deep-link tests (Task 2).
 * Run: npx tsx scripts/meta_routing.test.ts   (or `npm run test:meta-routing`)
 *
 * Proves, entirely from sanitized fixtures (no live Meta credentials, no DB):
 *  A. extractMetaRoute pulls the correct platform + routing key for WA / IG / FB.
 *  B. resolveMetaTenant resolves the right tenant per platform via an injected lookup, and returns
 *     null for an unmatched routing key.
 *  C. multi_channel_normalizer emits canonical fields (source, sender identity, text body,
 *     external_thread_id, external_permalink, timestamp_utc) per platform.
 *  D. WhatsApp deep link targets the CUSTOMER number; IG/FB fall back to the graceful
 *     "unavailable" (null) state rather than a wrong link.
 *  E. End-to-end webhook: an unmatched routing key marks inbound_events failed=tenant_unresolved
 *     and does NOT forward to n8n; a matched key stamps the tenant and forwards an enriched body.
 *
 * `server-only` and `@/lib/supabase` are stubbed; the real route + helpers run unmodified.
 */

import Module from "node:module";
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const APP_SECRET = "test-app-secret";
const TEAM_WA = "11111111-1111-4111-8111-111111111111";
const WS_WA = "22222222-2222-4222-8222-222222222222";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "n8n_logic", "fixtures");
function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}
const waFixture = fixture("meta_whatsapp_inbound.json");
const igFixture = fixture("meta_instagram_inbound.json");
const fbFixture = fixture("meta_facebook_inbound.json");

// --- In-memory Supabase fake (inbound_events + business_profiles) ----------------
type Row = Record<string, unknown> & { id: string };
const store: Record<string, Row[]> = {
  inbound_events: [],
  business_profiles: [],
};
let rowSeq = 0;

function tableRows(name: string): Row[] {
  if (!store[name]) store[name] = [];
  return store[name];
}

const fakeClient = {
  from(table: string) {
    const rows = tableRows(table);
    return {
      upsert(row: Record<string, unknown>, opts: { onConflict: string; ignoreDuplicates?: boolean }) {
        return {
          select(_cols: string) {
            const keys = String(opts.onConflict).split(",").map((s) => s.trim());
            const hit = rows.find((r) => keys.every((k) => r[k] === row[k]));
            if (hit) {
              if (opts.ignoreDuplicates) return Promise.resolve({ data: [], error: null });
              Object.assign(hit, row);
              return Promise.resolve({ data: [{ id: hit.id }], error: null });
            }
            const inserted: Row = { id: `evt_${++rowSeq}`, ...row };
            rows.push(inserted);
            return Promise.resolve({ data: [{ id: inserted.id }], error: null });
          },
        };
      },
      update(patch: Record<string, unknown>) {
        return {
          in(col: string, ids: string[]) {
            for (const r of rows) if (ids.includes(r[col] as string)) Object.assign(r, patch);
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
      insert(row: Record<string, unknown>) {
        rows.push({ id: `row_${++rowSeq}`, ...row });
        return Promise.resolve({ data: null, error: null });
      },
      select(_cols: string) {
        const filters: Array<[string, unknown]> = [];
        const builder = {
          eq(col: string, val: unknown) {
            filters.push([col, val]);
            return builder;
          },
          limit(n: number) {
            const res = rows
              .filter((r) => filters.every(([c, v]) => r[c] === v))
              .slice(0, n);
            return Promise.resolve({ data: res, error: null });
          },
        };
        return builder;
      },
    };
  },
};

// --- Module interception ------------------------------------------------------------------------
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

process.env.META_APP_SECRET = APP_SECRET;
process.env.N8N_WEBHOOK_BASE_URL = "https://n8n.test";

// Count + capture n8n forwards.
const forwards: Array<{ url: string; body: Record<string, unknown> }> = [];
(globalThis as unknown as { fetch: unknown }).fetch = async (url: unknown, opts: { body?: string }) => {
  forwards.push({ url: String(url), body: opts?.body ? JSON.parse(opts.body) : {} });
  return { ok: true, status: 200, text: async () => "" } as unknown;
};

function sign(body: string): string {
  return "sha256=" + createHmac("sha256", APP_SECRET).update(body, "utf8").digest("hex");
}
function post(POST: (r: Request) => Promise<Response>, payload: unknown) {
  const body = JSON.stringify(payload);
  return POST(
    new Request("https://example.com/api/meta/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(body) },
      body,
    }),
  );
}

const require = createRequire(import.meta.url);

(async () => {
  // ---------------------------------------------------------------------------------------------
  // A. Routing key extraction per platform.
  const { extractMetaRoute, resolveMetaTenant } = await import("@/lib/meta-tenant");

  const waRoute = extractMetaRoute(waFixture);
  assert(waRoute?.platform === "whatsapp" && waRoute?.routingKey === "109999888777666", "WA route = phone_number_id");

  const igRoute = extractMetaRoute(igFixture);
  assert(igRoute?.platform === "instagram" && igRoute?.routingKey === "17841400000000123", "IG route = ig account id");

  const fbRoute = extractMetaRoute(fbFixture);
  assert(fbRoute?.platform === "facebook" && fbRoute?.routingKey === "102000000000555", "FB route = page id");

  assert(extractMetaRoute({ object: "page", entry: [] }) === null, "no routing key → null route");
  assert(extractMetaRoute("garbage") === null, "non-object → null route");

  // ---------------------------------------------------------------------------------------------
  // B. resolveMetaTenant with an injected (pure) lookup.
  const directory: Record<string, { workspace_id: string | null; team_id: string }> = {
    "whatsapp:109999888777666": { workspace_id: WS_WA, team_id: TEAM_WA },
    "instagram:17841400000000123": { workspace_id: "ws-ig", team_id: "team-ig" },
    "facebook:102000000000555": { workspace_id: null, team_id: "team-fb" },
  };
  const lookup = async (r: { platform: string; routingKey: string }) =>
    directory[`${r.platform}:${r.routingKey}`] ?? null;

  const waTenant = await resolveMetaTenant(waFixture, lookup);
  assert(waTenant?.platform === "whatsapp" && waTenant?.team_id === TEAM_WA && waTenant?.workspace_id === WS_WA, "WA tenant resolved");

  const igTenant = await resolveMetaTenant(igFixture, lookup);
  assert(igTenant?.platform === "instagram" && igTenant?.team_id === "team-ig", "IG tenant resolved");

  const fbTenant = await resolveMetaTenant(fbFixture, lookup);
  assert(fbTenant?.platform === "facebook" && fbTenant?.team_id === "team-fb" && fbTenant?.workspace_id === null, "FB tenant resolved (null workspace ok)");

  const unmatched = await resolveMetaTenant(
    { object: "whatsapp_business_account", entry: [{ id: "x", changes: [{ value: { metadata: { phone_number_id: "DOES_NOT_EXIST" }, messages: [{ id: "m" }] } }] }] },
    lookup,
  );
  assert(unmatched === null, "unmatched routing key → null tenant");

  // ---------------------------------------------------------------------------------------------
  // C. Normalizer canonical output per platform.
  const normalizer = require("../n8n_logic/multi_channel_normalizer.js");
  const tenantEnvelope = { team_id: TEAM_WA, workspace_id: WS_WA };

  const waNorm = normalizer.normalizeItem({ ...waFixture, _tenant: tenantEnvelope });
  assert(waNorm.source === "whatsapp", "WA normalized source");
  assert(waNorm.customer_email_or_phone === "15551234567", "WA sender identity = customer number");
  assert(waNorm.customer_name === "Jordan Rivera", "WA sender name");
  assert(waNorm.message === "Hi, is the downtown unit still available?", "WA text body");
  assert(waNorm.external_thread_id === "wa:wamid.HBgLMTU1NTEyMzQ1NjcVAgASGBQ3RUYxQTBDOEE1RTk0MQA=", "WA thread id");
  assert(typeof waNorm.timestamp_utc === "string" && waNorm.timestamp_utc === waNorm.received_at, "WA timestamp_utc present");
  assert(waNorm.external_permalink === "https://wa.me/15551234567", "WA permalink = customer wa.me (NOT business)");
  assert(waNorm.team_id === TEAM_WA, "WA tenant stamped onto canonical output");

  const igNorm = normalizer.normalizeItem({ ...igFixture, _tenant: tenantEnvelope });
  assert(igNorm.source === "instagram", "IG normalized source");
  assert(igNorm.customer_email_or_phone === "9988776655443322", "IG sender identity = sender id");
  assert(igNorm.message === "Do you ship to Canada?", "IG text body");
  assert(igNorm.external_thread_id === "ig:aWdfMTpJR01lc3NhZ2VJRDoxNzg0MTQwMDAwMDAwMDEyMzo0AA==", "IG thread id from mid");
  assert(igNorm.external_permalink === "https://ig.me/m/jordan.rivera", "IG permalink = ig.me by username");
  assert(typeof igNorm.timestamp_utc === "string", "IG timestamp_utc present");

  const fbNorm = normalizer.normalizeItem({ ...fbFixture, _tenant: tenantEnvelope });
  assert(fbNorm.source === "facebook", "FB normalized source");
  assert(fbNorm.customer_email_or_phone === "7766554433221100", "FB sender identity = PSID");
  assert(fbNorm.message === "What are your hours today?", "FB text body");
  assert(fbNorm.external_thread_id === "fb:m_FbMessageIDsanitized0001AbCdEf", "FB thread id from mid");
  assert(fbNorm.external_permalink === null, "FB permalink null (mid is not a thread id)");
  assert(typeof fbNorm.timestamp_utc === "string", "FB timestamp_utc present");

  // ---------------------------------------------------------------------------------------------
  // D. Deep links (consumes canonical conversation rows).
  const { resolveExternalInboxUrl } = await import("@/lib/meta-deep-links");

  assert(
    resolveExternalInboxUrl({ source: "whatsapp", customer_email: "+1 (555) 123-4567", external_permalink: "https://wa.me/15550009999", external_thread_id: "wa:x" }) === "https://wa.me/15551234567",
    "WhatsApp deep link uses CUSTOMER number, ignoring a business permalink",
  );
  assert(
    resolveExternalInboxUrl({ source: "instagram", customer_email: "jordan.rivera", external_permalink: null, external_thread_id: "ig:mid" }) === "https://ig.me/m/jordan.rivera",
    "Instagram deep link by username",
  );
  assert(
    resolveExternalInboxUrl({ source: "instagram", customer_email: "9988776655443322", external_permalink: null, external_thread_id: "ig:mid" }) === null,
    "Instagram with only a numeric id → unavailable (null)",
  );
  assert(
    resolveExternalInboxUrl({ source: "facebook", customer_email: "7766554433221100", external_permalink: null, external_thread_id: "fb:mid" }) === null,
    "Facebook with only a mid → unavailable (null), never a /t/<mid> link",
  );

  // ---------------------------------------------------------------------------------------------
  // E. End-to-end webhook.
  const { POST } = await import("@/app/api/meta/webhook/route");

  // E1. No matching business_profiles → tenant_unresolved, failed, NOT forwarded, still 200.
  store.business_profiles.length = 0;
  const forwardsBefore = forwards.length;
  const unresolved = await post(POST, igFixture);
  assert(unresolved.status === 200, `unresolved tenant should still 200, got ${unresolved.status}`);
  assert((await unresolved.json()).status === "tenant_unresolved", "response status = tenant_unresolved");
  assert(forwards.length === forwardsBefore, "unresolved tenant must NOT forward to n8n");
  const igRow = store.inbound_events.find((r) => r.platform === "instagram");
  assert(igRow?.status === "failed" && igRow?.error === "tenant_unresolved", "inbound row failed=tenant_unresolved");

  // E2. Matching business_profiles → tenant stamped + enriched forward.
  store.business_profiles.push({ id: "bp_1", team_id: TEAM_WA, workspace_id: WS_WA, wa_phone_number_id: "109999888777666" });
  const matched = await post(POST, waFixture);
  assert(matched.status === 200, `matched tenant should 200, got ${matched.status}`);
  assert((await matched.json()).status === "received", "matched response status = received");
  assert(forwards.length === forwardsBefore + 1, "matched tenant forwards exactly once");
  const fwd = forwards[forwards.length - 1];
  const fwdTenant = fwd.body._tenant as Record<string, unknown> | undefined;
  assert(fwdTenant?.team_id === TEAM_WA && fwdTenant?.workspace_id === WS_WA, "forward body carries resolved _tenant");
  assert(fwdTenant?.route_source === "whatsapp" && fwdTenant?.route_key === "109999888777666", "forward _tenant carries platform + routing key");
  const waRow = store.inbound_events.find((r) => r.platform === "whatsapp");
  assert(waRow?.team_id === TEAM_WA && waRow?.workspace_id === WS_WA, "inbound row tenant-stamped");
  assert(waRow?.status === "processing", "matched + forwarded → status processing");

  console.log("meta_routing.test.ts: all checks passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
