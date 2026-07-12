/**
 * Focused checks for invite link building.
 * Run: tsx scripts/invites_unit.test.ts
 */

process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";

import { buildInviteLink, INVITE_ROLES } from "../lib/invites";

function assert(cond: unknown, msg?: string): void {
  if (!cond) throw new Error(msg || "assertion failed");
}

const token = "1dbc817c-a2b8-4aef-b379-fd927f2d1c98";
const link = buildInviteLink(token);

assert(
  link === `https://app.example.com/signup?invite=${token}`,
  `unexpected invite link: ${link}`,
);
// The token must land in the ?invite= param the signup page reads.
assert(new URL(link).searchParams.get("invite") === token, "token must round-trip through the URL");

// Only member/admin are invitable (owner is the org creator, set by the trigger).
assert(
  INVITE_ROLES.length === 2 && INVITE_ROLES.includes("member") && INVITE_ROLES.includes("admin"),
  "invite roles should be member + admin",
);
assert(!(INVITE_ROLES as string[]).includes("owner"), "owner must not be invitable");

console.log("invites_unit.test.ts: all checks passed");
