/**
 * Live OpenAI smoke test — proves the centralized provider can actually reach OpenAI with the
 * configured `OPENAI_API_KEY`. Run: npx tsx scripts/openai_smoke.test.ts (or `npm run
 * test:openai-smoke`).
 *
 * Skips (exit 0) when no real key is configured, so this is safe to leave in CI: it never
 * fails a pipeline for not having a live key, but catches a genuinely broken/expired key when
 * one is present.
 */

import Module from "module";

const moduleWithLoad = Module as unknown as { _load: (...args: unknown[]) => unknown };
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  const request = args[0] as string;
  if (request === "server-only") return {};
  return origLoad.apply(this, args);
};

(async () => {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key.toLowerCase() === "mock") {
    console.log("skipped: OPENAI_API_KEY not set for live smoke");
    process.exit(0);
  }

  const { getOpenAiClient, AI_MODELS } = await import("@/lib/ai/provider");
  const client = getOpenAiClient();
  if (!client) {
    console.log("skipped: OPENAI_API_KEY not set for live smoke");
    process.exit(0);
  }

  const completion = await client.chat.completions.create({
    model: AI_MODELS.CLASSIFY,
    // max_completion_tokens works on both gpt-4-family and gpt-5-family deployments (the
    // latter reject legacy max_tokens). Reasoning models burn thinking tokens from this
    // budget, so keep it comfortably above the expected one-word answer.
    max_completion_tokens: 400,
    messages: [{ role: "user", content: "Reply with the single word: ok" }],
  });

  const text = completion.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("openai_smoke: empty response from live OpenAI call");

  console.log(`openai_smoke: live call ok (model=${AI_MODELS.CLASSIFY}, response="${text}")`);
})().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
