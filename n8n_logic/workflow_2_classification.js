/**
 * Nexus OS — Workflow 2: Classification (n8n Code node)
 *
 * Paste into an n8n **Code** node (Run once for all items). Use async/await if required by your n8n version.
 *
 * Centralized AI: this node no longer calls OpenAI directly. It POSTs to the Next.js app's
 * `/api/internal/n8n/ai/classify` endpoint, which holds the single `OPENAI_API_KEY` and runs
 * `lib/ai/classify.ts` (loads `ai_prompts/classification_prompt.txt` server-side). n8n only
 * needs the app URL + ingest token — never the OpenAI key.
 *
 * Env:
 * - NEXUS_APP_URL (required) — the Next.js app's base URL. n8n Variable preferred
 *   ($vars.NEXUS_APP_URL) — n8n Cloud blocks $env in node expressions
 *   (N8N_BLOCK_ENV_ACCESS_IN_NODE), so $vars is checked first below.
 * - N8N_INGEST_TOKEN (required) — Bearer token the app's internal routes require.
 *
 * Input JSON per item:
 * - customer_name, channel, message (or original_message / text), team_id, workspace_id
 *
 * Output: classification fields spread on the item plus classification_result. On a 503
 * `ai_not_configured` response, the item is annotated with `classification_failed: true` and
 * `ai_not_configured: true` instead of throwing, so the workflow can branch to a human queue.
 */

function getAppUrl() {
  const fromVars =
    typeof $vars !== 'undefined' && $vars.NEXUS_APP_URL ? String($vars.NEXUS_APP_URL).trim() : '';
  const fromEnv =
    typeof $env !== 'undefined' && $env.NEXUS_APP_URL ? String($env.NEXUS_APP_URL).trim() : '';
  const fromProcess = process.env.NEXUS_APP_URL ? String(process.env.NEXUS_APP_URL).trim() : '';
  const url = fromVars || fromEnv || fromProcess;
  if (!url) {
    throw new Error(
      'NEXUS_APP_URL is not set. Add it as an n8n Variable ($vars.NEXUS_APP_URL, Settings -> Variables).',
    );
  }
  return url.replace(/\/+$/, '');
}

function getIngestToken() {
  const fromVars =
    typeof $vars !== 'undefined' && $vars.N8N_INGEST_TOKEN
      ? String($vars.N8N_INGEST_TOKEN).trim()
      : '';
  const fromEnv =
    typeof $env !== 'undefined' && $env.N8N_INGEST_TOKEN
      ? String($env.N8N_INGEST_TOKEN).trim()
      : '';
  const fromProcess = process.env.N8N_INGEST_TOKEN
    ? String(process.env.N8N_INGEST_TOKEN).trim()
    : '';
  const token = fromVars || fromEnv || fromProcess;
  if (!token) {
    throw new Error(
      'N8N_INGEST_TOKEN is not set. Add it as an n8n Variable ($vars.N8N_INGEST_TOKEN, Settings -> Variables).',
    );
  }
  return token;
}

async function classifyViaApp({ team_id, workspace_id, message, customer_name, channel }) {
  const url = `${getAppUrl()}/api/internal/n8n/ai/classify`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getIngestToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ team_id, workspace_id, message, customer_name, channel }),
  });
  const raw = await res.text();
  if (res.status === 503) {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      body = { error: raw };
    }
    if (body && body.code === 'ai_not_configured') {
      return { ai_not_configured: true };
    }
  }
  if (!res.ok) {
    throw new Error(`Classify endpoint error ${res.status}: ${raw.slice(0, 800)}`);
  }
  const data = JSON.parse(raw);
  return { classification: data.classification, model: data.model };
}

const items = $input.all();
const out = [];

for (const item of items) {
  const j = item.json || {};
  const message = j.message ?? j.original_message ?? j.text;

  try {
    const result = await classifyViaApp({
      team_id: j.team_id || (j._tenant && j._tenant.team_id),
      workspace_id: j.workspace_id || (j._tenant && j._tenant.workspace_id) || null,
      message,
      customer_name: j.customer_name,
      channel: j.channel,
    });

    if (result.ai_not_configured) {
      out.push({
        json: {
          ...j,
          classification_failed: true,
          ai_not_configured: true,
        },
      });
      continue;
    }

    out.push({
      json: {
        ...j,
        classification_result: result.classification,
        ...result.classification,
      },
    });
  } catch (error) {
    out.push({
      json: {
        ...j,
        classification_failed: true,
        error: error.message,
      },
    });
  }
}

return out;
