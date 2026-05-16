#!/usr/bin/env node
/**
 * Generates importable n8n workflow skeletons under n8n_logic/exports/.
 * Run from repo root: `node scripts/build_n8n_workflow_exports.js`
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const n8nLogic = path.join(root, "n8n_logic");

function stripForN8nCodeNode(filePath) {
  let src = fs.readFileSync(filePath, "utf8");
  // Drop file-level block comment (first /** ... */ only)
  src = src.replace(/^\/\*\*[\s\S]*?\*\/\s*/, "");
  // Remove Node export tail
  src = src.replace(
    /\nif \(typeof module !== "undefined" && module\.exports\) \{[\s\S]*$/,
    "\n",
  );
  // Normalizer: replace guarded n8n entry with plain return
  src = src.replace(
    /\nif \(typeof \$input !== "undefined"\) \{\n\s*return \$input\.all\(\)\.map\(\(\{ json \}\) => \(\{\n\s*json: normalizeItem\(json\),\n\s*\}\)\);\n\}\n/,
    "\nreturn $input.all().map(({ json }) => ({\n  json: normalizeItem(json),\n}));\n",
  );
  // Noise filter: same pattern
  src = src.replace(
    /\nif \(typeof \$input !== "undefined"\) \{\n\s*return \$input\.all\(\)\.map\(\(\{ json \}\) => evaluateNoiseFilter\(json\)\);\n\}\n/,
    "\nreturn $input.all().map(({ json }) => evaluateNoiseFilter(json));\n",
  );
  return src.trim() + "\n";
}

const dedupLookupQuery = `
const normalized = $input.first().json;
const id = normalized.customer_email_or_phone || '';
if (!id) throw new Error('DedupLookupQuery: missing customer_email_or_phone');
const variants = [...new Set([id, id.toLowerCase()].filter(Boolean))];
const orInner = variants.map((v) => 'customer_email.eq.' + encodeURIComponent(v)).join(',');
const lookup_path =
  '?select=id,status,updated_at' +
  '&status=in.(new,in_progress,awaiting_reply)' +
  '&or=(' + orInner + ')' +
  '&order=updated_at.desc&limit=1';
return [{ json: { lookup_path, normalized } }];
`.trim();

const dedupDecision = `
const rows = $input.first().json;
const normalized = $('Multi-Channel Normalizer').first().json;
const hit = Array.isArray(rows) && rows[0] && rows[0].id;
if (hit) {
  return [{ json: { action: 'append_conversation', lead_id: rows[0].id, normalized } }];
}
return [{ json: { action: 'create_new_lead', normalized } }];
`.trim();

function uuid(i) {
  const p = String(i).padStart(12, "0");
  return `${p.slice(0, 8)}-${p.slice(0, 4)}-4000-8000-${p.slice(0, 12)}`;
}

function codeNode(id, name, position, jsCode) {
  return {
    parameters: {
      language: "javaScript",
      mode: "runOnceForAllItems",
      jsCode,
    },
    id,
    name,
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position,
  };
}

function sticky(content, position, height = 380) {
  return {
    parameters: {
      content,
      height,
      width: 400,
    },
    id: uuid(Math.floor(Math.random() * 1e9) % 1000000),
    name: "Sticky Note",
    type: "n8n-nodes-base.stickyNote",
    typeVersion: 1,
    position,
  };
}

function httpNode(id, name, position, opts) {
  const parameters = {
    method: opts.method || "GET",
    url: opts.url,
    authentication: "none",
    sendHeaders: !!(opts.headers && opts.headers.length),
    headerParameters: {
      parameters: opts.headers || [],
    },
    options: {},
  };
  if (opts.body) {
    parameters.sendBody = true;
    parameters.contentType = "json";
    parameters.specifyBody = "json";
    parameters.jsonBody = opts.body;
  }
  return {
    parameters,
    id,
    name,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position,
  };
}

