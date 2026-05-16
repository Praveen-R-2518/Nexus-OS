/**
 * Nexus OS — Workflow 2: Classification (n8n Code node)
 *
 * Paste into an n8n **Code** node (Run once for all items). Use async/await if required by your n8n version.
 *
 * Prompt: classification_prompt.txt in ai_prompts/ (override filename with NEXUS_CLASSIFICATION_PROMPT_FILE).
 *
 * Env:
 * - OPENAI_API_KEY (required) — n8n variables or host env; never hard-code.
 * - OPENAI_MODEL — default gpt-4o-mini
 * - NEXUS_PROMPT_DIR — absolute path to folder containing prompt .txt files (optional)
 * - NEXUS_CLASSIFICATION_PROMPT_FILE — prompt filename inside that folder (optional)
 *
 * Input JSON per item:
 * - customer_name, channel, message (or original_message / text)
 *
 * Output: Nexus schema fields (intent_type, urgency, …) spread on the item plus classification_result.
 */

const fs = require('fs');
const path = require('path');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

function getApiKey() {
  const fromN8n =
    typeof $env !== 'undefined' && $env.OPENAI_API_KEY
      ? String($env.OPENAI_API_KEY).trim()
      : '';
  const fromProcess = process.env.OPENAI_API_KEY
    ? String(process.env.OPENAI_API_KEY).trim()
    : '';
  const key = fromN8n || fromProcess;
  if (!key) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to n8n environment variables or credentials-derived env; do not hard-code the key in this file.',
    );
  }
  return key;
}

function getModel() {
  const m =
    (typeof $env !== 'undefined' && $env.OPENAI_MODEL) ||
    process.env.OPENAI_MODEL ||
    'gpt-4o-mini';
  return String(m).trim();
}

function getClassificationPromptBasename() {
  const fromEnv =
    (typeof $env !== 'undefined' && $env.NEXUS_CLASSIFICATION_PROMPT_FILE) ||
    process.env.NEXUS_CLASSIFICATION_PROMPT_FILE;
  const name = fromEnv ? String(fromEnv).trim() : '';
  return name || 'classification_prompt.txt';
}

function resolvePromptDir() {
  const envDir =
    typeof $env !== 'undefined' && $env.NEXUS_PROMPT_DIR
      ? String($env.NEXUS_PROMPT_DIR).trim()
      : process.env.NEXUS_PROMPT_DIR
        ? String(process.env.NEXUS_PROMPT_DIR).trim()
        : '';
  const candidates = [envDir, path.join(__dirname, '..', 'ai_prompts'), path.join(process.cwd(), 'ai_prompts')].filter(Boolean);

  for (const dir of candidates) {
    if (dir && fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      return dir;
    }
  }
  throw new Error(
    'Cannot resolve ai_prompts directory. Set NEXUS_PROMPT_DIR to the folder containing your classification prompt .txt files.',
  );
}

function loadClassificationSystemPrompt(override, dir) {
  if (override && String(override).trim()) return String(override).trim();
  const base = getClassificationPromptBasename();
  const full = path.join(dir, base);
  if (!fs.existsSync(full)) {
    throw new Error(`Classification prompt not found: ${full}`);
  }
  return fs.readFileSync(full, 'utf8');
}

function buildUserPayload({ customer_name, channel, message }) {
  const lines = [
    'Classify this single inbound customer message. Use only the message text for classification; the rest is context.',
    '',
    `customer_name: ${customer_name ?? ''}`,
    `channel: ${channel ?? ''}`,
    '',
    'message:',
    String(message ?? ''),
  ];
  return lines.join('\n');
}

async function openaiJsonChat(system, user) {
  const key = getApiKey();
  const model = getModel();
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI error ${res.status}: ${raw.slice(0, 800)}`);
  }
  const data = JSON.parse(raw);
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI: missing choices[0].message.content');
  return JSON.parse(text);
}

const items = $input.all();
const out = [];
const promptDir = resolvePromptDir();

for (const item of items) {
  const j = item.json || {};
  const system = loadClassificationSystemPrompt(j.classification_system_prompt, promptDir);
  const user = buildUserPayload({
    customer_name: j.customer_name,
    channel: j.channel,
    message: j.message ?? j.original_message ?? j.text,
  });
  const classification = await openaiJsonChat(system, user);
  out.push({
    json: {
      ...j,
      classification_result: classification,
      ...classification,
    },
  });
}

return out;
