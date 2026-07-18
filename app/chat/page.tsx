"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, Send, MessageSquare, BookOpen, ArrowLeft, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { useTenantScope } from "@/components/tenant/TenantScope";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import { ChartBlock } from "@/components/chat/ChartBlock";
import { ChatUsageToolbar } from "@/components/chat/ChatUsageToolbar";
import { ChatSessionList, type ChatSession } from "@/components/chat/ChatSessionList";
import { parseAssistantContent } from "@/lib/chat/visuals";
import { cn } from "@/lib/utils";
import { useAiStatus } from "@/app/hooks/useAiStatus";

type ChatRole = "user" | "assistant";

/** Knowledge chunk metadata from the x-knowledge-sources response header. */
type KnowledgeSource = { n: number; kind: string; label: string; similarity?: number };

type ChatMessage = { role: ChatRole; content: string; sources?: KnowledgeSource[] };

const SOURCE_KIND_LABEL: Record<string, string> = {
  business_doc: "Document",
  summary: "Summary",
  conversation: "Inbox",
};

function decodeSourcesHeader(value: string | null): KnowledgeSource[] {
  if (!value) return [];
  try {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const parsed = JSON.parse(atob(b64)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is KnowledgeSource =>
        !!s &&
        typeof s === "object" &&
        typeof (s as KnowledgeSource).n === "number" &&
        typeof (s as KnowledgeSource).label === "string",
    );
  } catch {
    return [];
  }
}

