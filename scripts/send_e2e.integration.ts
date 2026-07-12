/**
 * Channel Sender END-TO-END integration proof (task 1.6). Runs against the LIVE Supabase using a
 * service-role client and the **sandbox** Gmail transport (no real email is sent). Proves, against
 * real tables/triggers/credential-decrypt:
 *   1. executeSendReply sends an approved draft → draft 'sent' + sent_at, conversation 'replied'.
 *   2. Idempotency: a second call is a no-op (alreadySent) and sent_at is unchanged.
 *   3. autopilotSend auto-sends a safe autopilot draft.
 *   4. autopilotSend GATES a churn-risk/high-value draft (stays pending, not sent).
 * Also proves the 2.4 triggers: reply_drafts/leads inserted with only conversation_id get their
 * team_id/workspace_id filled from the parent conversation.
 *
 * Everything is created under an ISOLATED, marked test tenant and torn down in `finally`.
 * Run: CHANNEL_SENDER_TRANSPORT=sandbox npx tsx scripts/send_e2e.integration.ts
 *      (or `npm run test:send-e2e`, which sets the env var for you)
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + ENCRYPTION_KEY in .env.local.
 */

process.env.CHANNEL_SENDER_TRANSPORT = "sandbox";

import { config } from "dotenv";
config({ path: ".env.local" });

import { randomUUID } from "node:crypto";
import { createServerClient } from "@/lib/supabase";
import { encryptSecret } from "@/lib/encryption/credential-secret";
import { executeSendReply, autopilotSend } from "@/lib/channel-sender";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

let passed = 0;
function ok(name: string): void {
  passed += 1;
  console.log(`  ok  ${name}`);
}

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) fail("SUPABASE_SERVICE_ROLE_KEY is not set.");
if (!process.env.ENCRYPTION_KEY?.trim()) fail("ENCRYPTION_KEY is not set.");

const supabase = createServerClient();
const TAG = `e2e-send-proof-${Date.now()}`;

// IDs we create, deleted in teardown (child → parent order).
const ids = {
  drafts: [] as string[],
  leads: [] as string[],
  conversations: [] as string[],
  gmailCreds: [] as string[],
  businessProfiles: [] as string[],
  workspaces: [] as string[],
  teams: [] as string[],
};

async function insert<T extends Record<string, unknown>>(
  table: string,
  row: T,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from(table).insert(row).select("*").single();
  // Throw (do NOT process.exit) so main().catch → finally teardown always runs.
  if (error || !data) throw new Error(`insert ${table} failed: ${error?.message}`);
  return data as Record<string, unknown>;
}

async function fetchDraft(id: string): Promise<Record<string, unknown>> {
  const { data } = await supabase.from("reply_drafts").select("*").eq("id", id).maybeSingle();
  return (data ?? {}) as Record<string, unknown>;
}
async function fetchConversation(id: string): Promise<Record<string, unknown>> {
  const { data } = await supabase.from("conversations").select("*").eq("id", id).maybeSingle();
  return (data ?? {}) as Record<string, unknown>;
}

/** Seed a conversation + lead + draft trio. lead/draft carry only conversation_id (triggers fill tenant). */
async function seedTrio(opts: {
  teamId: string;
  workspaceId: string;
  approvalStatus: "pending" | "approved";
  riskType?: string;
  riskScore?: number;
  estimatedValue?: number;
  confidence?: number;
}): Promise<{ conversationId: string; leadId: string; draftId: string }> {
  const conv = await insert("conversations", {
    team_id: opts.teamId,
    workspace_id: opts.workspaceId,
    source: "gmail",
    customer_name: "E2E Customer",
    customer_email: "e2e-customer@example.com",
    message: "Do you still have availability this week?",
    status: "classified",
    raw_payload: { seed: TAG, subject: "Availability question" },
  });
  ids.conversations.push(conv.id as string);

  // lead: only conversation_id for tenant → trigger fills team_id/workspace_id.
  const lead = await insert("leads", {
    conversation_id: conv.id,
    customer_name: "E2E Customer",
    customer_email: "e2e-customer@example.com",
    intent: "booking_request",
    urgency: "high",
    estimated_value: opts.estimatedValue ?? 50,
    risk_type: opts.riskType ?? "none",
    risk_score: opts.riskScore ?? 0.1,
    status: "new",
    next_action: "request_approval",
    confidence: opts.confidence ?? 0.95,
  });
  ids.leads.push(lead.id as string);
  assert(lead.team_id === opts.teamId, "trigger filled leads.team_id from conversation");

  // draft: only conversation_id for tenant → trigger fills team_id/workspace_id.
  const draft = await insert("reply_drafts", {
    lead_id: lead.id,
    conversation_id: conv.id,
    draft_text: "Yes — we have availability. Want me to hold a slot for you?",
    status: "pending_approval",
    approval_status: opts.approvalStatus,
    confidence: opts.confidence ?? 0.95,
  });
  ids.drafts.push(draft.id as string);
  assert(draft.team_id === opts.teamId, "trigger filled reply_drafts.team_id from conversation");
  assert(draft.workspace_id === opts.workspaceId, "trigger filled reply_drafts.workspace_id");

  return {
    conversationId: conv.id as string,
    leadId: lead.id as string,
    draftId: draft.id as string,
  };
}

