"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, Send, MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { useTenantScope } from "@/components/tenant/TenantScope";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import { cn } from "@/lib/utils";

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

const SUGGESTIONS = [
  "What's at risk today?",
  "Who should I reply to first?",
  "Summarize my inbox this week",
] as const;

export default function ChatPage() {
  const tenant = useTenantScope();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
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

  // Load the most recent session's history so the panel resumes where the founder left off.
  useEffect(() => {
    if (!tenant.ready) return;
    if (tenant.teamId === null) {
      setLoadingHistory(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await authenticatedFetch("/api/chat");
        if (!res.ok) throw new Error("Could not load chat sessions");
        const json = (await res.json()) as {
          sessions?: Array<{ id: string }>;
        };
        const latest = json.sessions?.[0]?.id ?? null;
        if (!latest) {
          if (!cancelled) setLoadingHistory(false);
          return;
        }
        sessionIdRef.current = latest;
        const msgRes = await authenticatedFetch(
          `/api/chat?session_id=${encodeURIComponent(latest)}`,
        );
        if (!msgRes.ok) throw new Error("Could not load chat history");
        const msgJson = (await msgRes.json()) as {
          messages?: Array<{ role: string; content: string }>;
        };
        if (cancelled) return;
        setMessages(
          (msgJson.messages ?? [])
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role as ChatRole, content: m.content })),
        );
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load chat history");
        }
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenant.ready, tenant.teamId]);

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

  if (tenant.loading || loadingHistory) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted">
        <Spinner className="h-8 w-8" label="Loading analyst" />
        <p className="text-sm">Loading Revenue Analyst…</p>
      </div>
    );
  }

  if (tenant.ready && tenant.teamId === null) {
    return (
      <EmptyState
        title="Workspace setup required"
        description="Complete onboarding to use the Revenue Analyst."
        icon={<Sparkles />}
        className="min-h-[50vh]"
      />
    );
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 shrink-0">
        <h1 className="nexus-app-title text-foreground">Revenue Analyst</h1>
        <p className="mt-2 flex items-center gap-2 text-base text-muted">
          <Sparkles className="h-5 w-5 shrink-0 text-nexus-discovery" aria-hidden />
          Read-only. Answers only from your real inbox data — it never sends or edits anything.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-selectable-edge bg-white dark:bg-surface-card">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {isEmpty ? (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-selectable-edge bg-surface-muted text-nexus-discovery">
                <MessageSquare className="h-6 w-6" aria-hidden />
              </span>
              <h2 className="text-lg font-semibold text-foreground">
                Ask about your revenue command center
              </h2>
              <p className="mt-2 max-w-md text-sm text-muted">
                I read your conversations, leads, and pending drafts — then tell you what needs
                attention. I can suggest what to do, but you take action in the Approval Queue.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-selectable-edge bg-surface-input px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
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
                      "max-w-[80%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm leading-relaxed",
                      m.role === "user"
                        ? "border border-selectable-edge-selected bg-ref-ice text-atmospheric-grey dark:bg-surface-muted"
                        : "border border-selectable-edge bg-surface-input text-atmospheric-grey",
                    )}
                  >
                    {m.content ||
                      (m.role === "assistant" && sending ? (
                        <span className="inline-flex items-center gap-2 text-muted">
                          <Spinner className="h-4 w-4" label="Thinking" />
                          Analyzing your inbox…
                        </span>
                      ) : null)}
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
          className="flex shrink-0 items-end gap-2 border-t border-selectable-edge p-3"
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
            className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-border bg-surface-input px-3 py-2.5 text-sm text-atmospheric-grey outline-none transition placeholder:text-muted focus:border-ref-cta focus:ring-1 focus:ring-ref-cta"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-nexus-approval-border bg-nexus-approval-soft px-4 py-2 text-[13px] font-medium text-nexus-approval transition-colors hover:bg-nexus-approval-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-approval disabled:cursor-not-allowed disabled:opacity-50"
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
