#!/usr/bin/env node
/**
 * Prepare n8n MCP deploy payloads from n8n_logic/exports/*.json
 * Usage: node scripts/prepare_n8n_deploy_payload.mjs <export-filename>
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const exportsDir = resolve(root, "n8n_logic/exports");

const LIVE_IDS = {
  "wf0a_gmail_intake.json": "bhGCrTSHrj91ojby",
  "wf0d_ledger_drain.json": "lr4HzWo2QeghXxhH",
  "wf0e_gmail_backfill.json": "Y54F1bZLJkRyexTH",
  "wf0f_gmail_sync.json": "rNjW8GyWfZHuXnnf",
  "wf2_classification.json": "MmA7EKsOYAZgx3ep",
  "wf3_revenue_rescue.json": "OjFlX2W2xYbl5roY",
  "wf4_followup_scheduler.json": "qWHvc2AmqX10jEjk",
  "wf5_daily_buy_back_report.json": "QoJIseLTX2jwDYEy",
  "approval_trigger.json": "PtfTN2YTN8bmHzDu",
  "wf8b_social_publish.json": "VZ9ZaA1S2JxSAeGQ",
  "wf8d_social_scheduler.json": "47BO0agxAJGizttR",
  "wf0g_outbound_drain.json": "JmxmlFw6dW1SDVKQ",
};

const SUPABASE_CRED = { id: "4rfwTEeSitzS3JeQ", name: "Supabase API" };

const file = process.argv[2];
if (!file) {
  console.error("Usage: prepare_n8n_deploy_payload.mjs <export-filename>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(resolve(exportsDir, file), "utf8"));

function sanitizeNode(node) {
  const out = {
    id: node.id,
    name: node.name,
    type: node.type,
    typeVersion: node.typeVersion,
    position: node.position,
    parameters: node.parameters ?? {},
  };
  if (node.credentials?.httpCustomAuth || node.parameters?.genericAuthType === "httpCustomAuth") {
    out.credentials = { httpCustomAuth: SUPABASE_CRED };
  } else if (node.credentials) {
    out.credentials = node.credentials;
  }
  if (node.onError) out.onError = node.onError;
  if (node.alwaysOutputData) out.alwaysOutputData = node.alwaysOutputData;
  if (node.retryOnFail) out.retryOnFail = node.retryOnFail;
  if (node.maxTries) out.maxTries = node.maxTries;
  if (node.waitBetweenTries) out.waitBetweenTries = node.waitBetweenTries;
  if (node.disabled) out.disabled = node.disabled;
  if (node.webhookId) out.webhookId = node.webhookId;
  return out;
}

const payload = {
  file,
  liveId: LIVE_IDS[file] ?? null,
  create: !LIVE_IDS[file],
  name: raw.name,
  active: raw.active ?? false,
  nodes: (raw.nodes ?? []).map(sanitizeNode),
  connections: raw.connections ?? {},
  settings: { executionOrder: raw.settings?.executionOrder ?? "v1" },
};

process.stdout.write(JSON.stringify(payload));
