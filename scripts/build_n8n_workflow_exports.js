#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
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
  '&status=in.(new,in_progress)' +
  '&or=(' + orInner + ')' +
  '&order=updated_at.desc&limit=1';
return [{ json: { lookup_path, normalized } }];
`.trim();

const dedupDecision = `
const response = $input.first().json;
const rows = Array.isArray(response)
  ? response
  : Array.isArray(response.body)
    ? response.body
    : response && response.id
      ? [response]
      : [];
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
    authentication: opts.supabaseCredential ? "genericCredentialType" : "none",
    sendHeaders: !!(opts.headers && opts.headers.length),
    headerParameters: {
      parameters: opts.headers || [],
    },
    options: opts.options || {},
  };
  if (opts.supabaseCredential) {
    parameters.genericAuthType = "httpCustomAuth";
  }
  if (opts.body) {
    parameters.sendBody = true;
    parameters.contentType = "json";
    parameters.specifyBody = "json";
    parameters.jsonBody = opts.body;
  }
  const node = {
    parameters,
    id,
    name,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.4,
    position,
  };
  if (opts.supabaseCredential) {
    node.credentials = {
      httpCustomAuth: {
        id: "4rfwTEeSitzS3JeQ",
        name: "Supabase API",
      },
    };
  }
  if (opts.onError) node.onError = opts.onError;
  if (opts.alwaysOutputData) node.alwaysOutputData = true;
  if (opts.retries) {
    node.retryOnFail = true;
    node.maxTries = opts.retries.maxTries ?? 3;
    node.waitBetweenTries = opts.retries.waitMs ?? 1000;
  }
  return node;
}

function stopAndErrNode(id, name, position, errorMessage) {
  return {
    parameters: {
      errorType: "errorMessage",
      errorMessage,
    },
    id,
    name,
    type: "n8n-nodes-base.stopAndError",
    typeVersion: 1,
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
    typeVersion: 2.3,
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
    typeVersion: 3.4,
    position,
  };
}

function buildConnections(map) {
  const out = {};
  for (const [from, targets] of Object.entries(map)) {
    out[from] = { main: targets };
  }
  return out;
}

const supabaseBaseUrl = "https://xuvodbcdmfhlbldbvwvt.supabase.co/rest/v1";
const wf2WebhookUrl = "https://knurdz3o.app.n8n.cloud/webhook/nexus/classify";

const supabaseCredentialHeaders = [
  { name: "Content-Type", value: "application/json" },
  { name: "Prefer", value: "return=representation" },
];

const supabaseMinimalHeaders = [
  { name: "Content-Type", value: "application/json" },
  { name: "Prefer", value: "return=minimal" },
];

function workflowTemplate(name, nodes, connections) {
  return {
    name,
    nodes,
    connections,
    pinData: {},
    settings: {
      executionOrder: "v1",
      saveDataErrorExecution: "all",
      saveDataSuccessExecution: "all",
    },
    staticData: null,
    meta: { templateCredsSetupCompleted: false, instanceId: "nexus-os-export" },
    tags: [{ name: "nexus-os" }],
  };
}

const normalizerJs = stripForN8nCodeNode(path.join(n8nLogic, "multi_channel_normalizer.js"));
const noiseJs = stripForN8nCodeNode(path.join(n8nLogic, "noise_filter.js"));

function wf2TriggerBody(sourceNodeName, includeLeadId) {
  const leadLine = includeLeadId
    ? "  lead_id: $('Dedup Decision').first().json.lead_id,\n"
    : "";
  return `={{ {
  conversation_id: $('${sourceNodeName}').first().json.body[0].id,
${leadLine}  message: $('Dedup Decision').first().json.normalized.message,
  customer_name: $('Dedup Decision').first().json.normalized.customer_name,
  customer_email: $('Dedup Decision').first().json.normalized.customer_email_or_phone
} }}`;
}

const outDir = path.join(n8nLogic, "exports");
fs.mkdirSync(outDir, { recursive: true });
const staleRemovedChannelExport = path.join(outDir, "wf0b_" + "wh" + "atsapp_intake.json");
if (fs.existsSync(staleRemovedChannelExport)) fs.unlinkSync(staleRemovedChannelExport);