async function teardown(): Promise<void> {
  const del = async (table: string, idList: string[]) => {
    if (idList.length) await supabase.from(table).delete().in("id", idList);
  };
  // Follow-ups may have been created by nothing here, but clear any tagged just in case.
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

  // --- Isolated tenant --------------------------------------------------------------------------
  await insert("teams", { id: teamId, name: `${TAG} team` });
  ids.teams.push(teamId);

  await insert("workspaces", {
    id: workspaceId,
    team_id: teamId,
    name: `${TAG} ws`,
    slug: `e2e-${teamId.slice(0, 8)}`,
    workspace_type: "solo",
  });
  ids.workspaces.push(workspaceId);

  const bp = await insert("business_profiles", {
    team_id: teamId,
    workspace_id: workspaceId,
    name: `${TAG} biz`,
    industry: "software",
    approval_mode: "autopilot",
  });
  ids.businessProfiles.push(bp.id as string);

  // Gmail credential: dummy tokens (encrypted), future expiry so NO Google refresh fires.
  const cred = await insert("gmail_credentials", {
    workspace_id: workspaceId,
    team_id: teamId,
    email_address: "e2e-sender@example.com",
    imap_username: "e2e-sender@example.com",
    imap_password_encrypted: encryptSecret("unused-imap"),
    credential_type: "oauth",
    status: "connected",
    access_token_encrypted: encryptSecret("dummy-access-token"),
    refresh_token_encrypted: encryptSecret("dummy-refresh-token"),
    token_expiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    scope: "https://www.googleapis.com/auth/gmail.send",
    sync_enabled: true,
  });
  ids.gmailCreds.push(cred.id as string);
  ok("seeded isolated tenant (team/workspace/business_profile/gmail_credential)");

  // --- 1 + 2: executeSendReply send + idempotency -----------------------------------------------
  const t1 = await seedTrio({ teamId, workspaceId, approvalStatus: "approved" });

  const r1 = await executeSendReply(supabase, { draftId: t1.draftId, teamId });
  assert(r1.status === 200, `send status ${r1.status}`);
  assert((r1.body as { alreadySent?: boolean }).alreadySent === false, "first send not alreadySent");
  let d = await fetchDraft(t1.draftId);
  assert(d.approval_status === "sent", "draft marked sent");
  const firstSentAt = d.sent_at as string;
  assert(typeof firstSentAt === "string" && firstSentAt, "sent_at set");
  let c = await fetchConversation(t1.conversationId);
  assert(c.status === "replied", "conversation marked replied");
  ok("executeSendReply sends approved draft and transitions statuses");

  const r2 = await executeSendReply(supabase, { draftId: t1.draftId, teamId });
  assert((r2.body as { alreadySent?: boolean }).alreadySent === true, "second send is alreadySent");
  d = await fetchDraft(t1.draftId);
  assert(d.sent_at === firstSentAt, "sent_at unchanged on second call (no double send)");
  ok("idempotency: approving/sending twice does not send twice");

  // --- 3: autopilot auto-send (safe) ------------------------------------------------------------
  const t2 = await seedTrio({ teamId, workspaceId, approvalStatus: "pending" });
  const a1 = await autopilotSend(supabase, { draftId: t2.draftId, teamId, leadId: t2.leadId });
  assert((a1.body as { autoSend?: boolean }).autoSend === true, "autopilot auto-sent");
  d = await fetchDraft(t2.draftId);
  assert(d.approval_status === "sent", "autopilot draft marked sent");
  ok("autopilotSend auto-sends a safe autopilot draft");

  // --- 4: autopilot gated (churn risk) ----------------------------------------------------------
  const t3 = await seedTrio({
    teamId,
    workspaceId,
    approvalStatus: "pending",
    riskType: "churn_risk",
    riskScore: 0.9,
  });
  const a2 = await autopilotSend(supabase, { draftId: t3.draftId, teamId, leadId: t3.leadId });
  assert((a2.body as { gated?: boolean }).gated === true, "churn-risk draft gated");
  assert((a2.body as { reason?: string }).reason === "gated_churn_risk", "gate reason is churn");
  d = await fetchDraft(t3.draftId);
  assert(d.approval_status === "pending", "gated draft stays pending (queued for approval)");
  ok("autopilotSend gates a churn-risk draft (stays pending, not sent)");

  console.log(`\nsend-e2e: ${passed} checks passed (live DB, sandbox transport)`);
}

main()
  .catch((e) => {
    console.error(e);
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
