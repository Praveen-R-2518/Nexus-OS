#!/usr/bin/env node
/**
 * Clean a live n8n_get_workflow (mode=full) payload into a repo export snapshot.
 * Usage: node scripts/clean_n8n_export.js <raw.json> <output.json> [liveId]
 */
const fs = require('fs');

const SECRET_KEY = /^(api[_-]?key|secret|password|token|access_token|refresh_token|private_key)$/i;
const EXPR = /^\s*[=]?(\{\{|\$)/;

function stripSecrets(value, key) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((v) => stripSecrets(v, key));
  if (typeof value !== 'object') {
    if (
      typeof value === 'string' &&
      key &&
      SECRET_KEY.test(key) &&
      !EXPR.test(value) &&
      value.length > 8
    ) {
      return '[REDACTED]';
    }
    return value;
  }

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === 'credentials' && v && typeof v === 'object') {
      out[k] = Object.fromEntries(
        Object.entries(v).map(([credType, cred]) => {
          if (!cred || typeof cred !== 'object') return [credType, cred];
          const { id, name } = cred;
          return [credType, { ...(id ? { id } : {}), ...(name ? { name } : {}) }];
        })
      );
      continue;
    }
    out[k] = stripSecrets(v, k);
  }
  return out;
}

const [rawPath, outPath, liveIdArg] = process.argv.slice(2);
if (!rawPath || !outPath) {
  console.error('Usage: node scripts/clean_n8n_export.js <raw.json> <output.json> [liveId]');
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const data = payload.data ?? payload;
const liveId = liveIdArg || data.id;

const exportDoc = {
  id: data.id,
  name: data.name,
  active: data.active,
  note: `Exported from live n8n (knurdz3o.app.n8n.cloud) on 2026-07-17. Live workflow id: ${liveId}.`,
  nodes: stripSecrets(data.nodes ?? [], null),
  connections: data.connections ?? {},
};

if (data.settings) {
  exportDoc.settings = data.settings;
}

fs.writeFileSync(outPath, `${JSON.stringify(exportDoc, null, 2)}\n`);
console.log(`${outPath}: ${exportDoc.nodes.length} nodes, active=${exportDoc.active}`);
