/**
 * Member 4 — Nexus classification (classification_prompt.txt): five scenario checks via OpenAI.
 *
 * From repo root:
 *   node scripts/member4_classification_tests.js
 *
 * Uses OPENAI_API_KEY from .env.local or environment (see smoke_classification_openai.js).
 * Optional: OPENAI_MODEL (default gpt-4o-mini)
 */

const fs = require('fs');
const path = require('path');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  let text = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
  text = text.replace(/\r\n/g, '\n');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    const existing = process.env[k];
    const missing =
      existing === undefined ||
      existing === '' ||
      String(existing).trim() === '';
    if (missing) process.env[k] = v;
  }
}

async function classify(system, userMessage, model) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY is not set');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
        { role: 'user', content: userMessage },
      ],
    }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${raw.slice(0, 600)}`);
  const data = JSON.parse(raw);
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty model content');
  return JSON.parse(text);
}

const TESTS = [
  {
    id: 1,
    name: 'pricing / quote request',
    message: `Hi, I need a quote for building an ecommerce website for our boutique hotel in Colombo. We want online booking and a gallery. What are your packages and pricing?`,
    checks: [
      {
        label: 'intent_type pricing_question or new_lead',
        fn: (o) =>
          o.intent_type === 'pricing_question' || o.intent_type === 'new_lead',
      },
      {
        label: 'urgency medium or high',
        fn: (o) => o.urgency === 'medium' || o.urgency === 'high',
      },
      {
        label: 'confidence > 0.8',
        fn: (o) => typeof o.confidence === 'number' && o.confidence > 0.8,
      },
      {
        label: 'lead_score shows commercial intent (>= 55)',
        fn: (o) => typeof o.lead_score === 'number' && o.lead_score >= 55,
      },
    ],
  },
  {
    id: 2,
    name: 'booking / schedule call',
    message: `Can we schedule a call next Tuesday to discuss our mobile app needs? We want something similar to Uber Eats but for restaurant deliveries.`,
    checks: [
      { label: 'intent_type booking_request', fn: (o) => o.intent_type === 'booking_request' },
      {
        label: 'urgency medium or high',
        fn: (o) => o.urgency === 'medium' || o.urgency === 'high',
      },
      {
        label: 'confidence > 0.8',
        fn: (o) => typeof o.confidence === 'number' && o.confidence > 0.8,
      },
    ],
  },
  {
    id: 3,
    name: 'proposal follow-up',
    message: `Hi, we sent you a proposal 3 days ago for the website redesign. Have you had a chance to review it? We're eager to get started.`,
    checks: [
      { label: 'intent_type follow_up', fn: (o) => o.intent_type === 'follow_up' },
      {
        label: 'urgency medium (or high)',
        fn: (o) => o.urgency === 'medium' || o.urgency === 'high',
      },
      {
        label: 'confidence > 0.75',
        fn: (o) => typeof o.confidence === 'number' && o.confidence > 0.75,
      },
    ],
  },
  {
    id: 4,
    name: 'complaint / churn tone',
    message: `We're very frustrated. The website you built is down again. This is the third time this month. We need this fixed immediately. We're considering switching vendors if this doesn't get resolved today.`,
    checks: [
      {
        label: 'intent_type complaint or churn_risk',
        fn: (o) => o.intent_type === 'complaint' || o.intent_type === 'churn_risk',
      },
      {
        label: 'urgency high or critical',
        fn: (o) => o.urgency === 'high' || o.urgency === 'critical',
      },
      {
        label: 'revenue_risk high or critical',
        fn: (o) => o.revenue_risk === 'high' || o.revenue_risk === 'critical',
      },
      {
        label: 'confidence > 0.8',
        fn: (o) => typeof o.confidence === 'number' && o.confidence > 0.8,
      },
    ],
  },
  {
    id: 5,
    name: 'support / CMS how-to',
    message: `How do I update the images on our website? I can't find where to do it in the CMS.`,
    checks: [
      { label: 'intent_type support_issue', fn: (o) => o.intent_type === 'support_issue' },
      { label: 'urgency low', fn: (o) => o.urgency === 'low' },
      {
        label: 'confidence > 0.75',
        fn: (o) => typeof o.confidence === 'number' && o.confidence > 0.75,
      },
    ],
  },
];