/** Route 0 = `keep === true` (continue), route 1 = dropped / noise */
function ifKeepNode(id, name, position) {
  return {
    parameters: {
      conditions: {
        options: {
          version: 2,
          leftValue: "",
          caseSensitive: true,
          typeValidation: "loose",
        },
        conditions: [
          {
            id: uuid(91),
            leftValue: "={{ $json.keep }}",
            rightValue: true,
            operator: {
              type: "boolean",
              operation: "equals",
            },
          },
        ],
        combinator: "and",
      },
    },
    id,
    name,
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position,
  };
}

function switchNode(id, name, position, fallbackOutputName) {
  return {
    parameters: {
      rules: {
        values: [
          {
            conditions: {
              options: {
                caseSensitive: true,
                leftValue: "",
                typeValidation: "strict",
                version: 2,
              },
              conditions: [
                {
                  leftValue: "={{ $json.action }}",
                  rightValue: "append_conversation",
                  operator: {
                    type: "string",
                    operation: "equals",
                  },
                  id: uuid(3),
                },
              ],
              combinator: "and",
            },
            renameOutput: true,
            outputKey: "append_conversation",
          },
          {
            conditions: {
              options: {
                caseSensitive: true,
                leftValue: "",
                typeValidation: "strict",
                version: 2,
              },
              conditions: [
                {
                  leftValue: "={{ $json.action }}",
                  rightValue: "create_new_lead",
                  operator: {
                    type: "string",
                    operation: "equals",
                  },
                  id: uuid(4),
                },
              ],
              combinator: "and",
            },
            renameOutput: true,
            outputKey: "create_new_lead",
          },
        ],
      },
      options: { fallbackOutput: fallbackOutputName || "extra" },
    },
    id,
    name,
    type: "n8n-nodes-base.switch",
    typeVersion: 3.2,
    position,
  };
}

function executeWorkflowNode(id, name, position, wfId) {
  return {
    parameters: {
      source: "database",
      workflowId: wfId,
      mode: "once",
      options: {},
    },
    id,
    name,
    type: "n8n-nodes-base.executeWorkflow",
    typeVersion: 1.1,
    position,
    notesInFlow: true,
    notes: `Open this node and pick WF2 Classification. Placeholder id string: ${wfId}`,
  };
}

function buildConnections(map) {
  const out = {};
  for (const [from, targets] of Object.entries(map)) {
    out[from] = { main: targets };
  }
  return out;
}

const supabaseHeaders = [
  { name: "apikey", value: "={{$env.SUPABASE_ANON_KEY}}" },
  { name: "Authorization", value: "=Bearer {{$env.SUPABASE_ANON_KEY}}" },
  { name: "Content-Type", value: "application/json" },
  { name: "Prefer", value: "return=representation" },
];

function workflowTemplate(name, nodes, connections) {
  return {
    name,
    nodes,
    connections,
    pinData: {},
    settings: { executionOrder: "v1" },
    staticData: null,
    meta: { templateCredsSetupCompleted: false, instanceId: "nexus-os-export" },
    tags: [{ name: "nexus-os" }],
  };
}

const normalizerJs = stripForN8nCodeNode(path.join(n8nLogic, "multi_channel_normalizer.js"));
const noiseJs = stripForN8nCodeNode(path.join(n8nLogic, "noise_filter.js"));

const wf2Placeholder = "REPLACE_WITH_WF2_CLASSIFICATION_ID";

// --- WF0b WhatsApp ---
const waWebhook = {
  parameters: {
    httpMethod: "POST",
    path: "wa-inbound",
    responseMode: "onReceived",
    options: {},
  },
  id: uuid(10),
  name: "Webhook WhatsApp",
  type: "n8n-nodes-base.webhook",
  typeVersion: 2,
  position: [0, 300],
  webhookId: "nexus-wa-inbound",
};

