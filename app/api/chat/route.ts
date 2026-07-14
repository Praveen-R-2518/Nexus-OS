import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiTenantContext,
} from "@/lib/api-security";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAnalystContext } from "@/lib/chat/analyst-context";
import { buildAnalystSystemPrompt } from "@/lib/chat/system-prompt";
import { completeText, streamAnalystReply, type ChatTurn } from "@/lib/chat/openai";
import { upsertSummaryEmbedding } from "@/lib/embeddings/store";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LEN = 4000;
const HISTORY_TURNS = 10; // last N stored turns injected for continuity (cost-aware)

type MessageRow = { role?: string | null; content?: string | null };

function sessionTitle(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  return clean.length <= 60 ? clean : `${clean.slice(0, 60).trimEnd()}…`;
}

/**
 * Refresh the single rolling summary embedding for a chat session (best-effort). Generates a
 * short summary of the recent turns via one cheap completion, then upserts it as kind='summary'.
 * Any failure (no key, model error, RPC missing) is swallowed — this must never affect the reply.
 */
async function summarizeSession(params: {
  supabase: SupabaseClient;
  teamId: string;
  workspaceId: string | null;
  sessionId: string;
  history: ChatTurn[];
  reply: string;
}): Promise<void> {
  const { supabase, teamId, workspaceId, sessionId, history, reply } = params;
  try {
    const transcript = [...history, { role: "assistant" as const, content: reply }]
      .map((t) => `${t.role === "user" ? "Founder" : "Analyst"}: ${t.content}`)
      .join("\n")
      .slice(0, 6000);

    const summary = await completeText({
      system:
        "Summarize this conversation between a founder and their revenue analyst in 1-2 sentences. Capture the topics, entities, and decisions so it can be retrieved later. Output only the summary.",
      user: transcript,
      temperature: 0.2,
      maxTokens: 160,
    });
    if (!summary) return;

    await upsertSummaryEmbedding({
      supabase,
      teamId,
      workspaceId,
      sourceId: sessionId,
      content: summary,
      metadata: { session_id: sessionId },
    });
  } catch {
    /* best-effort: swallow */
  }
}

/**
 * GET /api/chat                     → recent sessions for the tenant
 * GET /api/chat?session_id=<uuid>   → messages for one session (history for the UI)
 */
export async function GET(request: Request) {
  const limited = rateLimit(request, "api:chat:get", 60, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;
  const { supabase, teamId } = tenant;

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id")?.trim() || null;

  if (sessionId) {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("session_id", sessionId)
      .eq("team_id", teamId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) return jsonError(error.message, 500);
    return Response.json({ session_id: sessionId, messages: data ?? [] });
  }

  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, title, created_at, updated_at")
    .eq("team_id", teamId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return jsonError(error.message, 500);
  return Response.json({ sessions: data ?? [] });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "api:chat", 30, 60_000);
  if (limited) return limited;

  // The analyst needs the model; fail fast + clearly rather than mid-stream.
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return jsonError("Chat is not configured (OPENAI_API_KEY missing)", 503);
  }

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;
  const { supabase, teamId, workspaceId } = tenant;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;

  const rawMessage = parsed.body.message;
  const message =
    typeof rawMessage === "string" ? rawMessage.trim().slice(0, MAX_MESSAGE_LEN) : "";
  if (!message) {
    return jsonError("message is required", 400);
  }

  const providedSessionId =
    typeof parsed.body.session_id === "string" && parsed.body.session_id.trim()
      ? parsed.body.session_id.trim()
      : null;

  // 1. Resolve / create the session (tenant-scoped).
  let sessionId: string;
  if (providedSessionId) {
    const { data: existing, error } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("id", providedSessionId)
      .eq("team_id", teamId)
      .maybeSingle();
    if (error) return jsonError(error.message, 500);
    if (!existing || typeof (existing as { id?: unknown }).id !== "string") {
      return jsonError("Chat session not found", 404);
    }
    sessionId = (existing as { id: string }).id;
  } else {
    const { data: created, error } = await supabase
      .from("chat_sessions")
      .insert({
        team_id: teamId,
        workspace_id: workspaceId,
        title: sessionTitle(message),
      })
      .select("id")
      .single();
    if (error || !created || typeof (created as { id?: unknown }).id !== "string") {
      return jsonError(error?.message ?? "Could not start chat session", 500);
    }
    sessionId = (created as { id: string }).id;
  }

  // 2. Persist the user's message before calling the model.
  const { error: userInsertErr } = await supabase.from("chat_messages").insert({
    session_id: sessionId,
    team_id: teamId,
    workspace_id: workspaceId,
    role: "user",
    content: message,
  });
  if (userInsertErr) return jsonError(userInsertErr.message, 500);

  // 3. Load recent history (includes the message we just stored) for continuity.
  const { data: historyRows } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_TURNS);

  const history: ChatTurn[] = ((historyRows ?? []) as MessageRow[])
    .reverse()
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role as ChatTurn["role"], content: m.content as string }));

  if (history.length === 0) {
    history.push({ role: "user", content: message });
  }

  // 4. Build the read-only snapshot + system prompt.
  let systemPrompt: string;
  try {
    const context = await buildAnalystContext({ supabase, teamId, queryText: message });
    systemPrompt = buildAnalystSystemPrompt(context);
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Could not build analyst context",
      500,
    );
  }

  // 5. Stream the reply; accumulate + persist the assistant turn when the stream ends.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      try {
        for await (const delta of streamAnalystReply({ system: systemPrompt, history })) {
          full += delta;
          controller.enqueue(encoder.encode(delta));
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "The analyst could not respond.";
        // Surface the failure inline so the UI shows something rather than a silent cut-off.
        controller.enqueue(encoder.encode(`\n\n[error] ${msg}`));
      } finally {
        const content = full.trim();
        if (content) {
          await supabase.from("chat_messages").insert({
            session_id: sessionId,
            team_id: teamId,
            workspace_id: workspaceId,
            role: "assistant",
            content,
          });
          // Touch the session so recent-order stays fresh (trigger also refreshes updated_at).
          await supabase
            .from("chat_sessions")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", sessionId)
            .eq("team_id", teamId);
        }
        controller.close();

        // Best-effort rolling summary embedding for this session (kind='summary'), so future
        // chats can retrieve what was discussed. Runs after close() — never blocks the reply,
        // and any failure is swallowed by upsertSummaryEmbedding.
        if (content) {
          void summarizeSession({
            supabase,
            teamId,
            workspaceId,
            sessionId,
            history,
            reply: content,
          });
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-session-id": sessionId,
    },
  });
}
