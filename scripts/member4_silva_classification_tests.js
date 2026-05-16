/**
 * Member 4 — Silva & Co. LKR classification: run 5 Playground-equivalent checks against OpenAI.
 *
 * Usage (from repo root):
 *   set NEXUS_CLASSIFICATION_PROMPT_FILE=classification_prompt_silva_lkr.txt
 *   set OPENAI_MODEL=gpt-4o
 *   node scripts/member4_silva_classification_tests.js
 *
 * Loads OPENAI_API_KEY from process.env or .env.local (same parser as smoke_classification_openai.js).
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

function parseJsonObjectOrThrow(rawContent) {
  const s = String(rawContent).trim();
  if (!s) throw new Error('Empty model content');
  return JSON.parse(s);
}

const PROMPT_FILE =
  process.env.NEXUS_CLASSIFICATION_PROMPT_FILE || 'classification_prompt_silva_lkr.txt';

const TESTS = [
  {
    id: 1,
    name: 'pricing_request + high urgency',
    message: `Hi, I need a quote for building an ecommerce website for our boutique hotel in Colombo. We want online booking and a gallery. What are your packages and pricing?`,
    checks: [
      { label: 'intent', fn: (o) => o.intent === 'pricing_request' },
      { label: 'urgency high', fn: (o) => o.urgency === 'high' },
      { label: 'confidence > 0.9', fn: (o) => typeof o.confidence === 'number' && o.confidence > 0.9 },
      {
        label: 'estimated_value ~ ecommerce (300k–400k LKR)',
        fn: (o) =>
          typeof o.estimated_value === 'number' &&
          o.estimated_value >= 300000 &&
          o.estimated_value <= 400000,
      },
    ],
  },
  {
    id: 2,
    name: 'booking_request',
    message: `Can we schedule a call next Tuesday to discuss our mobile app needs? We want something similar to Uber Eats but for restaurant deliveries.`,
    checks: [
      { label: 'intent', fn: (o) => o.intent === 'booking_request' },
      { label: 'urgency high', fn: (o) => o.urgency === 'high' },
      {
        label: 'confidence > 0.85',
        fn: (o) => typeof o.confidence === 'number' && o.confidence > 0.85,
      },
    ],
  },
  {
    id: 3,
    name: 'proposal_followup',
    message: `Hi, we sent you a proposal 3 days ago for the website redesign. Have you had a chance to review it? We're eager to get started.`,
    checks: [
      { label: 'intent', fn: (o) => o.intent === 'proposal_followup' },
      { label: 'urgency medium', fn: (o) => o.urgency === 'medium' },
      {
        label: 'confidence > 0.8',
        fn: (o) => typeof o.confidence === 'number' && o.confidence > 0.8,
      },
    ],
  },
  {
    id: 4,
    name: 'complaint + churn_risk',
    message: `We're very frustrated. The website you built is down again. This is the third time this month. We need this fixed immediately. We're considering switching vendors if this doesn't get resolved today.`,
    checks: [
      { label: 'intent complaint', fn: (o) => o.intent === 'complaint' },
      { label: 'urgency high', fn: (o) => o.urgency === 'high' },
      { label: 'risk_type churn_risk', fn: (o) => o.risk_type === 'churn_risk' },
      {
        label: 'risk_score > 0.8',
        fn: (o) => typeof o.risk_score === 'number' && o.risk_score > 0.8,
      },
      {
        label: 'confidence > 0.9',
        fn: (o) => typeof o.confidence === 'number' && o.confidence > 0.9,
      },
    ],
  },
  {
    id: 5,
    name: 'support low urgency',
    message: `How do I update the images on our website? I can't find where to do it in the CMS.`,
    checks: [
      { label: 'intent support', fn: (o) => o.intent === 'support' },
      { label: 'urgency low', fn: (o) => o.urgency === 'low' },
      {
        label: 'confidence > 0.75',
        fn: (o) => typeof o.confidence === 'number' && o.confidence > 0.75,
      },
    ],
  },
];

async function classifyOne(system, userMessage, model) {
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
  return parseJsonObjectOrThrow(text);
}

async function main() {
  loadEnvLocal();
  const promptPath = path.join(__dirname, '..', 'ai_prompts', PROMPT_FILE);
  if (!fs.existsSync(promptPath)) {
    console.error('Missing prompt:', promptPath);
    process.exit(1);
  }
  const system = fs.readFileSync(promptPath, 'utf8');
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o';

  console.log('Member 4 — Silva LKR classification tests');
  console.log('Model:', model);
  console.log('Prompt:', PROMPT_FILE);
  console.log('');

  let passed = 0;
  for (const t of TESTS) {
    let obj;
    try {
      obj = await classifyOne(system, t.message, model);
    } catch (e) {
      console.log(`Test ${t.id} FAIL (${t.name}): ${e.message}`);
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

    if (failures.length === 0) {
      passed += 1;
      console.log(`Test ${t.id} PASS — ${t.name}`);
      console.log(JSON.stringify(obj, null, 2));
    } else {
      console.log(`Test ${t.id} FAIL — ${t.name}`);
      console.log('Failed checks:', failures.join(', '));
      console.log('Output:', JSON.stringify(obj, null, 2));
    }
    console.log('');
  }

  console.log(`Summary: ${passed}/${TESTS.length} tests passed`);
  if (passed < TESTS.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