/** Assistant message body: text + streamed nexuschart blocks + citation chips. */
function AssistantBody({ message }: { message: ChatMessage }) {
  const segments = parseAssistantContent(message.content);
  return (
    <div>
      {segments.map((seg, i) => {
        if (seg.kind === "text") {
          return (
            <span key={i} className="whitespace-pre-wrap">
              {seg.text}
            </span>
          );
        }
        if (seg.kind === "chart") return <ChartBlock key={i} spec={seg.spec} />;
        if (seg.kind === "chart-pending") {
          return (
            <span key={i} className="my-2 flex items-center gap-2 text-xs text-muted">
              <Spinner className="h-3.5 w-3.5" label="Building chart" />
              Building chart…
            </span>
          );
        }
        return (
          <pre
            key={i}
            className="my-2 overflow-x-auto rounded-lg bg-glass/60 p-2 font-mono text-xs text-muted"
          >
            {seg.raw}
          </pre>
        );
      })}
      {message.sources && message.sources.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-glass-border/60 pt-2">
          <BookOpen className="h-3.5 w-3.5 text-muted" aria-hidden />
          {message.sources.map((s) => (
            <span
              key={s.n}
              title={s.label}
              className="glass-pill inline-flex max-w-[220px] items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-muted"
            >
              <span className="font-semibold text-atmospheric-grey">[{s.n}]</span>
              <span className="truncate">
                {SOURCE_KIND_LABEL[s.kind] ?? "Source"} · {s.label}
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const SUGGESTIONS = [
  "What's at risk today?",
  "Who should I reply to first?",
  "Summarize my inbox this week",
] as const;

export default function ChatPage() {
  const tenant = useTenantScope();
  const { status: aiStatus } = useAiStatus();
  const [view, setView] = useState<"list" | "chat">("list");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await authenticatedFetch("/api/chat");
      if (!res.ok) return;
      const json = (await res.json()) as { sessions?: ChatSession[] };
      setSessions(json.sessions ?? []);
    } catch {
      /* keep the current list on a transient error */
    }
  }, []);

  // On entry, load the list of past chats. The founder picks one (or starts a new chat) —
  // we never auto-open a conversation.
  useEffect(() => {
    if (!tenant.ready) return;
    if (tenant.teamId === null) {
      setLoadingSessions(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await authenticatedFetch("/api/chat");
        if (!res.ok) throw new Error("Could not load chat sessions");
        const json = (await res.json()) as { sessions?: ChatSession[] };
        if (!cancelled) setSessions(json.sessions ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load chats");
        }
      } finally {
        if (!cancelled) setLoadingSessions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenant.ready, tenant.teamId]);

  // Open an existing chat and resume where the founder left off.
  const openSession = useCallback(async (id: string) => {
    setError(null);
    sessionIdRef.current = id;
    setMessages([]);
    setMessagesLoading(true);
    setView("chat");
    try {
      const res = await authenticatedFetch(
        `/api/chat?session_id=${encodeURIComponent(id)}`,
      );
      if (!res.ok) throw new Error("Could not load chat history");
      const json = (await res.json()) as {
        messages?: Array<{ role: string; content: string }>;
      };
      setMessages(
        (json.messages ?? [])
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as ChatRole, content: m.content })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load chat history");
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  const startNewChat = useCallback(() => {
    setError(null);
    sessionIdRef.current = null;
    setMessages([]);
    setMessagesLoading(false);
    setView("chat");
  }, []);

  const openList = useCallback(() => {
    setError(null);
    setView("list");
    void refreshSessions();
  }, [refreshSessions]);

  const deleteSession = useCallback(
    async (id: string) => {
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (sessionIdRef.current === id) sessionIdRef.current = null;
      try {
        const res = await authenticatedFetch(
          `/api/chat?session_id=${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error("delete failed");
      } catch {
        void refreshSessions(); // re-sync if the optimistic removal didn't stick
      }
    },
    [refreshSessions],
  );

  const renameSession = useCallback(
    async (id: string, title: string) => {
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
      try {
        const res = await authenticatedFetch("/api/chat", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session_id: id, title }),
        });
        if (!res.ok) throw new Error("rename failed");
      } catch {
        void refreshSessions();
      }
    },
    [refreshSessions],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sending) return;
      setError(null);
      setInput("");
      setSending(true);
      setMessages((prev) => [
        ...prev,
        { role: "user", content: text },
        { role: "assistant", content: "" },
      ]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            session_id: sessionIdRef.current,
            message: text,
          }),
        });

        if (!res.ok || !res.body) {
          let msg = "The analyst could not respond.";
          try {
            const j = (await res.json()) as { error?: string };
            if (j.error) msg = j.error;
          } catch {
            /* streaming/no-json error */
          }
          throw new Error(msg);
        }

        const sid = res.headers.get("x-session-id");
        if (sid) sessionIdRef.current = sid;

        const sources = decodeSourcesHeader(res.headers.get("x-knowledge-sources"));
        if (sources.length > 0) {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") {
              next[next.length - 1] = { ...last, sources };
            }
            return next;
          });
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") {
              next[next.length - 1] = {
                role: "assistant",
                content: last.content + chunk,
              };
            }
            return next;
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "The analyst could not respond.";
        setError(msg);
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant" && last.content === "") {
            next.pop();
          }
          return next;
        });
      } finally {
        setSending(false);
      }
    },
    [sending],
  );

  if (tenant.loading || loadingSessions) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted">
        <Spinner className="h-8 w-8" label="Loading analyst" />
        <p className="text-sm">Loading Chat…</p>
      </div>
    );
  }

  if (tenant.ready && tenant.teamId === null) {
    return (
      <EmptyState
        title="Workspace setup required"
        description="Complete onboarding to use Chat."
        icon={<Sparkles />}
        className="min-h-[50vh]"
      />
    );
  }

  if (view === "list") {
    return (
      <ChatSessionList
        sessions={sessions}
        onOpen={openSession}
        onNewChat={startNewChat}
        onDelete={deleteSession}
        onRename={renameSession}
      />
    );
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 shrink-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={openList}
            className="glass-pill inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-glass hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            <span>Chats</span>
          </button>
          <button
            type="button"
            onClick={startNewChat}
            className="glass-pill inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-glass"
          >
            <Plus className="h-4 w-4" aria-hidden />
            <span>New chat</span>
          </button>
        </div>
        <h1 className="nexus-app-title text-foreground">Chat</h1>
        <p className="mt-2 flex items-center gap-2 text-base text-muted">
          <Sparkles className="h-5 w-5 shrink-0 text-nexus-discovery" aria-hidden />
          Read-only. Answers only from your real inbox data. It never sends or edits anything.
        </p>
      </div>

      <ChatUsageToolbar teamId={tenant.teamId} enabled={tenant.ready && tenant.teamId !== null} />

      {!aiStatus.configured ? (
        <p className="mb-4 shrink-0 rounded-lg border border-status-warning-border bg-status-warning-surface px-4 py-2 text-sm text-status-warning">
          Chat is temporarily unavailable — the AI provider is not configured.
          {aiStatus.configHint ? (
            <span className="mt-1 block text-status-warning/90">{aiStatus.configHint}</span>
          ) : null}
        </p>
      ) : null}

      <div className="app-glass-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4 sm:p-6">
          {messagesLoading ? (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 text-muted">
              <Spinner className="h-6 w-6" label="Loading conversation" />
              <p className="text-sm">Loading conversation…</p>
            </div>
          ) : isEmpty ? (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
              <span className="glass-pill mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-nexus-discovery">
                <MessageSquare className="h-6 w-6" aria-hidden />
              </span>
              <h2 className="text-lg font-semibold text-foreground">
                Ask about your revenue command center
              </h2>
              <p className="mt-2 max-w-md text-sm text-muted">
                I read your conversations, leads, and pending drafts, then tell you what needs
                attention. I can suggest what to do, but you take action in the Approval Queue.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="glass-pill inline-flex min-h-11 cursor-pointer items-center rounded-xl px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-glass"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="space-y-4">
              {messages.map((m, i) => (
                <li
                  key={i}
                  className={cn(
                    "flex",
                    m.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed",
                      m.role === "user"
                        ? "glass-pill whitespace-pre-wrap border-glass-border bg-glass text-atmospheric-grey"
                        : "glass-pill w-full border-glass-border bg-glass/70 text-atmospheric-grey sm:w-auto sm:min-w-[280px]",
                    )}
                  >
                    {m.content ? (
                      m.role === "assistant" ? (
                        <AssistantBody message={m} />
                      ) : (
                        m.content
                      )
                    ) : m.role === "assistant" && sending ? (
                      <span className="inline-flex items-center gap-2 text-muted">
                        <Spinner className="h-4 w-4" label="Thinking" />
                        Analyzing your inbox…
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error ? (
          <p className="shrink-0 border-t border-status-warning-border bg-status-warning-surface px-4 py-2 font-mono text-xs text-status-warning">
            {error}
          </p>
        ) : null}

        <form
          className="flex shrink-0 items-end gap-2 border-t border-glass-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            placeholder="Ask what's at risk, who to reply to first…"
            disabled={!aiStatus.configured}
            className="glass-input max-h-40 min-h-11 flex-1 resize-none px-3 py-2.5 text-sm text-atmospheric-grey outline-none transition placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || !input.trim() || !aiStatus.configured}
            className="btn-primary inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium"
          >
            {sending ? (
              <Spinner className="h-4 w-4" label="Sending" />
            ) : (
              <Send className="h-4 w-4" aria-hidden />
            )}
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
