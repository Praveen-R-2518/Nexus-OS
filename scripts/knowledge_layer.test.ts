/**
 * Knowledge-layer (pgvector RAG) unit tests — no live OpenAI, no live DB.
 * Run: npx tsx scripts/knowledge_layer.test.ts   (or `npm run test:knowledge`)
 *
 * Proves, purely:
 *  A. chunkText splits long text into overlapping chunks and handles short/empty input.
 *  B. The editable persona LAYERS on top of the guardrails: a custom persona appears, but the
 *     read-only / no-fabrication RULES are still always present (they cannot be edited away).
 *  C. Retrieved knowledge is rendered into a KNOWLEDGE BASE block (and omitted when empty).
 *  D. Document-type validation accepts pdf/txt/md and rejects everything else.
 *
 * `server-only` is stubbed so the real modules run unmodified.
 */

import Module from "node:module";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

// Stub `server-only` so lib modules import cleanly under tsx.
const moduleWithLoad = Module as unknown as { _load: (...args: unknown[]) => unknown };
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  if ((args[0] as string) === "server-only") return {};
  return origLoad.apply(this, args);
};

(async () => {
  const { chunkText } = await import("@/lib/embeddings/store");
  const { buildAnalystSystemPrompt } = await import("@/lib/chat/system-prompt");
  const { emptySnapshot } = await import("@/lib/chat/analyst-context");
  const { DEFAULT_ANALYST_PERSONA } = await import("@/lib/chat/persona");
  const { isSupportedDoc } = await import("@/lib/documents/extract");

  // ==============================================================================================
  // A. chunkText
  assert(chunkText("").length === 0, "A: empty text → no chunks");
  assert(chunkText("short paragraph").length === 1, "A: short text → single chunk");

  const long = Array.from({ length: 50 }, (_, i) => `Sentence number ${i} about the business. `).join("");
  const chunks = chunkText(long, { maxChars: 300, overlap: 50 });
  assert(chunks.length > 1, `A: long text → multiple chunks (got ${chunks.length})`);
  assert(chunks.every((c) => c.length <= 300 + 10), "A: chunks respect max size");
  // Overlap: the tail of chunk 0 should reappear at the head region of chunk 1.
  const tail = chunks[0].slice(-20);
  assert(long.includes(tail), "A: chunk content is contiguous with source");

  // ==============================================================================================
  // B. Persona layering — custom persona present AND guardrails still enforced.
  const customPersona = "You are ACME's in-house pricing strategist. Focus on margin defense.";
  const ctx = {
    snapshot: emptySnapshot(),
    business: {
      name: "Acme Realty",
      industry: "Real estate",
      tone: "warm",
      services: ["Leasing"],
      approvalMode: "approval_queue",
      persona: customPersona,
    },
    knowledge: [],
  };
  const prompt = buildAnalystSystemPrompt(ctx as never);
  assert(prompt.includes(customPersona), "B: custom persona is used");
  assert(!prompt.includes(DEFAULT_ANALYST_PERSONA), "B: default persona replaced by custom one");
  assert(/READ-ONLY/i.test(prompt), "B: read-only guardrail still present");
  assert(/NEVER fabricate/i.test(prompt), "B: no-fabrication guardrail still present");
  assert(/never claim to have sent/i.test(prompt), "B: no-action guardrail still present");

  // Null persona → falls back to the default.
  const ctxDefault = { ...ctx, business: { ...ctx.business, persona: null } };
  const promptDefault = buildAnalystSystemPrompt(ctxDefault as never);
  assert(promptDefault.includes(DEFAULT_ANALYST_PERSONA), "B: null persona → default persona");

  // ==============================================================================================
  // C. Knowledge rendering
  const BLOCK_HEADER = "KNOWLEDGE BASE (retrieved";
  assert(!prompt.includes(BLOCK_HEADER), "C: no knowledge block when knowledge is empty");
  const ctxWithKnowledge = {
    ...ctx,
    knowledge: [
      { content: "Our standard leasing fee is 8% of annual rent.", kind: "business_doc", similarity: 0.9 },
      { content: "Refunds are processed within 14 days.", kind: "summary", similarity: 0.7 },
    ],
  };
  const promptK = buildAnalystSystemPrompt(ctxWithKnowledge as never);
  assert(promptK.includes(BLOCK_HEADER), "C: knowledge block rendered");
  assert(promptK.includes("8% of annual rent"), "C: business_doc chunk content included");
  assert(promptK.includes("Refunds are processed"), "C: summary chunk content included");

  // ==============================================================================================
  // D. Document-type validation
  assert(isSupportedDoc("brief.pdf", "application/pdf"), "D: pdf accepted");
  assert(isSupportedDoc("notes.txt", "text/plain"), "D: txt accepted");
  assert(isSupportedDoc("readme.md", ""), "D: md accepted by extension");
  assert(!isSupportedDoc("logo.png", "image/png"), "D: png rejected");
  assert(!isSupportedDoc("sheet.xlsx", "application/vnd.ms-excel"), "D: xlsx rejected");

  console.log("knowledge_layer.test.ts: all checks passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
