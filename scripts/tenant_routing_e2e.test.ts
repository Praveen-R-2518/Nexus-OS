/**
 * Tenant routing E2E checks (Task 3.5).
 * Run: npx tsx scripts/tenant_routing_e2e.test.ts
 * Live Gmail: TENANT_E2E_LIVE=1 npx tsx scripts/tenant_routing_e2e.test.ts
 */

import { spawnSync } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local" });

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function runScript(cmd: string, args: string[]): void {
  const res = spawnSync(cmd, args, { stdio: "inherit", shell: true });
  assert(res.status === 0, `${cmd} ${args.join(" ")} failed with ${res.status}`);
}

async function liveGmailSmoke(): Promise<void> {
  const n8nBase = (process.env.N8N_WEBHOOK_BASE_URL?.trim() || "https://knurdz3o.app.n8n.cloud").replace(
    /\/$/,
    "",
  );
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(n8nBase, "N8N_WEBHOOK_BASE_URL required for live smoke");
  assert(supabaseUrl && serviceKey, "Supabase env required for live smoke");

  const messageId = `m3-tenant-e2e-${Date.now()}@nexus.dev`;
  const externalMessageId = `<${messageId}>`;
  const to = process.env.TENANT_E2E_GMAIL_MAILBOX ?? "ledger-test@nexus.dev";

  const payload = {
    from: "Tenant E2E <customer@test.com>",
    to,
    subject: "Tenant routing E2E",
    textPlain: "Checking tenant routing end-to-end.",
    headers: { "message-id": externalMessageId },
  };

  const forward = await fetch(`${n8nBase}/webhook/gmail-inbound`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-nexus-channel": "gmail" },
    body: JSON.stringify(payload),
  });
  assert(forward.ok, `WF0a forward failed: ${forward.status}`);

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  let ledger: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 8; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    const ledgerRes = await fetch(
      `${supabaseUrl}/rest/v1/inbound_events?external_message_id=eq.${encodeURIComponent(messageId)}&select=id,team_id,workspace_id,platform`,
      { headers },
    );
    ledger = (await ledgerRes.json()) as Array<Record<string, unknown>>;
    if (ledger.length === 1) break;
  }
  assert(Array.isArray(ledger) && ledger.length === 1, `expected 1 ledger row, got ${JSON.stringify(ledger)}`);
  assert(ledger[0].platform === "gmail", "ledger platform should be gmail");
  assert(Boolean(ledger[0].team_id), "ledger team_id should be set");

  const dup = await fetch(`${n8nBase}/webhook/gmail-inbound`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-nexus-channel": "gmail" },
    body: JSON.stringify(payload),
  });
  assert(dup.ok, `duplicate forward failed: ${dup.status}`);

  const ledgerAgainRes = await fetch(
    `${supabaseUrl}/rest/v1/inbound_events?external_message_id=eq.${encodeURIComponent(messageId)}&select=id`,
    { headers },
  );
  const ledgerAgain = (await ledgerAgainRes.json()) as unknown[];
  assert(ledgerAgain.length === 1, "duplicate delivery must not create second ledger row");

  console.log(`live Gmail smoke passed for Message-ID ${messageId}`);
}

async function run() {
  console.log("Part 1: app-layer meta routing tests");
  runScript("npx", ["tsx", "scripts/meta_routing.test.ts"]);

  console.log("Part 2: tenant intake mapping tests");
  runScript("node", ["scripts/tenant_intake_mapping.test.mjs"]);

  if (process.env.TENANT_E2E_LIVE === "1") {
    console.log("Part 3: live Gmail smoke via WF0a");
    await liveGmailSmoke();
  } else {
    console.log("Part 3 skipped (set TENANT_E2E_LIVE=1 to run live Gmail smoke)");
  }

  console.log("tenant_routing_e2e.test.ts: all checks passed");
}

run().catch((e) => {
  console.error("tenant_routing_e2e.test.ts: failed", e);
  process.exitCode = 1;
});