// --- WF0a Gmail (IMAP credential slot + webhook fallback) ---
const emailTrigger = {
  parameters: {
    mailbox: "INBOX",
    postProcessAction: "read",
    format: "simple",
    downloadAttachments: false,
  },
  id: uuid(29),
  name: "Gmail IMAP Trigger (configure credential)",
  type: "n8n-nodes-base.emailReadImap",
  typeVersion: 2.1,
  position: [0, 120],
  disabled: true,
  notes: "Enable after adding an IMAP credential in n8n. The webhook fallback below remains available for demos.",
};

const gmailWebhook = {
  parameters: {
    httpMethod: "POST",
    path: "gmail-inbound",
    responseMode: "onReceived",
    options: {},
  },
  id: uuid(301),
  name: "Gmail Test Webhook",
  type: "n8n-nodes-base.webhook",
  typeVersion: 2.1,
  position: [0, 360],
  webhookId: "nexus-gmail-inbound",
  onError: "continueRegularOutput",
};

const nodesGmail = [
  sticky(
    "## Nexus OS - WF0a Gmail Intake\n\nPrimary path: enable `Gmail IMAP Trigger` after adding an IMAP credential.\n\nFallback path: POST Gmail-shaped payloads to `/webhook/gmail-inbound`.\n\nNormalizer supports **gmail** (IMAP/webhook) and **demo** webhook payloads only.",
    [-220, 0],
    460,
  ),
  emailTrigger,
  gmailWebhook,
  codeNode(uuid(32), "Multi-Channel Normalizer", [500, 360], normalizerJs),
  codeNode(uuid(33), "Noise Filter", [740, 360], noiseJs),
  ifKeepNode(uuid(34), "IF Keep", [980, 360]),
  httpNode(uuid(35), "Log Noise Drop", [1220, 160], {
    method: "POST",
    url: `${supabaseBaseUrl}/workflow_logs`,
    supabaseCredential: true,
    headers: supabaseMinimalHeaders,
    body: '={{ { workflow_name: "WF0a Gmail Intake", step: "noise_filter_dropped", result: "skipped", payload: $json } }}',
    onError: "continueRegularOutput",
  }),
  codeNode(uuid(36), "Dedup Lookup Query", [1220, 400], dedupLookupQuery),
  httpNode(uuid(37), "Supabase GET Lead Dedup", [1460, 400], {
    method: "GET",
    url: `=${supabaseBaseUrl}/leads{{ $json.lookup_path }}`,
    supabaseCredential: true,
    headers: [{ name: "Content-Type", value: "application/json" }],
    options: { response: { response: { fullResponse: true, responseFormat: "json" } } },
    alwaysOutputData: true,
    retries: { maxTries: 5, waitMs: 1500 },
  }),
  codeNode(uuid(38), "Dedup Decision", [1700, 400], dedupDecision),
  switchNode(uuid(39), "Switch Action", [1940, 380], "extra"),
  httpNode(uuid(40), "POST Conversation (append)", [2180, 260], {
    method: "POST",
    url: `${supabaseBaseUrl}/conversations`,
    supabaseCredential: true,
    headers: supabaseCredentialHeaders,
    body: '={{ { source: $json.normalized.source, customer_name: $json.normalized.customer_name, customer_email: $json.normalized.customer_email_or_phone, message: $json.normalized.message, received_at: $json.normalized.received_at, status: "unread", raw_payload: Object.assign({}, $json.normalized.raw_payload || {}, { lead_hint: $json.lead_id, external_thread_id: $json.normalized.external_thread_id, ingest_source: $json.normalized.source }) } }}',
    options: { response: { response: { fullResponse: true, responseFormat: "json" } } },
    retries: { maxTries: 4, waitMs: 1500 },
    onError: "continueErrorOutput",
  }),
  httpNode(uuid(41), "PATCH Lead Touch", [2420, 260], {
    method: "PATCH",
    url: `=${supabaseBaseUrl}/leads?id=eq.{{ $('Dedup Decision').first().json.lead_id }}`,
    supabaseCredential: true,
    headers: supabaseCredentialHeaders,
    body: "={{ { updated_at: new Date().toISOString() } }}",
    options: { response: { response: { neverError: true, responseFormat: "json" } } },
    onError: "continueRegularOutput",
  }),
  httpNode(uuid(42), "POST Conversation (new)", [2180, 500], {
    method: "POST",
    url: `${supabaseBaseUrl}/conversations`,
    supabaseCredential: true,
    headers: supabaseCredentialHeaders,
    body: '={{ { source: $json.normalized.source, customer_name: $json.normalized.customer_name, customer_email: $json.normalized.customer_email_or_phone, message: $json.normalized.message, received_at: $json.normalized.received_at, status: "unread", raw_payload: Object.assign({}, $json.normalized.raw_payload || {}, { external_thread_id: $json.normalized.external_thread_id, ingest_source: $json.normalized.source }) } }}',
    options: { response: { response: { fullResponse: true, responseFormat: "json" } } },
    retries: { maxTries: 4, waitMs: 1500 },
    onError: "continueErrorOutput",
  }),
  httpNode(uuid(43), "Trigger WF2 Classification (append)", [2660, 260], {
    method: "POST",
    url: wf2WebhookUrl,
    headers: [{ name: "Content-Type", value: "application/json" }],
    body: wf2TriggerBody("POST Conversation (append)", true),
    options: { timeout: 30000, response: { response: { neverError: true, responseFormat: "json" } } },
    onError: "continueRegularOutput",
    alwaysOutputData: true,
  }),
  httpNode(uuid(431), "Trigger WF2 Classification (new)", [2660, 500], {
    method: "POST",
    url: wf2WebhookUrl,
    headers: [{ name: "Content-Type", value: "application/json" }],
    body: wf2TriggerBody("POST Conversation (new)", false),
    options: { timeout: 30000, response: { response: { neverError: true, responseFormat: "json" } } },
    onError: "continueRegularOutput",
    alwaysOutputData: true,
  }),
  httpNode(uuid(44), "Log Intake OK", [2900, 380], {
    method: "POST",
    url: `${supabaseBaseUrl}/workflow_logs`,
    supabaseCredential: true,
    headers: supabaseCredentialHeaders,
    body: "={{ { workflow_name: 'WF0a Gmail Intake', step: 'gmail_intake_ok', result: 'success', payload: { source: $('Dedup Decision').first().json.normalized.source, wf2_response: $json } } }}",
    onError: "continueRegularOutput",
  }),
  httpNode(uuid(45), "Log Intake Error", [2420, 80], {
    method: "POST",
    url: `${supabaseBaseUrl}/workflow_logs`,
    supabaseCredential: true,
    headers: supabaseMinimalHeaders,
    body: "={{ { workflow_name: 'WF0a Gmail Intake', step: 'gmail_intake_error', result: 'error', payload: { error: $json, normalized: $('Dedup Decision').first().json.normalized } } }}",
    onError: "continueRegularOutput",
    retries: { maxTries: 2, waitMs: 800 },
  }),
  stopAndErrNode(
    uuid(46),
    "Stop on Intake DB Error",
    [2660, 80],
    "WF0a: conversation persistence failed after retries. Inspect workflow_logs (gmail_intake_error) and the failed execution.",
  ),
];

