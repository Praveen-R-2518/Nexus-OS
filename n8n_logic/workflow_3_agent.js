/**
 * Nexus OS — Workflow 3: Reply generation / agent (n8n Code node)
 *
 * Paste into an n8n **Code** node (Run once for all items).
 *
 * Prompt: ai_prompts/reply_generation_prompt.txt (or NEXUS_PROMPT_DIR).
 *
 * Expected input JSON (per item):
 *   - customer_name
 *   - channel
 *   - original_message  (or `message` as fallback)
 *   - classification_result  (object from workflow 2, or JSON string; Nexus or Silva/LKR schema — WF3 enriches needs_human_approval for Silva when needed)
 *
 * Output JSON: reply_text, approval_required, approval_reason, tone, next_step,
 * follow_up_needed, follow_up_delay_minutes
 *
 * API key: OPENAI_API_KEY via n8n environment or process.env — never hard-code.
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
      'OPENAI_API_KEY is not set. Use n8n environment variables or host env; do not hard-code the API key.',
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

function resolvePromptDir() {
  const envDir =
    typeof $env !== 'undefined' && $env.NEXUS_PROMPT_DIR
      ? String($env.NEXUS_PROMPT_DIR).trim()
      : process.env.NEXUS_PROMPT_DIR
        ? String(process.env.NEXUS_PROMPT_DIR).trim()
        : '';
  if (envDir && fs.existsSync(path.join(envDir, 'reply_generation_prompt.txt'))) {
    return envDir;
  }
  const nextToScript = path.join(__dirname, '..', 'ai_prompts');
  if (fs.existsSync(path.join(nextToScript, 'reply_generation_prompt.txt'))) {
    return nextToScript;
  }
  const cwd = path.join(process.cwd(), 'ai_prompts');
  if (fs.existsSync(path.join(cwd, 'reply_generation_prompt.txt'))) {
    return cwd;
  }
  throw new Error(
    'Cannot find ai_prompts/reply_generation_prompt.txt. Set NEXUS_PROMPT_DIR or run from repo root.',
  );
}

function loadReplySystemPrompt(override) {
  if (override && String(override).trim()) return String(override).trim();
  const dir = resolvePromptDir();
  return fs.readFileSync(path.join(dir, 'reply_generation_prompt.txt'), 'utf8');
}

function normalizeClassification(raw) {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }
  return raw;
}

/** Map Silva/LKR classifier fields so reply_generation_prompt (Nexus) still sees needs_human_approval when appropriate. */
function enrichClassificationForReply(cls) {
  const out = { ...cls };
  if (typeof out.needs_human_approval === 'boolean') return out;
  if (out.intent != null && out.recommended_action != null) {
    const ra = String(out.recommended_action || '');
    const highRisk = typeof out.risk_score === 'number' && out.risk_score >= 0.8;
    const churn = String(out.risk_type || '') === 'churn_risk';
    const complaint = String(out.intent || '') === 'complaint';
    out.needs_human_approval =
      ra === 'request_approval' ||
      ra === 'escalate_to_founder' ||
      churn ||
      (complaint && highRisk) ||
      highRisk;
  }
  return out;
}

function buildUserPayload({ customer_name, channel, original_message, classification_result }) {
  const cls = enrichClassificationForReply(normalizeClassification(classification_result));
  const lines = [
    'Generate the reply draft JSON per your instructions.',
    '',
    `customer_name: ${customer_name ?? ''}`,
    `channel: ${channel ?? ''}`,
    '',
    'original_message:',
    String(original_message ?? ''),
    '',
    'classification_result (use for tone and approval flags; do not paste into reply_text):',
    JSON.stringify(cls, null, 2),
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
      temperature: 0.4,
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

for (const item of items) {
  const j = item.json || {};
  const system = loadReplySystemPrompt(j.reply_system_prompt);
  const user = buildUserPayload({
    customer_name: j.customer_name,
    channel: j.channel,
    original_message: j.original_message ?? j.message ?? j.text,
    classification_result: j.classification_result ?? j.classification,
  });
  const replyDraft = await openaiJsonChat(system, user);
  out.push({
    json: {
      ...j,
      reply_draft: replyDraft,
      ...replyDraft,
    },
  });
}

return out;