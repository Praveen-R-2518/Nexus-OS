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

function stripTenantResolverForN8n() {
  let src = fs.readFileSync(path.join(n8nLogic, "tenant_route_resolver.js"), "utf8");
  src = src.replace(/^\/\*\*[\s\S]*?\*\/\s*/, "");
  src = src.replace(/\nif \(typeof module !== "undefined" && module\.exports\) \{[\s\S]*$/m, "\n");
  return `${src.trim()}\n`;
}

function stripForN8nCodeNode(filePath) {
  let src = fs.readFileSync(filePath, "utf8");
  // Drop file-level block comment (first /** ... */ only)
  src = src.replace(/^\/\*\*[\s\S]*?\*\/\s*/, "");
  // Remove Node export tail
  src = src.replace(
    /\nif \(typeof module !== "undefined" && module\.exports\) \{[\s\S]*$/,
    "\n",
  );
  // Normalizer: unwrap guarded entry for n8n (keep try/catch)
  src = src.replace(
    /\nif \(typeof \$input !== "undefined"\) \{\n\s*try \{\n\s*return \$input\.all\(\)\.map\(\(\{ json \}\) => \(\{ json: normalizeItem\(json\) \}\)\);\n\s*\} catch \(error\) \{\n\s*return \[\n\s*\{\n\s*json: \{\n\s*error: error\.message,\n\s*node: "MultiChannelNormalizer",\n\s*timestamp: new Date\(\)\.toISOString\(\),\n\s*\},\n\s*\},\n\s*\];\n\s*\}\n\}\n/,
    "\ntry {\n  return $input.all().map(({ json }) => ({\n    json: normalizeItem(json),\n  }));\n} catch (error) {\n  return [\n    {\n      json: {\n        error: error.message,\n        node: \"MultiChannelNormalizer\",\n        timestamp: new Date().toISOString(),\n      },\n    },\n  ];\n}\n",
  );
  // Noise filter: unwrap guarded entry for n8n (keep try/catch)
  src = src.replace(
    /\nif \(typeof \$input !== "undefined"\) \{\n\s*try \{\n\s*return \$input\.all\(\)\.map\(\(\{ json \}\) => evaluateNoiseFilter\(json\)\);\n\s*\} catch \(error\) \{\n\s*return \[\n\s*\{\n\s*json: \{\n\s*error: error\.message,\n\s*node: "NoiseFilter",\n\s*timestamp: new Date\(\)\.toISOString\(\),\n\s*\},\n\s*\},\n\s*\];\n\s*\}\n\}\n/,
    "\ntry {\n  return $input.all().map(({ json }) => evaluateNoiseFilter(json));\n} catch (error) {\n  return [\n    {\n      json: {\n        error: error.message,\n        node: \"NoiseFilter\",\n        timestamp: new Date().toISOString(),\n      },\n    },\n  ];\n}\n",
  );
  return src.trim() + "\n";
}

const tenantRouteExtractJs =
  `${stripTenantResolverForN8n()}try {
  const trigger = $input.first().json;
  const __intake = buildIntakeEnvelope(trigger);
  const _route = resolveRouteFromIntake(trigger);
  const lookup_path = buildBusinessProfileLookupPath(_route);
  return [{ json: { __intake, _route, lookup_path } }];
} catch (error) {
  return [
    {
      json: {
        error: error.message,
        node: 'TenantRouteExtract',
        timestamp: new Date().toISOString(),
      },
    },
  ];
}
`.trim();

const verifyTenantJs =
  `${stripTenantResolverForN8n()}try {
  const http = $input.first().json;
  const prev = $('Tenant Route Extract').first().json;
  if (prev.error) return [{ json: prev }];
  const rows = Array.isArray(http)
    ? http
    : Array.isArray(http.body)
      ? http.body
      : http && http.id
        ? [http]
        : [];
  const profile = verifySingleBusinessProfile(rows);
  const envWs = getEnv('NEXUS_WORKSPACE_ID');
  const workspaceId = profile.workspace_id || (isUuid(envWs) ? envWs : null);
  const intake = prev.__intake || {};
  return [
    {
      json: {
        ...intake,
        _tenant: {
          team_id: profile.team_id,
          workspace_id: workspaceId,
          business_profile_id: profile.id,
          route_source: prev._route.type,
          route_key: prev._route.value,
        },
      },
    },
  ];
} catch (error) {
  return [
    {
      json: {
        error: error.message,
        node: 'VerifyTenantContext',
        timestamp: new Date().toISOString(),
      },
    },
  ];
}
`.trim();

const dedupLookupQuery = `
try {
  const normalized = $input.first().json;
  const teamId = normalized.team_id || '';
  if (!teamId) throw new Error('DedupLookupQuery: missing team_id');
  const id = normalized.customer_email_or_phone || '';
  if (!id) throw new Error('DedupLookupQuery: missing customer_email_or_phone');
  const variants = [...new Set([id, id.toLowerCase()].filter(Boolean))];
  const orInner = variants.map((v) => 'customer_email.eq.' + encodeURIComponent(v)).join(',');
  const lookup_path =
    '?select=id,status,updated_at' +
    '&team_id=eq.' + encodeURIComponent(teamId) +
    '&status=in.(new,in_progress)' +
    '&or=(' + orInner + ')' +
    '&order=updated_at.desc&limit=1';
  return [{ json: { lookup_path, normalized } }];
} catch (error) {
  return [{ json: { error: error.message, node: 'DedupLookupQuery', timestamp: new Date().toISOString() } }];
}
`.trim();

const dedupDecision = `
try {
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
} catch (error) {
  return [{ json: { error: error.message, node: 'DedupDecision', timestamp: new Date().toISOString() } }];
}
`.trim();

const buildInboundFinalizePayloadJs = `
try {
  const norm = $('Dedup Decision').first().json.normalized || {};
  const source = String(norm.source || 'gmail').toLowerCase();
  const platform = ['gmail', 'whatsapp', 'instagram', 'facebook'].includes(source) ? source : 'gmail';
  let externalMessageId = '';
  const raw = norm.raw_payload || {};
  const body = raw.body && typeof raw.body === 'object' ? raw.body : raw;
  if (platform === 'gmail') {
    const headers = body.headers || {};
    const mid = headers['message-id'] || headers['Message-ID'] || body.messageId || '';
    externalMessageId = String(mid).replace(/[<>]/g, '').trim();
  } else if (platform === 'whatsapp') {
    externalMessageId =
      body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id || body.message_id || '';
  } else if (platform === 'instagram' || platform === 'facebook') {
    externalMessageId =
      body.entry?.[0]?.messaging?.[0]?.message?.mid ||
      body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id ||
      '';
  }
  if (!externalMessageId) {
    return [{ json: { skip: true, reason: 'no_external_message_id' } }];
  }
  return [{ json: { skip: false, platform, external_message_id: externalMessageId } }];
} catch (error) {
  return [{ json: { skip: true, reason: error.message } }];
}
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
    onError: "continueRegularOutput",
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
    onError: "continueErrorOutput",
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
    onError: "continueErrorOutput",
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
  customer_email: $('Dedup Decision').first().json.normalized.customer_email_or_phone,
  team_id: $('Dedup Decision').first().json.normalized.team_id,
  workspace_id: $('Dedup Decision').first().json.normalized.workspace_id,
  channel: $('Dedup Decision').first().json.normalized.channel || 'email'
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
    options: {
      responseData: '{"status":"received"}',
      responseHeaders: {
        entries: [{ name: "Content-Type", value: "application/json; charset=utf-8" }],
      },
    },
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
    "## Nexus OS - WF0a Gmail Intake\n\n**Tenant routing:** `Tenant Route Extract` resolves `business_profiles` via `gmail_destination_email`, `whatsapp_routing_number`, `wa_phone_number_id`, `ig_account_id`, `fb_page_id`, or `webhook_route_token` (see migrations `0012` + `20260619120000_meta_unified_inbox_foundation.sql`).\n\n**n8n env:** `NEXUS_GMAIL_DESTINATION_MAILBOX` (IMAP), `NEXUS_WHATSAPP_DESTINATION_NUMBER`, `NEXUS_WA_PHONE_NUMBER_ID`, `NEXUS_WHATSAPP_TOKEN_HEADER` (default `x-nexus-webhook-token`), `NEXUS_WORKSPACE_ID` (fallback if profile has no workspace).\n\nPrimary path: IMAP trigger. Fallback: POST to `/webhook/gmail-inbound` (also receives Meta payloads forwarded from Next.js `/api/meta/webhook`). Normalizer requires verified `_tenant` from **Verify Tenant Context**.",
    [-220, 0],
    520,
  ),
  emailTrigger,
  gmailWebhook,
  codeNode(uuid(501), "Tenant Route Extract", [220, 360], tenantRouteExtractJs),
  httpNode(uuid(502), "Supabase GET Business Profile", [460, 360], {
    method: "GET",
    url: `=${supabaseBaseUrl}/business_profiles{{ $json.lookup_path }}`,
    supabaseCredential: true,
    headers: [{ name: "Content-Type", value: "application/json" }],
    options: { response: { response: { fullResponse: true, responseFormat: "json" } } },
    alwaysOutputData: true,
    retries: { maxTries: 4, waitMs: 1200 },
  }),
  codeNode(uuid(503), "Verify Tenant Context", [700, 360], verifyTenantJs),
  codeNode(uuid(32), "Multi-Channel Normalizer", [940, 360], normalizerJs),
  codeNode(uuid(33), "Noise Filter", [1180, 360], noiseJs),
  ifKeepNode(uuid(34), "IF Keep", [1420, 360]),
  httpNode(uuid(35), "Log Noise Drop", [1660, 160], {
    method: "POST",
    url: `${supabaseBaseUrl}/workflow_logs`,
    supabaseCredential: true,
    headers: supabaseMinimalHeaders,
    body: '={{ { workflow_name: "WF0a Gmail Intake", step: "noise_filter_dropped", result: "skipped", team_id: $json.normalized.team_id, workspace_id: $json.normalized.workspace_id || $env.NEXUS_WORKSPACE_ID, payload: $json } }}',
    onError: "continueRegularOutput",
  }),
  codeNode(uuid(36), "Dedup Lookup Query", [1660, 400], dedupLookupQuery),
  httpNode(uuid(37), "Supabase GET Lead Dedup", [1900, 400], {
    method: "GET",
    url: `=${supabaseBaseUrl}/leads{{ $json.lookup_path }}`,
    supabaseCredential: true,
    headers: [{ name: "Content-Type", value: "application/json" }],
    options: { response: { response: { fullResponse: true, responseFormat: "json" } } },
    alwaysOutputData: true,
    retries: { maxTries: 5, waitMs: 1500 },
  }),
  codeNode(uuid(38), "Dedup Decision", [2140, 400], dedupDecision),
  switchNode(uuid(39), "Switch Action", [2380, 380], "extra"),
  httpNode(uuid(40), "POST Conversation (append)", [2620, 260], {
    method: "POST",
    url: `${supabaseBaseUrl}/conversations`,
    supabaseCredential: true,
    headers: supabaseCredentialHeaders,
    body: '={{ { source: $json.normalized.source, channel: $json.normalized.channel || "email", team_id: $json.normalized.team_id, workspace_id: $json.normalized.workspace_id || $env.NEXUS_WORKSPACE_ID, customer_name: $json.normalized.customer_name, customer_email: $json.normalized.customer_email_or_phone, message: $json.normalized.message, received_at: $json.normalized.received_at, status: "unread", external_thread_id: $json.normalized.external_thread_id || null, external_permalink: $json.normalized.external_permalink || null, raw_payload: Object.assign({}, $json.normalized.raw_payload || {}, { lead_hint: $json.lead_id, external_thread_id: $json.normalized.external_thread_id, external_permalink: $json.normalized.external_permalink, ingest_source: $json.normalized.source }) } }}',
    options: { response: { response: { fullResponse: true, responseFormat: "json" } } },
    retries: { maxTries: 4, waitMs: 1500 },
    onError: "continueErrorOutput",
  }),
  httpNode(uuid(41), "PATCH Lead Touch", [2860, 260], {
    method: "PATCH",
    url: `=${supabaseBaseUrl}/leads?id=eq.{{ $('Dedup Decision').first().json.lead_id }}&team_id=eq.{{ $('Dedup Decision').first().json.normalized.team_id }}`,
    supabaseCredential: true,
    headers: supabaseCredentialHeaders,
    body: "={{ { updated_at: new Date().toISOString() } }}",
    options: { response: { response: { neverError: true, responseFormat: "json" } } },
    onError: "continueRegularOutput",
  }),
  httpNode(uuid(42), "POST Conversation (new)", [2620, 500], {
    method: "POST",
    url: `${supabaseBaseUrl}/conversations`,
    supabaseCredential: true,
    headers: supabaseCredentialHeaders,
    body: '={{ { source: $json.normalized.source, channel: $json.normalized.channel || "email", team_id: $json.normalized.team_id, workspace_id: $json.normalized.workspace_id || $env.NEXUS_WORKSPACE_ID, customer_name: $json.normalized.customer_name, customer_email: $json.normalized.customer_email_or_phone, message: $json.normalized.message, received_at: $json.normalized.received_at, status: "unread", external_thread_id: $json.normalized.external_thread_id || null, external_permalink: $json.normalized.external_permalink || null, raw_payload: Object.assign({}, $json.normalized.raw_payload || {}, { external_thread_id: $json.normalized.external_thread_id, external_permalink: $json.normalized.external_permalink, ingest_source: $json.normalized.source }) } }}',
    options: { response: { response: { fullResponse: true, responseFormat: "json" } } },
    retries: { maxTries: 4, waitMs: 1500 },
    onError: "continueErrorOutput",
  }),
  httpNode(uuid(43), "Trigger WF2 Classification (append)", [3100, 260], {
    method: "POST",
    url: wf2WebhookUrl,
    headers: [{ name: "Content-Type", value: "application/json" }],
    body: wf2TriggerBody("POST Conversation (append)", true),
    options: { timeout: 30000, response: { response: { neverError: true, responseFormat: "json" } } },
    onError: "continueRegularOutput",
    alwaysOutputData: true,
  }),
  httpNode(uuid(431), "Trigger WF2 Classification (new)", [3100, 500], {
    method: "POST",
    url: wf2WebhookUrl,
    headers: [{ name: "Content-Type", value: "application/json" }],
    body: wf2TriggerBody("POST Conversation (new)", false),
    options: { timeout: 30000, response: { response: { neverError: true, responseFormat: "json" } } },
    onError: "continueRegularOutput",
    alwaysOutputData: true,
  }),
  httpNode(uuid(44), "Log Intake OK", [3340, 380], {
    method: "POST",
    url: `${supabaseBaseUrl}/workflow_logs`,
    supabaseCredential: true,
    headers: supabaseCredentialHeaders,
    body: "={{ { workflow_name: 'WF0a Gmail Intake', step: 'gmail_intake_ok', result: 'success', team_id: $('Dedup Decision').first().json.normalized.team_id, workspace_id: $('Dedup Decision').first().json.normalized.workspace_id || $env.NEXUS_WORKSPACE_ID, payload: { source: $('Dedup Decision').first().json.normalized.source, wf2_response: $json } } }}",
    onError: "continueRegularOutput",
  }),
  codeNode(uuid(47), "Build Inbound Finalize Payload", [3580, 380], buildInboundFinalizePayloadJs),
  {
    parameters: {
      conditions: {
        options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "loose" },
        conditions: [
          {
            id: uuid(472),
            leftValue: "={{ $json.skip }}",
            rightValue: false,
            operator: { type: "boolean", operation: "equals" },
          },
        ],
        combinator: "and",
      },
    },
    id: uuid(471),
    name: "Has Inbound Event?",
    type: "n8n-nodes-base.if",
    typeVersion: 2.3,
    position: [3820, 380],
    onError: "continueRegularOutput",
  },
  httpNode(uuid(48), "Finalize Inbound Event", [4060, 300], {
    method: "POST",
    url: "={{ ($env.NEXUS_APP_URL || 'https://nexusos.knurdz.org').replace(/\\/$/, '') + '/api/internal/n8n/inbound-finalize' }}",
    headers: [
      { name: "Authorization", value: "=Bearer {{ $env.N8N_BOOTSTRAP_TOKEN || $env.N8N_INGEST_TOKEN }}" },
      { name: "Content-Type", value: "application/json" },
    ],
    body: "={{ { platform: $json.platform, external_message_id: $json.external_message_id } }}",
    options: { response: { response: { neverError: true, responseFormat: "json" } } },
    onError: "continueRegularOutput",
  }),
  httpNode(uuid(45), "Log Intake Error", [2860, 80], {
    method: "POST",
    url: `${supabaseBaseUrl}/workflow_logs`,
    supabaseCredential: true,
    headers: supabaseMinimalHeaders,
    body: "={{ { workflow_name: 'WF0a Gmail Intake', step: 'gmail_intake_error', result: 'error', team_id: $('Dedup Decision').first().json.normalized.team_id, workspace_id: $('Dedup Decision').first().json.normalized.workspace_id || $env.NEXUS_WORKSPACE_ID, payload: { error: $json, normalized: $('Dedup Decision').first().json.normalized } } }}",
    onError: "continueRegularOutput",
    retries: { maxTries: 2, waitMs: 800 },
  }),
  stopAndErrNode(
    uuid(46),
    "Stop on Intake DB Error",
    [3100, 80],
    "WF0a: conversation persistence failed after retries. Inspect workflow_logs (gmail_intake_error) and the failed execution.",
  ),
];

const connGmail = buildConnections({
  "Gmail IMAP Trigger (configure credential)": [[{ node: "Tenant Route Extract", type: "main", index: 0 }]],
  "Gmail Test Webhook": [[{ node: "Tenant Route Extract", type: "main", index: 0 }]],
  "Tenant Route Extract": [[{ node: "Supabase GET Business Profile", type: "main", index: 0 }]],
  "Supabase GET Business Profile": [[{ node: "Verify Tenant Context", type: "main", index: 0 }]],
  "Verify Tenant Context": [[{ node: "Multi-Channel Normalizer", type: "main", index: 0 }]],
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
  "Log Intake OK": [[{ node: "Build Inbound Finalize Payload", type: "main", index: 0 }]],
  "Build Inbound Finalize Payload": [[{ node: "Has Inbound Event?", type: "main", index: 0 }]],
  "Has Inbound Event?": [
    [{ node: "Finalize Inbound Event", type: "main", index: 0 }],
    [],
  ],
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
