/**
 * LIVE app→n8n→executor hop proof (task 1.6 · Phase B3). Hits real infrastructure:
 * seeds an isolated approved-draft fixture, POSTs the live n8n approval-trigger webhook (the exact
 * payload app/api/approval/route.ts emits), and asserts the deployed Channel Sender ran:
 * reply_drafts → 'sent', conversations → 'replied', and a second POST is idempotent.
 *
 * Requires: this branch deployed to NEXUS_APP_BASE_URL with CHANNEL_SENDER_TRANSPORT=sandbox +
 * N8N_INGEST_TOKEN; n8n env NEXUS_APP_BASE_URL + N8N_INGEST_TOKEN set; approval-trigger ACTIVE.
 * The deployed app's ENCRYPTION_KEY must match the one here (it decrypts the seeded token).
 *
 * Run from repo root: npx tsx scripts/e2e_live_hop.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { randomUUID } from "node:crypto";
import { createServerClient } from "@/lib/supabase";
import { encryptSecret } from "@/lib/encryption/credential-secret";

const WEBHOOK_BASE = (
  process.env.N8N_WEBHOOK_BASE_URL || "https://knurdz3o.app.n8n.cloud"
).replace(/\/+$/, "");
const WEBHOOK_URL = `${WEBHOOK_BASE}/webhook/approval-trigger`;

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const supabase = createServerClient();
const TAG = `e2e-live-hop-${Date.now()}`;
const ids = {
  drafts: [] as string[],
  leads: [] as string[],
  conversations: [] as string[],
  gmailCreds: [] as string[],
  businessProfiles: [] as string[],
  workspaces: [] as string[],
  teams: [] as string[],
};

async function insert(table: string, row: Record<string, unknown>) {
  const { data, error } = await supabase.from(table).insert(row).select("*").single();
  if (error || !data) throw new Error(`insert ${table} failed: ${error?.message}`);
  return data as Record<string, unknown>;
}

async function teardown() {
  const del = async (t: string, l: string[]) => {
    if (l.length) await supabase.from(t).delete().in("id", l);
  };
  await del("reply_drafts", ids.drafts);
  await del("leads", ids.leads);
  await del("gmail_credentials", ids.gmailCreds);
  await del("conversations", ids.conversations);
  await del("business_profiles", ids.businessProfiles);
  await del("workspaces", ids.workspaces);
  await del("teams", ids.teams);
}

async function main() {
  const teamId = randomUUID();
  const workspaceId = randomUUID();

  await insert("teams", { id: teamId, name: `${TAG} team` });
  ids.teams.push(teamId);
  await insert("workspaces", {
    id: workspaceId,
    team_id: teamId,
    name: `${TAG} ws`,
    slug: `live-${teamId.slice(0, 8)}`,
    workspace_type: "solo",
  });
  ids.workspaces.push(workspaceId);
  const bp = await insert("business_profiles", {
    team_id: teamId,
    workspace_id: workspaceId,
    name: `${TAG} biz`,
    industry: "software",
    approval_mode: "approval",
  });
  ids.businessProfiles.push(bp.id as string);
  const cred = await insert("gmail_credentials", {
    workspace_id: workspaceId,
    team_id: teamId,
    email_address: "live-sender@example.com",
    imap_username: "live-sender@example.com",
    imap_password_encrypted: encryptSecret("unused"),
    credential_type: "oauth",
    status: "connected",
    access_token_encrypted: encryptSecret("dummy-access-token"),
    refresh_token_encrypted: encryptSecret("dummy-refresh-token"),
    token_expiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    scope: "https://www.googleapis.com/auth/gmail.send",
    sync_enabled: true,
  });
  ids.gmailCreds.push(cred.id as string);

  const conv = await insert("conversations", {
    team_id: teamId,
    workspace_id: workspaceId,
    source: "gmail",
    customer_name: "Live Hop Customer",
    customer_email: "live-customer@example.com",
    message: "Is the offer still valid?",
    status: "approved",
    raw_payload: { seed: TAG, subject: "Offer question" },
  });
  ids.conversations.push(conv.id as string);
  const lead = await insert("leads", {
    conversation_id: conv.id,
    customer_name: "Live Hop Customer",
    customer_email: "live-customer@example.com",
    intent: "booking_request",
    urgency: "high",
    estimated_value: 50,
    risk_type: "none",
    risk_score: 0.1,
    status: "new",
    next_action: "request_approval",
    confidence: 0.95,
  });
  ids.leads.push(lead.id as string);
  const draft = await insert("reply_drafts", {
    lead_id: lead.id,
    conversation_id: conv.id,
    draft_text: "Yes — the offer is still valid. Shall I lock it in for you?",
    status: "pending_approval",
    approval_status: "approved",
    confidence: 0.95,
  });
  ids.drafts.push(draft.id as string);
  console.log(`  seeded approved draft ${draft.id} (team ${teamId})`);

  // The exact payload app/api/approval/route.ts POSTs on approve.
  const payload = {
    draft_id: draft.id,
    action: "approve",
    conversation_id: conv.id,
    team_id: teamId,
    workspace_id: workspaceId,
  };

  console.log(`  POST ${WEBHOOK_URL}`);
  const res1 = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body1 = await res1.text();
  console.log(`  n8n response ${res1.status}: ${body1.slice(0, 300)}`);
  assert(res1.ok, `webhook POST failed (${res1.status})`);

  const { data: d1 } = await supabase
    .from("reply_drafts")
    .select("approval_status, sent_at")
    .eq("id", draft.id)
    .maybeSingle();
  const { data: c1 } = await supabase
    .from("conversations")
    .select("status")
    .eq("id", conv.id)
    .maybeSingle();
  assert(
    (d1 as { approval_status?: string })?.approval_status === "sent",
    `draft should be 'sent' after live hop (got ${(d1 as { approval_status?: string })?.approval_status}). ` +
      "If 'approved', the deployed executor likely returned 502 — check CHANNEL_SENDER_TRANSPORT=sandbox + ENCRYPTION_KEY match on the deploy.",
  );
  const firstSentAt = (d1 as { sent_at?: string }).sent_at;
  assert(!!firstSentAt, "sent_at set");
  assert((c1 as { status?: string })?.status === "replied", "conversation should be 'replied'");
  console.log("  ✓ live hop sent the draft and transitioned statuses");

  // Idempotency: POST again → executor no-ops.
  const res2 = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  console.log(`  second POST ${res2.status}`);
  const { data: d2 } = await supabase
    .from("reply_drafts")
    .select("sent_at")
    .eq("id", draft.id)
    .maybeSingle();
  assert((d2 as { sent_at?: string })?.sent_at === firstSentAt, "sent_at unchanged (no double send)");
  console.log("  ✓ idempotent: second approval did not re-send");

  console.log("\nlive-hop: PASSED (app→n8n→executor, sandbox transport)");
}

main()
  .catch((e) => {
    console.error("\n✖", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await teardown();
      console.log("✓ teardown complete");
    } catch (e) {
      console.error("teardown error:", e instanceof Error ? e.message : e);
    }
  });