async function main() {
  loadEnvLocal();
  const writeDoc = process.argv.includes('--write-doc');
  const promptPath = path.join(__dirname, '..', 'ai_prompts', 'classification_prompt.txt');
  if (!fs.existsSync(promptPath)) throw new Error('Missing ' + promptPath);
  const system = fs.readFileSync(promptPath, 'utf8');
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';

  console.log('Nexus OS — classification_prompt.txt (5 scenarios)');
  console.log('Model:', model);
  if (writeDoc) console.log('Will write docs/classification_test_results_v1.md (--write-doc)');
  console.log('');

  let passed = 0;
  /** @type {{ id: number; name: string; message: string; pass: boolean; failures: string[]; obj: object | null; error?: string }[]} */
  const records = [];

  for (const t of TESTS) {
    let obj = null;
    let errorMsg = '';
    try {
      obj = await classify(system, t.message, model);
    } catch (e) {
      errorMsg = e.message || String(e);
      console.log(`Test ${t.id} ERROR (${t.name}): ${errorMsg}`);
      console.log('');
      records.push({
        id: t.id,
        name: t.name,
        message: t.message,
        pass: false,
        failures: [],
        obj: null,
        error: errorMsg,
      });
      continue;
    }

    const failures = [];
    for (const c of t.checks) {
      try {
        if (!c.fn(obj)) failures.push(c.label);
      } catch {
        failures.push(c.label);
      }
    }

    const ok = failures.length === 0;
    if (ok) {
      passed += 1;
      console.log(`Test ${t.id} PASS — ${t.name}`);
    } else {
      console.log(`Test ${t.id} FAIL — ${t.name}`);
      console.log('Failed:', failures.join('; '));
    }
    console.log(JSON.stringify(obj, null, 2));
    console.log('');
    records.push({
      id: t.id,
      name: t.name,
      message: t.message,
      pass: ok,
      failures,
      obj,
    });
  }

  console.log(`Summary: ${passed}/${TESTS.length} passed`);

  if (writeDoc) {
    const docPath = path.join(__dirname, '..', 'docs', 'classification_test_results_v1.md');
    const date = new Date().toISOString().slice(0, 10);
    const lines = [
      '# Test Results — Classification Prompt v1',
      '',
      `**Date:** ${date}`,
      `**Model:** ${model}`,
      '**Prompt file:** `ai_prompts/classification_prompt.txt` (Nexus OS schema)',
      '',
      '## How this was run',
      '',
      '```powershell',
      'cd "c:\\New CURSOR BUILDATHON\\Nexus-OS"',
      '$env:OPENAI_MODEL = "gpt-4o"   # optional',
      'node scripts/member4_classification_tests.js --write-doc',
      '```',
      '',
      '---',
      '',
    ];

    for (const r of records) {
      lines.push(`## Test ${r.id} — ${r.name}`);
      lines.push('');
      lines.push('**Input:**');
      lines.push('');
      lines.push('```');
      lines.push(r.message);
      lines.push('```');
      lines.push('');
      lines.push('**Actual output:**');
      lines.push('');
      lines.push('```json');
      if (r.error) {
        lines.push(`/* ERROR: ${r.error} */`);
      } else if (r.obj) {
        lines.push(JSON.stringify(r.obj, null, 2));
      } else {
        lines.push('{}');
      }
      lines.push('```');
      lines.push('');
      const st = r.error ? 'ERROR' : r.pass ? 'PASS' : 'FAIL';
      lines.push(`**Status:** ${st}${r.failures.length ? ` — failed checks: ${r.failures.join('; ')}` : ''}`);
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    lines.push('## Summary');
    lines.push('');
    lines.push('| Test | Topic | Status |');
    lines.push('|------|--------|--------|');
    const topics = [
      'Pricing / quote',
      'Booking call',
      'Proposal follow-up',
      'Complaint / churn',
      'CMS support',
    ];
    records.forEach((r, i) => {
      const st = r.error ? 'ERROR' : r.pass ? 'PASS' : 'FAIL';
      lines.push(`| ${r.id} | ${topics[i] || r.name} | ${st} |`);
    });
    lines.push('');
    lines.push(`**Final:** ${passed}/${TESTS.length} PASS`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Handoff (Member 2)');
    lines.push('');
    lines.push('When all five are PASS:');
    lines.push('');
    lines.push('> Classification prompt (`classification_prompt.txt`) is validated. Ready for WF2 / n8n OpenAI node (Nexus OS JSON schema).');
    lines.push('');

    fs.writeFileSync(docPath, lines.join('\n'), 'utf8');
    console.log(`Wrote ${docPath}`);
  }

  if (passed < TESTS.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