const connGmail = buildConnections({
  "Gmail IMAP Trigger (configure credential)": [[{ node: "Multi-Channel Normalizer", type: "main", index: 0 }]],
  "Gmail Test Webhook": [[{ node: "Multi-Channel Normalizer", type: "main", index: 0 }]],
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
  "PATCH Lead Touch": [[{ node: "Trigger WF2 Classification (append)", type: "main", index: 0 }]],
  "POST Conversation (new)": [[{ node: "Trigger WF2 Classification (new)", type: "main", index: 0 }]],
  "Trigger WF2 Classification (append)": [[{ node: "Log Intake OK", type: "main", index: 0 }]],
  "Trigger WF2 Classification (new)": [[{ node: "Log Intake OK", type: "main", index: 0 }]],
});

connGmail["POST Conversation (append)"].main = [
  [{ node: "PATCH Lead Touch", type: "main", index: 0 }],
  [{ node: "Log Intake Error", type: "main", index: 0 }],
];
connGmail["POST Conversation (new)"].main = [
  [{ node: "Trigger WF2 Classification (new)", type: "main", index: 0 }],
  [{ node: "Log Intake Error", type: "main", index: 0 }],
];
connGmail["Log Intake Error"] = {
  main: [[{ node: "Stop on Intake DB Error", type: "main", index: 0 }]],
};

fs.writeFileSync(
  path.join(outDir, "wf0a_gmail_intake.json"),
  JSON.stringify(workflowTemplate("WF0a Gmail Intake", nodesGmail, connGmail), null, 2),
);

console.log("Wrote", path.join(outDir, "wf0a_gmail_intake.json"));
