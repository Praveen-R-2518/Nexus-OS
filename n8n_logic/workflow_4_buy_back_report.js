/**
 * Nexus OS — Workflow 4/5: Daily Buy-Back Report (n8n Code node)
 *
 * Paste into an n8n **Code** node (Run once for all items).
 *
 * Centralized AI: this node no longer calls OpenAI directly. It POSTs to the Next.js app's
 * `/api/internal/n8n/ai/report-summary` endpoint, which holds the single `OPENAI_API_KEY` and
 * runs `lib/ai/report-summary.ts` (loads `ai_prompts/buy_back_report_prompt.txt` server-side
 * in `style: "markdown"` mode). Unlike classify/draft, this endpoint never 503s — when
 * OPENAI_API_KEY is unset (or the live call fails) it returns a labelled
 * `{ summary, source: "fallback" }` instead of failing the report.
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
 *   - team_id / _tenant.team_id, workspace_id / _tenant.workspace_id (optional, for ai_usage)
 *
 * Output JSON: { markdown_report: string, report_source: 'openai'|'fallback' }
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

async function reportSummaryViaApp({ team_id, workspace_id, stats, style }) {
  const url = `${getAppUrl()}/api/internal/n8n/ai/report-summary`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getIngestToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ team_id, workspace_id, stats, style }),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Report-summary endpoint error ${res.status}: ${raw.slice(0, 800)}`);
  }
  return JSON.parse(raw);
}

const items = $input.all();
const out = [];

for (const item of items) {
  const j = item.json || {};
  const metrics = pickMetrics(j);
  const teamId = j.team_id || (j._tenant && j._tenant.team_id) || undefined;
  const workspaceId = j.workspace_id || (j._tenant && j._tenant.workspace_id) || undefined;

  const { summary, source } = await reportSummaryViaApp({
    team_id: teamId,
    workspace_id: workspaceId,
    stats: metrics,
    style: 'markdown',
  });

  out.push({
    json: {
      ...j,
      markdown_report: summary,
      report_source: source,
    },
  });
}

return out;
