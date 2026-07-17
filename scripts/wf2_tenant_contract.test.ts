/**
 * WF2 tenant + export contract checks (Member 2 · task 2.7).
 * Run: npx tsx scripts/wf2_tenant_contract.test.ts  (or `npm run test:wf2-contract`)
 *
 * 1. Repo export contract: business_profiles fetch, no organization_id on Create Lead, WF1 passes team_id.
 * 2. schedule_followup branch: Route by Action false path creates a followups row; error path logs to workflow_logs.
 * 3. Live Supabase: seeded business_profiles row is fetchable by team_id (mirrors WF2 Fetch node),
 *    and a followups insert with the exact columns the Create Followup node sends succeeds.
 */

import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@/lib/supabase";

config({ path: ".env.local" });

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

const root = path.join(process.cwd(), "n8n_logic", "exports");
const wf2 = JSON.parse(fs.readFileSync(path.join(root, "wf2_classification.json"), "utf8"));
const wf1 = JSON.parse(fs.readFileSync(path.join(root, "wf1_message_intake.json"), "utf8"));

const fetchNode = wf2.nodes.find((n: { name: string }) => n.name === "Fetch Business Profile");
const createLead = wf2.nodes.find((n: { name: string }) => n.name === "Create Lead");
const triggerWf2 = wf1.nodes.find((n: { name: string }) => n.name === "Trigger WF2");

assert(fetchNode, "wf2 export missing Fetch Business Profile");
assert(createLead, "wf2 export missing Create Lead");
assert(triggerWf2, "wf1 export missing Trigger WF2");

const fetchUrl = String(fetchNode.parameters.url);
const createBody = String(createLead.parameters.jsonBody);
const triggerBody = String(triggerWf2.parameters.jsonBody);

assert(fetchUrl.includes("business_profiles"), "Fetch must use business_profiles");
assert(!fetchUrl.includes("organizations"), "Fetch must not use organizations");
assert(createBody.includes("team_id"), "Create Lead must stamp team_id");
assert(createBody.includes("workspace_id"), "Create Lead must stamp workspace_id");
assert(!createBody.includes("organization_id"), "Create Lead must not write organization_id");
assert(triggerBody.includes("team_id"), "WF1 Trigger WF2 must pass team_id");
assert(triggerBody.includes("workspace_id"), "WF1 Trigger WF2 must pass workspace_id");
ok("export contract (wf1 trigger + wf2 fetch/create)");

// schedule_followup branch + error logging (audit flags b + d)
type Conn = { node: string };
const conns = wf2.connections as Record<string, { main: Conn[][] }>;
const isFollowup = wf2.nodes.find((n: { name: string }) => n.name === "Is Schedule Followup");
const createFollowup = wf2.nodes.find((n: { name: string }) => n.name === "Create Followup");
const logError = wf2.nodes.find((n: { name: string }) => n.name === "Log Classification Error");
const logUnhandled = wf2.nodes.find((n: { name: string }) => n.name === "Log Unhandled Action");

assert(isFollowup && createFollowup && logError && logUnhandled, "wf2 export missing followup/log nodes");
assert(conns["Route by Action"].main[1]?.[0]?.node === "Is Schedule Followup", "Route by Action false branch must route to Is Schedule Followup");
assert(conns["Is Schedule Followup"].main[0]?.[0]?.node === "Create Followup", "Is Schedule Followup true branch must create followup");
assert(conns["Is Schedule Followup"].main[1]?.[0]?.node === "Log Unhandled Action", "Is Schedule Followup false branch must log unhandled action");
assert(conns["Check Classification Success"].main[0]?.[0]?.node === "Log Classification Error", "error branch must log to workflow_logs");

const followupBody = String(createFollowup.parameters.jsonBody);
assert(String(createFollowup.parameters.url).includes("rest/v1/followups"), "Create Followup must target followups");
assert(followupBody.includes("team_id"), "Create Followup must stamp team_id");
assert(followupBody.includes("workspace_id"), "Create Followup must stamp workspace_id");
assert(followupBody.includes("'pending'"), "Create Followup must set status pending (WF4 sweeps status=eq.pending)");
assert(!followupBody.includes("organization_id"), "Create Followup must not write organization_id");
for (const logNode of [logError, logUnhandled]) {
  assert(String(logNode.parameters.url).includes("rest/v1/workflow_logs"), `${logNode.name} must target workflow_logs`);
  assert(logNode.parameters.options?.response?.response?.neverError === true, `${logNode.name} must be neverError (logging can't crash the run)`);
}
ok("schedule_followup branch + error logging wired");

