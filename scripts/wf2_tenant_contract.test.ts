/**
 * WF2 tenant + export contract checks (Member 2 · task 2.7).
 * Run: npx tsx scripts/wf2_tenant_contract.test.ts  (or `npm run test:wf2-contract`)
 *
 * 1. Repo export contract: business_profiles fetch, no organization_id on Create Lead, WF1 passes team_id.
 * 2. Live Supabase: seeded business_profiles row is fetchable by team_id (mirrors WF2 Fetch node).
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

if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
  console.log(`\n${passed} checks passed (Supabase live check skipped — no service role key)\n`);
  process.exit(0);
}

const supabase = createServerClient();
const TAG = `wf2-contract-${Date.now()}`;
const ids = { teams: [] as string[], workspaces: [] as string[], profiles: [] as string[] };

async function teardown(): Promise<void> {
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

  console.log(`\n${passed} checks passed\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => teardown());