const nodesWA = [
  sticky(
    "## Nexus OS — WF0b WhatsApp Intake\n\n1. Set n8n env: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (or swap expressions for static creds).\n2. Map `Execute WF2 Classification` to your real workflow ID.\n3. Twilio Sandbox: point the Twilio webhook URL to this n8n Webhook; payload auto-parses via normalizer.\n4. Meta simulation: POST JSON body from `n8n_logic/fixtures/whatsapp_meta_sample.json`.",
    [-200, 0],
    420,
  ),
  waWebhook,
  codeNode(uuid(11), "Multi-Channel Normalizer", [280, 260], normalizerJs),
  codeNode(uuid(12), "Noise Filter", [520, 260], noiseJs),
  ifKeepNode(uuid(13), "IF Keep", [760, 260]),
  httpNode(uuid(14), "Log Noise Drop", [1000, 80], {
    method: "POST",
    url: "={{$env.SUPABASE_URL.replace(/\\/$/, '') + '/rest/v1/workflow_logs'}}",
    headers: [
      ...supabaseHeaders,
      { name: "Prefer", value: "return=minimal" },
    ],
    body: '={{ JSON.stringify({ workflow_name: "WF0b WhatsApp Intake", step: "noise_filter_dropped", result: "dropped", payload: $json }) }}',
  }),
  codeNode(uuid(15), "Dedup Lookup Query", [1000, 300], dedupLookupQuery),
  httpNode(uuid(16), "Supabase GET Lead Dedup", [1240, 300], {
    method: "GET",
    url: "={{$env.SUPABASE_URL.replace(/\\/$/, '') + '/rest/v1/leads' + $json.lookup_path}}",
    headers: supabaseHeaders,
  }),
  codeNode(uuid(17), "Dedup Decision", [1480, 300], dedupDecision),
  switchNode(uuid(18), "Switch Action", [1720, 280], "extra"),
  httpNode(uuid(19), "POST Conversation (append)", [1960, 160], {
    method: "POST",
    url: "={{$env.SUPABASE_URL.replace(/\\/$/, '') + '/rest/v1/conversations'}}",
    headers: supabaseHeaders,
    body: '={{ JSON.stringify({ source: $json.normalized.source, customer_name: $json.normalized.customer_name, customer_email: $json.normalized.customer_email_or_phone, message: $json.normalized.message, received_at: $json.normalized.received_at, status: "unread", raw_payload: Object.assign({}, $json.normalized.raw_payload || {}, { lead_hint: $json.lead_id, external_thread_id: $json.normalized.external_thread_id }) }) }}',
  }),
  httpNode(uuid(20), "PATCH Lead Touch", [2200, 160], {
    method: "PATCH",
    url: "={{ $env.SUPABASE_URL.replace(/\\/$/, '') + '/rest/v1/leads?id=eq.' + $('Dedup Decision').first().json.lead_id }}",
    headers: supabaseHeaders,
    body: "={{ JSON.stringify({ updated_at: new Date().toISOString() }) }}",
  }),
  httpNode(uuid(211), "POST Conversation (new)", [1960, 400], {
    method: "POST",
    url: "={{$env.SUPABASE_URL.replace(/\\/$/, '') + '/rest/v1/conversations'}}",
    headers: supabaseHeaders,
    body: '={{ JSON.stringify({ source: $json.normalized.source, customer_name: $json.normalized.customer_name, customer_email: $json.normalized.customer_email_or_phone, message: $json.normalized.message, received_at: $json.normalized.received_at, status: "unread", raw_payload: Object.assign({}, $json.normalized.raw_payload || {}, { external_thread_id: $json.normalized.external_thread_id }) }) }}',
  }),
  executeWorkflowNode(uuid(22), "Execute WF2 Classification", [2440, 280], wf2Placeholder),
  httpNode(uuid(23), "Log Intake OK", [2680, 280], {
    method: "POST",
    url: "={{$env.SUPABASE_URL.replace(/\\/$/, '') + '/rest/v1/workflow_logs'}}",
    headers: supabaseHeaders,
    body: "={{ JSON.stringify({ workflow_name: 'WF0b WhatsApp Intake', step: 'channel_intake_ok', result: 'ok', payload: { source: 'whatsapp' } }) }}",
  }),
];

