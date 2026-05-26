/**
 * Focused checks for tenant route resolution, normalization with _tenant, and dedup URL scoping.
 * Run: node scripts/tenant_intake_mapping.test.mjs
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tenant = require("../n8n_logic/tenant_route_resolver.js");
const normalizer = require("../n8n_logic/multi_channel_normalizer.js");
const dedup = require("../n8n_logic/deduplication_lookup.js");

const TEAM = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const WS = "11111111-2222-4333-8444-555555555555";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

process.env.NEXUS_GMAIL_DESTINATION_MAILBOX = "nexus.demo@gmail.com";

let gmail = tenant.extractGmailDestinationMailbox(
  { headers: { "delivered-to": "Inbox <nexus.demo@gmail.com>" } },
  "",
);
assert(gmail === "nexus.demo@gmail.com", `gmail extract expected nexus.demo@gmail.com, got ${gmail}`);

gmail = tenant.extractGmailDestinationMailbox({ to: "Other <x@y.com>" }, "nexus.demo@gmail.com");
assert(gmail === "x@y.com", "should prefer header To over env when present");

const route = tenant.resolveRouteFromIntake({
  headers: {},
  body: {},
  query: {},
});
assert(route.type === "gmail_mailbox" && route.value === "nexus.demo@gmail.com", JSON.stringify(route));

process.env.NEXUS_WHATSAPP_TOKEN_HEADER = "x-nexus-webhook-token";
const routeTok = tenant.resolveRouteFromIntake({
  headers: { "x-nexus-webhook-token": "secret-token-1" },
  body: { from: "a@b.com", message: "hi" },
});
assert(routeTok.type === "webhook_token" && routeTok.value === "secret-token-1", JSON.stringify(routeTok));

const qPath = tenant.buildBusinessProfileLookupPath({ type: "gmail_mailbox", value: "nexus.demo@gmail.com" });
assert(
  qPath.includes("gmail_destination_email=eq.") && qPath.includes(encodeURIComponent("nexus.demo@gmail.com")),
  qPath,
);

const qTeam = dedup.buildLookupPath({
  team_id: TEAM,
  customer_email_or_phone: "Lead@Example.com",
  message: "x",
  source: "gmail",
});
assert(qTeam.includes("&team_id=eq."), qTeam);
assert(qTeam.indexOf("&team_id=eq.") < qTeam.indexOf("&or=("), "team_id filter should appear before identity or()");

try {
  dedup.buildLookupPath({ customer_email_or_phone: "a@b.com" });
  assert(false, "expected team_id error");
} catch (e) {
  assert(/team_id/i.test(String(e.message)), e.message);
}

try {
  tenant.verifySingleBusinessProfile([]);
  assert(false, "expected empty profile error");
} catch (e) {
  assert(/no business_profiles/i.test(String(e.message)), e.message);
}

try {
  tenant.verifySingleBusinessProfile([
    { id: "d47ac10b-58cc-4372-a567-0e02b2c3d479", team_id: TEAM },
    { id: "e47ac10b-58cc-4372-a567-0e02b2c3d479", team_id: TEAM },
  ]);
  assert(false, "expected ambiguous error");
} catch (e) {
  assert(/ambiguous/i.test(String(e.message)), e.message);
}

const profile = tenant.verifySingleBusinessProfile([
  { id: "b47ac10b-58cc-4372-a567-0e02b2c3d479", team_id: TEAM, workspace_id: WS },
]);
assert(profile.team_id === TEAM, profile.team_id);

const norm = normalizer.normalizeItem({
  from: "Alice <alice@test.com>",
  subject: "Hi",
  textPlain: "Need help with billing",
  _tenant: {
    team_id: TEAM,
    workspace_id: WS,
    business_profile_id: "a47ac10b-58cc-4372-a867-0e02b2c3d479",
    route_source: "gmail_mailbox",
    route_key: "nexus.demo@gmail.com",
  },
});
assert(norm.team_id === TEAM && norm.workspace_id === WS, JSON.stringify(norm));
assert(norm.source === "gmail", norm.source);

const wa = normalizer.normalizeItem({
  channel: "whatsapp",
  from: "+15550001",
  message: "Hello from WA",
  _tenant: {
    team_id: TEAM,
    workspace_id: WS,
    business_profile_id: "a47ac10b-58cc-4372-a867-0e02b2c3d479",
    route_source: "whatsapp_number",
    route_key: "+15550001",
  },
});
assert(wa.source === "webhook" && wa.channel === "whatsapp", JSON.stringify(wa));

try {
  normalizer.normalizeItem({ from: "a@b.com", subject: "s", textPlain: "x" });
  assert(false, "expected _tenant error");
} catch (e) {
  assert(/_tenant/i.test(String(e.message)), e.message);
}

console.log("tenant_intake_mapping.test.mjs: all checks passed");