// 2026-07-17 hardening: classification goes through the app's centralized
// /api/internal/n8n/ai/classify endpoint — n8n holds NO OpenAI/Azure key and the export
// contains no direct model call. The app records usage itself, so the old
// "Build Classification Request" / "Record AI Usage (WF2)" nodes must be gone.
const classify = wf2.nodes.find((n: { name: string }) => n.name === "Classify Message");
const parseNode = wf2.nodes.find((n: { name: string }) => n.name === "Parse AI Response");
const profileMissingIf = wf2.nodes.find((n: { name: string }) => n.name === "Is Profile Missing");
const logMissingProfile = wf2.nodes.find((n: { name: string }) => n.name === "Log Missing Business Profile");

assert(classify && parseNode, "wf2 export missing classification nodes");
assert(
  !wf2.nodes.some((n: { name: string }) => n.name === "Build Classification Request"),
  "Build Classification Request must be removed (prompt lives in the app now)",
);
assert(
  String(classify.parameters.url).includes("/api/internal/n8n/ai/classify"),
  "Classify Message must call the app's /api/internal/n8n/ai/classify endpoint",
);
assert(
  String(classify.parameters.url).includes("$vars.NEXUS_APP_URL"),
  "Classify Message URL must resolve from $vars.NEXUS_APP_URL",
);
const authHeader = classify.parameters.headerParameters.parameters.find(
  (p: { name: string }) => p.name === "Authorization",
);
assert(String(authHeader?.value).includes("$vars.N8N_INGEST_TOKEN"), "Classify Message must auth with $vars.N8N_INGEST_TOKEN");
const classifyBody = String(classify.parameters.jsonBody);
assert(classifyBody.includes("team_id"), "classify request must stamp team_id");
assert(classifyBody.includes("workspace_id"), "classify request must stamp workspace_id");
assert(
  !JSON.stringify(wf2.nodes).includes("api.openai.com"),
  "wf2 export nodes must not contain any direct OpenAI call",
);
assert(
  !JSON.stringify(wf2.nodes).includes("$vars.OPENAI_API_KEY"),
  "wf2 export nodes must not reference an OpenAI key in n8n",
);

// Parse must read the model output by node name — reading $input silently
// collapses every classification to the fallback (root cause of the empty dashboard).
assert(
  String(parseNode.parameters.jsCode).includes("$('Classify Message')"),
  "Parse AI Response must read $('Classify Message'), not $input",
);
assert(
  !String(parseNode.parameters.jsCode).includes("items[0].json"),
  "Parse AI Response must not read items[0] (that is the ai-usage response)",
);
// The app endpoint returns the canonical classify schema; Parse must map it onto the
// lead fields downstream nodes route on, and fail safe when AI is not configured.
const parseCode = String(parseNode.parameters.jsCode);
assert(parseCode.includes("intent_type"), "Parse AI Response must map the canonical intent_type schema");
assert(parseCode.includes("ai_not_configured"), "Parse AI Response must handle the 503 ai_not_configured body");

assert(profileMissingIf && logMissingProfile, "wf2 export missing no-business-profile logging branch");
assert(fetchNode.alwaysOutputData === true, "Fetch Business Profile must alwaysOutputData so missing profiles can't kill the run");
assert(
  conns["Fetch Business Profile"].main[0]?.some((c) => c.node === "Is Profile Missing"),
  "Fetch Business Profile must feed Is Profile Missing",
);
assert(
  conns["Is Profile Missing"].main[0]?.[0]?.node === "Log Missing Business Profile",
  "Is Profile Missing true branch must log no_business_profile",
);
assert(String(logMissingProfile.parameters.url).includes("rest/v1/workflow_logs"), "missing-profile log must target workflow_logs");
assert(
  logMissingProfile.parameters.options?.response?.response?.neverError === true,
  "missing-profile log must be neverError",
);
ok("openai swap + parse wiring fix + missing-profile logging");

