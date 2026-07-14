#!/usr/bin/env node
/**
 * Slim-export an n8n workflow JSON (from MCP full get or UI export) to n8n_logic/exports/.
 * Usage: node scripts/snapshot_n8n_workflow.mjs <input.json> <output.json> [workflowId]
 */
import fs from "node:fs";

const [inputPath, outputPath, workflowId] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/snapshot_n8n_workflow.mjs <input.json> <output.json> [workflowId]");
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const wf = raw.data ?? raw;

function slimExport(w) {
  return {
    name: w.name,
    active: w.active,
    settings: w.settings || { executionOrder: "v1" },
    connections: w.connections,
    nodes: w.nodes.map((n) => {
      const o = {
        parameters: n.parameters,
        id: n.id,
        name: n.name,
        type: n.type,
        typeVersion: n.typeVersion,
        position: n.position,
      };
      if (n.webhookId) o.webhookId = n.webhookId;
      if (n.credentials) o.credentials = n.credentials;
      if (n.onError) o.onError = n.onError;
      if (n.alwaysOutputData) o.alwaysOutputData = n.alwaysOutputData;
      if (n.maxTries) o.maxTries = n.maxTries;
      if (n.retryOnFail) o.retryOnFail = n.retryOnFail;
      if (n.waitBetweenTries) o.waitBetweenTries = n.waitBetweenTries;
      return o;
    }),
    meta: {
      exportedAt: new Date().toISOString(),
      workflowId: workflowId || w.id,
      source: "live n8n MCP export",
    },
  };
}

fs.writeFileSync(outputPath, JSON.stringify(slimExport(wf), null, 2));
console.log(`Wrote ${outputPath}`);