const connWA = buildConnections({
  "Webhook WhatsApp": [[{ node: "Multi-Channel Normalizer", type: "main", index: 0 }]],
  "Multi-Channel Normalizer": [[{ node: "Noise Filter", type: "main", index: 0 }]],
  "Noise Filter": [[{ node: "IF Keep", type: "main", index: 0 }]],
  "IF Keep": [
    [{ node: "Dedup Lookup Query", type: "main", index: 0 }],
    [{ node: "Log Noise Drop", type: "main", index: 0 }],
  ],
  "Dedup Lookup Query": [[{ node: "Supabase GET Lead Dedup", type: "main", index: 0 }]],
  "Supabase GET Lead Dedup": [[{ node: "Dedup Decision", type: "main", index: 0 }]],
  "Dedup Decision": [[{ node: "Switch Action", type: "main", index: 0 }]],
  "Switch Action": [
    [{ node: "POST Conversation (append)", type: "main", index: 0 }],
    [{ node: "POST Conversation (new)", type: "main", index: 0 }],
  ],
  "POST Conversation (append)": [[{ node: "PATCH Lead Touch", type: "main", index: 0 }]],
  "PATCH Lead Touch": [[{ node: "Execute WF2 Classification", type: "main", index: 0 }]],
  "POST Conversation (new)": [[{ node: "Execute WF2 Classification", type: "main", index: 0 }]],
  "Execute WF2 Classification": [[{ node: "Log Intake OK", type: "main", index: 0 }]],
});

const outDir = path.join(n8nLogic, "exports");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "wf0b_whatsapp_intake.json"),
  JSON.stringify(workflowTemplate("WF0b WhatsApp Intake", nodesWA, connWA), null, 2),
);

// --- WF0a Gmail (Manual trigger + instruction; swap for IMAP Email Read) ---
const manual = {
  parameters: {},
  id: uuid(30),
  name: "Manual Trigger",
  type: "n8n-nodes-base.manualTrigger",
  typeVersion: 1,
  position: [0, 300],
};

const setFixture = codeNode(
  uuid(31),
  "Load Gmail Fixture (demo)",
  [220, 300],
  [
    "return [{",
    "  json: " +
      JSON.stringify(
        JSON.parse(fs.readFileSync(path.join(n8nLogic, "fixtures", "gmail_imap_sample.json"), "utf8")),
        null,
        2,
      ) +
      ",",
    "}];",
  ].join("\n"),
);

