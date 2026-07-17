/**
 * Unit tests for the centralized AI provider (`lib/ai/*`) — mock mode.
 * Run: npx tsx scripts/ai_provider.test.ts  (or `npm run test:ai-provider`)
 *
 * Proves:
 *  1. isOpenAiConfigured()/isMockMode() reflect AI_PROVIDER / OPENAI_API_KEY.
 *  2. classifyMessage() returns a deterministic fixture in mock mode (no network).
 *  3. draftReply() returns a deterministic fixture in mock mode (no network).
 *  4. summarizeReport() returns a labelled `source: 'fallback'` summary when not configured,
 *     and never throws.
 *  5. AI_MODELS constants match the spec.
 */

import Module from "module";

const moduleWithLoad = Module as unknown as { _load: (...args: unknown[]) => unknown };
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  const request = args[0] as string;
  if (request === "server-only") return {};
  return origLoad.apply(this, args);
};

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

(async () => {
  // --- Mock mode (AI_PROVIDER=mock) ---
  delete process.env.OPENAI_API_KEY;
  process.env.AI_PROVIDER = "mock";
  // AI_MODELS resolves env at module load — clear every override so the defaults
  // assertion below tests the spec, not whatever the invoking shell has set.
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_MODEL;
  delete process.env.OPENAI_MODEL_CLASSIFY;
  delete process.env.OPENAI_MODEL_DRAFT;
  delete process.env.OPENAI_MODEL_REPORT;
  delete process.env.OPENAI_EMBEDDING_MODEL;
  delete process.env.OPENAI_EMBED_API_KEY;
  delete process.env.OPENAI_EMBED_BASE_URL;
  delete process.env.OPENAI_IMAGE_API_KEY;
  delete process.env.OPENAI_IMAGE_BASE_URL;

  const { isMockMode, isOpenAiConfigured, AI_MODELS } = await import("@/lib/ai/provider");
  const { classifyMessage } = await import("@/lib/ai/classify");
  const { draftReply } = await import("@/lib/ai/draft");
  const { summarizeReport } = await import("@/lib/ai/report-summary");

  await check("AI_MODELS constants match spec", () => {
    assert(AI_MODELS.CLASSIFY === "gpt-4o-mini", "CLASSIFY");
    assert(AI_MODELS.DRAFT === "gpt-4o", "DRAFT");
    assert(AI_MODELS.REPORT === "gpt-4o-mini", "REPORT");
    assert(AI_MODELS.CHAT === "gpt-4o", "CHAT");
    assert(AI_MODELS.EMBED === "text-embedding-3-small", "EMBED");
    assert(AI_MODELS.CAPTION === "gpt-4o-mini", "CAPTION");
    assert(AI_MODELS.IMAGE === "dall-e-3", "IMAGE");
  });

  await check("mock mode reports configured + mock", () => {
    assert(isMockMode() === true, "isMockMode true");
    assert(isOpenAiConfigured() === true, "isOpenAiConfigured true under mock");
  });

  await check("classifyMessage returns deterministic fixture in mock mode", async () => {
    const { classification, source, model } = await classifyMessage({
      message: "Hi, how much for a website?",
      teamId: "11111111-2222-3333-4444-555555555555",
    });
    assert(source === "mock", `source mock, got ${source}`);
    assert(model === "gpt-4o-mini", `model gpt-4o-mini, got ${model}`);
    assert(typeof classification.intent_type === "string", "has intent_type");
    assert(typeof classification.confidence === "number", "has confidence");
  });

  await check("draftReply returns deterministic fixture in mock mode", async () => {
    const { draft, source } = await draftReply({
      originalMessage: "Can you send pricing?",
      teamId: "11111111-2222-3333-4444-555555555555",
    });
    assert(source === "mock", `source mock, got ${source}`);
    assert(draft.reply_text.length > 0, "has reply_text");
  });

  await check("summarizeReport succeeds in mock mode (source openai)", async () => {
    const { summary, source } = await summarizeReport({ stats: { total_conversations: 3 } });
    assert(source === "openai", `mock mode counts as openai success, got ${source}`);
    assert(summary.length > 0, "has summary");
  });

  // --- Not configured (no key, no mock) ---
  delete process.env.AI_PROVIDER;
  delete process.env.OPENAI_API_KEY;

  // classify/provider modules cache nothing env-dependent across calls, so re-check live.
  const { isOpenAiConfigured: isConfiguredNow } = await import("@/lib/ai/provider");

  await check("not configured when no key/mock set", () => {
    assert(isConfiguredNow() === false, "isOpenAiConfigured false");
  });

  await check("classifyMessage throws AiNotConfiguredError when not configured", async () => {
    let threw = false;
    try {
      await classifyMessage({ message: "hi", teamId: "t" });
    } catch (err) {
      threw = true;
      assert(err instanceof Error && err.name === "AiNotConfiguredError", "AiNotConfiguredError");
    }
    assert(threw, "expected a throw");
  });

  await check("summarizeReport never throws; returns labelled fallback", async () => {
    const { summary, source } = await summarizeReport({
      stats: { business_name: "Acme", total_conversations: 5, revenue_at_risk: 1200 },
    });
    assert(source === "fallback", `source fallback, got ${source}`);
    assert(summary.includes("Acme"), "fallback summary uses stats");
  });

  console.log(`\nai_provider: ${passed}/8 checks passed`);
})().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
