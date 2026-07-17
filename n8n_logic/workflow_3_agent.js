/**
 * Nexus OS — Workflow 3: Reply generation / agent (n8n Code node)
 *
 * Paste into an n8n **Code** node (Run once for all items).
 *
 * Centralized AI: this node no longer calls OpenAI directly. It POSTs to the Next.js app's
 * `/api/internal/n8n/ai/draft` endpoint, which holds the single `OPENAI_API_KEY`, runs
 * `lib/ai/draft.ts` (loads `ai_prompts/reply_generation_prompt.txt` server-side), and retrieves
 * "similar past context" from pgvector itself — n8n no longer needs a separate call to
 * `/api/internal/n8n/match-embeddings` before drafting.
 *
 * Expected input JSON (per item):
 *   - customer_name
 *   - channel
 *   - original_message  (or `message` as fallback)
 *   - classification_result  (object from workflow 2, or JSON string)
 *   - team_id / _tenant.team_id, workspace_id / _tenant.workspace_id
 *
 * Output JSON: reply_text, draft_text, approval_required, approval_reason, tone, next_step,
 * follow_up_needed, follow_up_delay_minutes
 *
 * Env: NEXUS_APP_URL, N8N_INGEST_TOKEN as n8n Variables ($vars.*) — n8n Cloud blocks $env in
 * node expressions (N8N_BLOCK_ENV_ACCESS_IN_NODE); never hard-code either value in this file.
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

async function draftViaApp({ team_id, workspace_id, original_message, classification, customer_name, channel }) {
  const url = `${getAppUrl()}/api/internal/n8n/ai/draft`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getIngestToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      team_id,
      workspace_id,
      original_message,
      classification,
      customer_name,
      channel,
    }),
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
    throw new Error(`Draft endpoint error ${res.status}: ${raw.slice(0, 800)}`);
  }
  return JSON.parse(raw);
}

const items = $input.all();
const out = [];

for (const item of items) {
  const j = item.json || {};
  const teamId = j.team_id || (j._tenant && j._tenant.team_id) || '';
  const workspaceId = j.workspace_id || (j._tenant && j._tenant.workspace_id) || null;
  const originalMessage = j.original_message ?? j.message ?? j.text;

  try {
    const result = await draftViaApp({
      team_id: teamId,
      workspace_id: workspaceId,
      original_message: originalMessage,
      classification: normalizeClassification(j.classification_result ?? j.classification),
      customer_name: j.customer_name,
      channel: j.channel,
    });

    if (result.ai_not_configured) {
      out.push({ json: { ...j, draft_failed: true, ai_not_configured: true } });
      continue;
    }

    out.push({
      json: {
        ...j,
        reply_draft: result,
        draft_text: result.draft_text,
        ...result,
      },
    });
  } catch (error) {
    out.push({ json: { ...j, draft_failed: true, error: error.message } });
  }
}

return out;
