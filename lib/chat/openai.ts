import "server-only";

import OpenAI from "openai";

/**
 * Server-only OpenAI wrapper for the Revenue Analyst. Isolated behind one function so the chat
 * route can be smoke-tested with a fake (no live API calls) — mirror the module-interception
 * pattern in scripts/*.test.ts. Uses the existing `openai` dependency and GPT-4o (no fine-tuning).
 */

export type ChatTurn = { role: "user" | "assistant"; content: string };

const DEFAULT_MODEL = "gpt-4o";

/**
 * Stream the analyst reply as text deltas. Yields nothing but the assistant's content chunks.
 * Throws if OPENAI_API_KEY is unset (the route surfaces this as a 503).
 */
export async function* streamAnalystReply(params: {
  system: string;
  history: ChatTurn[];
}): AsyncGenerator<string, void, unknown> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  const client = new OpenAI({ apiKey });

  const stream = await client.chat.completions.create({
    model,
    temperature: 0.3,
    stream: true,
    messages: [{ role: "system", content: params.system }, ...params.history],
  });

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}
