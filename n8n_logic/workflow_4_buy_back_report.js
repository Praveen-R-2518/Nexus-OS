/**
 * Nexus OS — Workflow 4: Daily Buy-Back Report (n8n Code node)
 *
 * Paste into an n8n **Code** node (Run once for all items).
 *
 * Prompt: ai_prompts/buy_back_report_prompt.txt (or NEXUS_PROMPT_DIR).
 *
 * Input (per item) — supply metrics from Supabase / aggregations / n8n Set node:
 *   Prefer a single object in `buy_back_metrics`, or top-level fields:
 *   - total_conversations
 *   - hot_leads
 *   - churn_risks
 *   - revenue_at_risk
 *   - reply_drafts_created
 *   - replies_approved
 *   - follow_ups_scheduled
 *   - estimated_hours_saved
 *   - workflow_logs  (array of strings)
 *
 * Output JSON: { markdown_report: string }  (markdown only per prompt; wrapped for n8n wiring)
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
      'OPENAI_API_KEY is not set. Configure n8n environment variables or host env; do not hard-code the API key.',
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
  if (envDir && fs.existsSync(path.join(envDir, 'buy_back_report_prompt.txt'))) {
    return envDir;
  }
  const nextToScript = path.join(__dirname, '..', 'ai_prompts');
  if (fs.existsSync(path.join(nextToScript, 'buy_back_report_prompt.txt'))) {
    return nextToScript;
  }
  const cwd = path.join(process.cwd(), 'ai_prompts');
  if (fs.existsSync(path.join(cwd, 'buy_back_report_prompt.txt'))) {
    return cwd;
  }
  throw new Error(
    'Cannot find ai_prompts/buy_back_report_prompt.txt. Set NEXUS_PROMPT_DIR or run from repo root.',
  );
}

function loadReportSystemPrompt(override) {
  if (override && String(override).trim()) return String(override).trim();
  const dir = resolvePromptDir();
  return fs.readFileSync(path.join(dir, 'buy_back_report_prompt.txt'), 'utf8');
}

function pickMetrics(j) {
  const nested = j.buy_back_metrics && typeof j.buy_back_metrics === 'object'
    ? j.buy_back_metrics
    : {};
  const keys = [
    'total_conversations',
    'hot_leads',
    'churn_risks',
    'revenue_at_risk',
    'reply_drafts_created',
    'replies_approved',
    'follow_ups_scheduled',
    'estimated_hours_saved',
    'workflow_logs',
  ];
  const out = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(nested, k)) {
      out[k] = nested[k];
    } else if (Object.prototype.hasOwnProperty.call(j, k)) {
      out[k] = j[k];
    }
  }
  return out;
}

async function openaiMarkdownReport(system, user) {
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
      temperature: 0.3,
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
  if (!text) throw new Error('OpenAI: missing report content');
  return String(text).trim();
}

const items = $input.all();
const out = [];

for (const item of items) {
  const j = item.json || {};
  const system = loadReportSystemPrompt(j.buy_back_report_system_prompt);
  const metrics = pickMetrics(j);
  const user =
    'Here are the metrics JSON for today’s Buy-Back Report. Use only these values.\n\n' +
    JSON.stringify(metrics, null, 2);
  const markdown_report = await openaiMarkdownReport(system, user);
  out.push({
    json: {
      ...j,
      markdown_report,
    },
  });
}

return out;