const nodesGmail = [
  sticky(
    "## Nexus OS — WF0a Gmail Intake\n\n**Production:** delete `Manual Trigger` + `Load Gmail Fixture` and connect **IMAP Email Read** (or Gmail Trigger) directly into `Multi-Channel Normalizer`.\n\nNormalizer auto-detects Gmail-shaped payloads.",
    [-220, 0],
    460,
  ),
  manual,
  setFixture,
  codeNode(uuid(32), "Multi-Channel Normalizer", [460, 300], normalizerJs),
  codeNode(uuid(33), "Noise Filter", [700, 300], noiseJs),
  ifKeepNode(uuid(34), "IF Keep", [940, 300]),
  httpNode(uuid(35), "Log Noise Drop", [1180, 120], {
    method: "POST",
    url: "={{$env.SUPABASE_URL.replace(/\\/$/, '') + '/rest/v1/workflow_logs'}}",
    headers: [...supabaseHeaders, { name: "Prefer", value: "return=minimal" }],
    body: '={{ JSON.stringify({ workflow_name: "WF0a Gmail Intake", step: "noise_filter_dropped", result: "dropped", payload: $json }) }}',
  }),
  codeNode(uuid(36), "Dedup Lookup Query", [1180, 340], dedupLookupQuery),
  httpNode(uuid(37), "Supabase GET Lead Dedup", [1420, 340], {
    method: "GET",
    url: "={{$env.SUPABASE_URL.replace(/\\/$/, '') + '/rest/v1/leads' + $json.lookup_path}}",
    headers: supabaseHeaders,
  }),
  codeNode(uuid(38), "Dedup Decision", [1660, 340], dedupDecision),
  switchNode(uuid(39), "Switch Action", [1900, 320], "extra"),
  httpNode(uuid(40), "POST Conversation (append)", [2140, 200], {
    method: "POST",
    url: "={{$env.SUPABASE_URL.replace(/\\/$/, '') + '/rest/v1/conversations'}}",
    headers: supabaseHeaders,
    body: '={{ JSON.stringify({ source: $json.normalized.source, customer_name: $json.normalized.customer_name, customer_email: $json.normalized.customer_email_or_phone, message: $json.normalized.message, received_at: $json.normalized.received_at, status: "unread", raw_payload: Object.assign({}, $json.normalized.raw_payload || {}, { lead_hint: $json.lead_id, external_thread_id: $json.normalized.external_thread_id }) }) }}',
  }),
  httpNode(uuid(41), "PATCH Lead Touch", [2380, 200], {
    method: "PATCH",
    url: "={{ $env.SUPABASE_URL.replace(/\\/$/, '') + '/rest/v1/leads?id=eq.' + $('Dedup Decision').first().json.lead_id }}",
    headers: supabaseHeaders,
    body: "={{ JSON.stringify({ updated_at: new Date().toISOString() }) }}",
  }),
  httpNode(uuid(42), "POST Conversation (new)", [2140, 440], {
    method: "POST",
    url: "={{$env.SUPABASE_URL.replace(/\\/$/, '') + '/rest/v1/conversations'}}",
    headers: supabaseHeaders,
    body: '={{ JSON.stringify({ source: $json.normalized.source, customer_name: $json.normalized.customer_name, customer_email: $json.normalized.customer_email_or_phone, message: $json.normalized.message, received_at: $json.normalized.received_at, status: "unread", raw_payload: Object.assign({}, $json.normalized.raw_payload || {}, { external_thread_id: $json.normalized.external_thread_id }) }) }}',
  }),
  executeWorkflowNode(uuid(43), "Execute WF2 Classification", [2620, 320], wf2Placeholder),
  httpNode(uuid(44), "Log Intake OK", [2860, 320], {
    method: "POST",
    url: "={{$env.SUPABASE_URL.replace(/\\/$/, '') + '/rest/v1/workflow_logs'}}",
    headers: supabaseHeaders,
    body: "={{ JSON.stringify({ workflow_name: 'WF0a Gmail Intake', step: 'channel_intake_ok', result: 'ok', payload: { source: 'gmail' } }) }}",
  }),
];

const connGmail = buildConnections({
  "Manual Trigger": [[{ node: "Load Gmail Fixture (demo)", type: "main", index: 0 }]],
  "Load Gmail Fixture (demo)": [[{ node: "Multi-Channel Normalizer", type: "main", index: 0 }]],
  "Multi-Channel Normalizer": [[{ node: "Noise Filter", type: "main", index: 0 }]],
  "Noise Filter": [[{ node: "IF Keep", type: "main", index: 0 }]],
  "IF Keep": [
    [{ node: "Dedup Lookup Query", type: "main", index: 0 }],
    [{ node: "Log Noise Drop", type: "main", index: 0 }],
  ],
  "Dedup Lookup Query": [[{ node: "Supabase GET Lead Dedup", type: "main", index: 0 }]],
  "Supabase GET Lead Dedup": [[{ node: "Dedup Decision", type: "main", index: 0 }]],
  "Dedup Decision": [[{ node: "Switch Action", type: "main", index: 0 }]],
  "Switch Action": [
    [{ node: "POST Conversation (append)", type: "main", index: 0 }],
    [{ node: "POST Conversation (new)", type: "main", index: 0 }],
  ],
  "POST Conversation (append)": [[{ node: "PATCH Lead Touch", type: "main", index: 0 }]],
  "PATCH Lead Touch": [[{ node: "Execute WF2 Classification", type: "main", index: 0 }]],
  "POST Conversation (new)": [[{ node: "Execute WF2 Classification", type: "main", index: 0 }]],
  "Execute WF2 Classification": [[{ node: "Log Intake OK", type: "main", index: 0 }]],
});

fs.writeFileSync(
  path.join(outDir, "wf0a_gmail_intake.json"),
  JSON.stringify(workflowTemplate("WF0a Gmail Intake", nodesGmail, connGmail), null, 2),
);

console.log("Wrote", path.join(outDir, "wf0a_gmail_intake.json"));
console.log("Wrote", path.join(outDir, "wf0b_whatsapp_intake.json"));
