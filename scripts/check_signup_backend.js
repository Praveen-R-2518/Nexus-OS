#!/usr/bin/env node

require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");

const REQUIRED_COLUMNS = {
  profiles: ["id", "team_id", "full_name", "phone"],
  teams: ["id", "name"],
  workspaces: ["id", "team_id", "owner_user_id", "name", "slug"],
  workspace_members: ["id", "workspace_id", "team_id", "user_id", "role"],
  subscriptions: ["id", "workspace_id", "team_id"],
  gmail_credentials: ["id", "workspace_id", "team_id"],
  business_profiles: ["id", "team_id", "workspace_id"],
  conversations: ["id", "team_id", "workspace_id"],
  leads: ["id", "team_id", "workspace_id", "conversation_id"],
  reply_drafts: ["id", "team_id", "workspace_id", "conversation_id"],
  followups: ["id", "team_id", "workspace_id", "conversation_id"],
  workflow_logs: ["id", "team_id", "workspace_id"],
  daily_reports: ["id", "team_id", "workspace_id"],
  invitations: ["id", "team_id", "email", "status"],
};

const REQUIRED_RPC_PATHS = [
  "/rpc/check_signup_email_status",
  "/rpc/launch_workspace",
];

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    return;
  }

  const specRes = await fetch(`${url}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!specRes.ok) {
    fail(`Could not load PostgREST schema (${specRes.status}).`);
    return;
  }

  const spec = await specRes.json();
  const definitions = spec.definitions || spec.components?.schemas || {};
  const paths = new Set(Object.keys(spec.paths || {}));
  const missing = [];

  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const available = definitions[table]?.properties
      ? new Set(Object.keys(definitions[table].properties))
      : null;
    if (!available) {
      missing.push(`${table} table`);
      continue;
    }
    for (const column of columns) {
      if (!available.has(column)) missing.push(`${table}.${column}`);
    }
  }

  for (const rpcPath of REQUIRED_RPC_PATHS) {
    if (!paths.has(rpcPath)) missing.push(rpcPath);
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("check_signup_email_status", {
    email_input: "codex-healthcheck@example.invalid",
  });

  if (error) {
    missing.push(`check_signup_email_status callable (${error.code}: ${error.message})`);
  } else if (!["available", "pending_verification", "confirmed"].includes(data)) {
    missing.push(`check_signup_email_status returned unexpected value: ${String(data)}`);
  }

  if (missing.length) {
    fail(`Signup backend is not ready:\n- ${missing.join("\n- ")}`);
    return;
  }

  console.log("OK: signup backend schema and RPC checks passed.");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
