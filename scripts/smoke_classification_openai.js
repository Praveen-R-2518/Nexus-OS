/**
 * One-off smoke test: classification prompt + OpenAI json_object mode.
 * Loads OPENAI_API_KEY from process.env or .env.local (repo root). Does not print the key.
 * Optional: NEXUS_CLASSIFICATION_PROMPT_FILE (default classification_prompt.txt).
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

async function main() {
  loadEnvLocal();
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    console.error(
      'Set OPENAI_API_KEY in .env.local or the environment, then re-run.',
    );
    process.exit(1);
  }

  const name =
    process.env.NEXUS_CLASSIFICATION_PROMPT_FILE?.trim() ||
    'classification_prompt.txt';
  const promptPath = path.join(__dirname, '..', 'ai_prompts', name);
  const system = fs.readFileSync(promptPath, 'utf8');
  const userMessage =
    process.argv[2] ||
    'Hi, I need pricing for a website for our hotel';

  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';

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
        {
          role: 'user',
          content: userMessage,
        },
      ],
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    console.error('OpenAI error:', res.status, raw.slice(0, 500));
    process.exit(1);
  }
  const data = JSON.parse(raw);
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    console.error('No content in response');
    process.exit(1);
  }
  console.log(text);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
