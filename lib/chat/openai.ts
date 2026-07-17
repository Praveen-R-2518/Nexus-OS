import "server-only";

import { AI_MODELS, AiNotConfiguredError, getOpenAiClient, isMockMode } from "@/lib/ai/provider";

/**
 * Server-only chat wrapper for the Revenue Analyst. Thin wrapper over `lib/ai/provider` — the
 * OpenAI client and model name are centralized there; this file just shapes the streaming /
 * one-shot call surfaces the chat route and persona "Enhance" endpoint already depend on.
 * Throws `AiNotConfiguredError` when OPENAI_API_KEY is unset (routes surface this as a 503).
 */

export type ChatTurn = { role: "user" | "assistant"; content: string };

function resolveModel(): string {
  return process.env.OPENAI_MODEL?.trim() || AI_MODELS.CHAT;
}

/**
 * Stream the analyst reply as text deltas. Yields nothing but the assistant's content chunks.
 */
export async function* streamAnalystReply(params: {
  system: string;
  history: ChatTurn[];
}): AsyncGenerator<string, void, unknown> {
  if (isMockMode()) {
    yield "This is a mock analyst reply used for CI/tests.";
    return;
  }

  const client = getOpenAiClient();
  if (!client) throw new AiNotConfiguredError();
  const model = resolveModel();

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

/**
 * One-shot, non-streaming completion. Used by the persona "Enhance" endpoint and the
 * best-effort chat-session summarizer.
 */
export async function completeText(params: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  if (isMockMode()) {
    return "Mock completion fixture for CI/tests.";
  }

  const client = getOpenAiClient();
  if (!client) throw new AiNotConfiguredError();
  const model = resolveModel();

  const completion = await client.chat.completions.create({
    model,
    temperature: params.temperature ?? 0.4,
    // gpt-5-family deployments reject the legacy `max_tokens`; this name works on both families.
    max_completion_tokens: params.maxTokens,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
  });

  return completion.choices?.[0]?.message?.content?.trim() ?? "";
}
