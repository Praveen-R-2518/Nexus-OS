import "server-only";

import { AI_MODELS, AiNotConfiguredError, getOpenAiClient, isMockMode } from "@/lib/ai/provider";
import {
  executePeopleProposeTool,
  isPeopleProposeToolName,
  PEOPLE_PROPOSE_TOOLS,
  type PeopleProposeContext,
} from "@/lib/chat/people-propose";
import {
  executePeopleReadTool,
  isPeopleReadToolName,
  PEOPLE_READ_TOOLS,
} from "@/lib/chat/people-tools";
import { toolsForLane, type ChatLane } from "@/lib/chat/route-lane";

/**
 * Server-only chat wrapper for the Revenue Analyst. Thin wrapper over `lib/ai/provider` — the
 * OpenAI client and model name are centralized there; this file just shapes the streaming /
 * one-shot call surfaces the chat route and persona "Enhance" endpoint already depend on.
 * Throws `AiNotConfiguredError` when OPENAI_API_KEY is unset (routes surface this as a 503).
 */

export type ChatTurn = { role: "user" | "assistant"; content: string };

const MAX_PEOPLE_TOOL_ROUNDS = 2;

type OpenAiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type ToolCallAcc = { id: string; name: string; args: string };

type LoopMessage =
  | { role: "system"; content: string }
  | ChatTurn
  | { role: "assistant"; content: string | null; tool_calls: OpenAiToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

function resolveModel(): string {
  return process.env.OPENAI_MODEL?.trim() || AI_MODELS.CHAT;
}

function ingestToolDelta(
  acc: Map<number, ToolCallAcc>,
  parts: Array<{
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>,
): void {
  for (const part of parts) {
    const index = typeof part.index === "number" ? part.index : 0;
    const cur = acc.get(index) ?? { id: "", name: "", args: "" };
    if (part.id) cur.id = part.id;
    if (part.function?.name) cur.name += part.function.name;
    if (part.function?.arguments) cur.args += part.function.arguments;
    acc.set(index, cur);
  }
}

function finalizedToolCalls(acc: Map<number, ToolCallAcc>): OpenAiToolCall[] {
  return [...acc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, call]) => ({
      id: call.id,
      type: "function" as const,
      function: { name: call.name, arguments: call.args },
    }))
    .filter((call) => call.id.length > 0 && call.function.name.length > 0);
}

async function runPeopleChatTool(
  name: string,
  rawArgs: unknown,
  ctx: PeopleProposeContext,
): Promise<string> {
  if (isPeopleReadToolName(name)) {
    return executePeopleReadTool(name, rawArgs, ctx);
  }
  if (isPeopleProposeToolName(name)) {
    return executePeopleProposeTool(name, rawArgs, ctx);
  }
  return JSON.stringify({ error: "Unknown tool" });
}

type StreamDelta = {
  content?: string | null;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
};

type StreamChunk = {
  choices?: Array<{ delta?: StreamDelta }>;
};

async function* streamChunks(
  stream: AsyncIterable<StreamChunk>,
  withTools: boolean,
): AsyncGenerator<string, OpenAiToolCall[]> {
  const acc = new Map<number, ToolCallAcc>();
  let sawTools = false;

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) continue;
    if (withTools && delta.tool_calls && delta.tool_calls.length > 0) {
      sawTools = true;
      ingestToolDelta(acc, delta.tool_calls);
      continue;
    }
    if (delta.content && !sawTools) {
      yield delta.content;
    }
  }

  if (!sawTools) return [];
  return finalizedToolCalls(acc);
}

function openaiToolsForLane(lane: ChatLane) {
  const allowed = new Set(toolsForLane(lane));
  if (allowed.size === 0) return [];
  return [...PEOPLE_READ_TOOLS, ...PEOPLE_PROPOSE_TOOLS].filter((tool) =>
    allowed.has(tool.function.name),
  );
}

/**
 * Stream the analyst reply as text deltas. Yields nothing but the assistant's content chunks.
 * When `peopleTools` is set, the lane is people/mixed, and not mock mode, runs up to two
 * People tool rounds (G2 reads + G3 propose-only) before streaming the final answer.
 * Revenue and smalltalk lanes skip the tool loop (I1).
 */
export async function* streamAnalystReply(params: {
  system: string;
  history: ChatTurn[];
  peopleTools?: PeopleProposeContext;
  lane?: ChatLane;
}): AsyncGenerator<string, void, unknown> {
  if (isMockMode()) {
    yield "This is a mock analyst reply used for CI/tests.";
    return;
  }

  const client = getOpenAiClient();
  if (!client) throw new AiNotConfiguredError();
  const model = resolveModel();
  const messages: LoopMessage[] = [
    { role: "system", content: params.system },
    ...params.history,
  ];
  const lane: ChatLane = params.lane ?? "mixed";
  const tools = openaiToolsForLane(lane);

  if (params.peopleTools && tools.length > 0) {
    const peopleTools = params.peopleTools;
    for (let round = 0; round < MAX_PEOPLE_TOOL_ROUNDS; round += 1) {
      const stream = await client.chat.completions.create({
        model,
        temperature: 0.3,
        stream: true,
        tools,
        messages: messages as never,
      });
      const toolCalls = yield* streamChunks(stream, true);
      if (toolCalls.length === 0) return;

      messages.push({
        role: "assistant",
        content: null,
        tool_calls: toolCalls,
      });
      for (const call of toolCalls) {
        const content = await runPeopleChatTool(
          call.function.name,
          call.function.arguments,
          peopleTools,
        );
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content,
        });
      }
    }
  }

  const finalStream = await client.chat.completions.create({
    model,
    temperature: 0.3,
    stream: true,
    messages: messages as never,
  });
  yield* streamChunks(finalStream, false);
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