if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
  console.log(`\n${passed} checks passed (Supabase live check skipped — no service role key)\n`);
  process.exit(0);
}

const supabase = createServerClient();
const TAG = `wf2-contract-${Date.now()}`;
const ids = {
  teams: [] as string[],
  workspaces: [] as string[],
  profiles: [] as string[],
  leads: [] as string[],
  followups: [] as string[],
};

async function teardown(): Promise<void> {
  for (const id of ids.followups) await supabase.from("followups").delete().eq("id", id);
  for (const id of ids.leads) await supabase.from("leads").delete().eq("id", id);
  for (const id of ids.profiles) await supabase.from("business_profiles").delete().eq("id", id);
  for (const id of ids.workspaces) await supabase.from("workspaces").delete().eq("id", id);
  for (const id of ids.teams) await supabase.from("teams").delete().eq("id", id);
}

async function main(): Promise<void> {
  const teamId = randomUUID();
  const workspaceId = randomUUID();
  const { error: teamErr } = await supabase.from("teams").insert({ id: teamId, name: TAG });
  if (teamErr) fail(`team insert: ${teamErr.message}`);
  ids.teams.push(teamId);

  const { error: wsErr } = await supabase.from("workspaces").insert({
    id: workspaceId,
    team_id: teamId,
    name: TAG,
    slug: `wf2-${teamId.slice(0, 8)}`,
    workspace_type: "solo",
  });
  if (wsErr) fail(`workspace insert: ${wsErr.message}`);
  ids.workspaces.push(workspaceId);

  const { data: bp, error: bpErr } = await supabase
    .from("business_profiles")
    .insert({
      team_id: teamId,
      workspace_id: workspaceId,
      name: "WF2 Contract Test Co",
      tone: "professional",
      services: ["consulting"],
      pricing_rules: { currency: "LKR" },
      approval_mode: "autopilot",
    })
    .select("id, team_id, name")
    .single();
  if (bpErr || !bp) fail(`business_profiles insert: ${bpErr?.message}`);
  ids.profiles.push(bp.id as string);

  const { data: fetched, error: fetchErr } = await supabase
    .from("business_profiles")
    .select("id,name,tone,services,pricing_rules,approval_mode")
    .eq("team_id", teamId)
    .limit(1)
    .maybeSingle();
  if (fetchErr || !fetched) fail(`business_profiles fetch by team_id: ${fetchErr?.message}`);
  assert(fetched.name === "WF2 Contract Test Co", "profile name mismatch");
  ok("live Supabase business_profiles fetch by team_id");

  // Mirror the Create Followup node body exactly (schedule_followup branch, audit flag b).
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .insert({
      team_id: teamId,
      workspace_id: workspaceId,
      customer_name: TAG,
      customer_email: `${TAG}@example.com`,
      intent: "other",
      urgency: "medium",
      estimated_value: 0,
      risk_type: "none",
      risk_score: 0,
      status: "new",
      next_action: "schedule_followup",
      confidence: 0.9,
    })
    .select("id")
    .single();
  if (leadErr || !lead) fail(`lead insert: ${leadErr?.message}`);
  ids.leads.push(lead.id as string);

  const { data: followup, error: fuErr } = await supabase
    .from("followups")
    .insert({
      lead_id: lead.id,
      conversation_id: null,
      team_id: teamId,
      workspace_id: workspaceId,
      scheduled_for: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      action: "Follow-up: scheduled by classifier",
      message: "Follow-up scheduled by WF2 classification.",
      status: "pending",
    })
    .select("id, team_id, status")
    .single();
  if (fuErr || !followup) fail(`followups insert (Create Followup node body): ${fuErr?.message}`);
  ids.followups.push(followup.id as string);
  assert(followup.team_id === teamId, "followup team_id mismatch");
  assert(followup.status === "pending", "followup must be pending so WF4 sweeps it");
  ok("live Supabase followups insert matches Create Followup node body");

  console.log(`\n${passed} checks passed\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => teardown());
