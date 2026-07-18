"use client";

import { useCallback, useState } from "react";
import {
  ChevronDown,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import { cn, formatRelativeTime } from "@/lib/utils";

export type ChatSession = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type Preview = {
  loading: boolean;
  question?: string;
  answer?: string;
  error?: string;
};

const SNIPPET_LEN = 240;

function snippet(text: string, len = SNIPPET_LEN): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= len ? clean : `${clean.slice(0, len).trimEnd()}…`;
}

export function ChatSessionList({
  sessions,
  onOpen,
  onNewChat,
  onDelete,
  onRename,
}: {
  sessions: ChatSession[];
  onOpen: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const loadPreview = useCallback(async (id: string) => {
    setPreviews((prev) => ({ ...prev, [id]: { loading: true } }));
    try {
      const res = await authenticatedFetch(
        `/api/chat?session_id=${encodeURIComponent(id)}`,
      );
      if (!res.ok) throw new Error("Could not load preview");
      const json = (await res.json()) as {
        messages?: Array<{ role: string; content: string }>;
      };
      const msgs = json.messages ?? [];
      const question = msgs.find((m) => m.role === "user")?.content;
      const answer = msgs.find((m) => m.role === "assistant")?.content;
      setPreviews((prev) => ({
        ...prev,
        [id]: {
          loading: false,
          question: question ? snippet(question) : undefined,
          answer: answer ? snippet(answer) : undefined,
        },
      }));
    } catch (e) {
      setPreviews((prev) => ({
        ...prev,
        [id]: {
          loading: false,
          error: e instanceof Error ? e.message : "Could not load preview",
        },
      }));
    }
  }, []);

  const toggleExpand = useCallback(
    (id: string) => {
      setExpandedId((cur) => {
        const next = cur === id ? null : id;
        if (next && !previews[id]) void loadPreview(id);
        return next;
      });
    },
    [previews, loadPreview],
  );

  const startRename = useCallback((s: ChatSession) => {
    setRenamingId(s.id);
    setRenameValue(s.title);
  }, []);

  const commitRename = useCallback(
    (id: string) => {
      const title = renameValue.replace(/\s+/g, " ").trim();
      setRenamingId(null);
      const current = sessions.find((s) => s.id === id)?.title;
      if (title && title !== current) onRename(id, title);
    },
    [renameValue, sessions, onRename],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div>
          <h1 className="nexus-app-title text-foreground">Chats</h1>
          <p className="mt-2 text-base text-muted">
            Your past conversations with the analyst. Open one to continue where you left off.
          </p>
        </div>
        <button
          type="button"
          onClick={onNewChat}
          className="btn-primary inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium"
        >
          <Plus className="h-4 w-4" aria-hidden />
          <span>New chat</span>
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center gap-4">
          <EmptyState
            title="No chats yet"
            description="Start your first conversation with the analyst — ask what's at risk or who to reply to first."
            icon={<MessageSquare />}
            className="w-full"
          />
          <button
            type="button"
            onClick={onNewChat}
            className="btn-primary inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium"
          >
            <Plus className="h-4 w-4" aria-hidden />
            <span>Start your first chat</span>
          </button>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-y-contain pb-2">
          {sessions.map((s) => {
            const expanded = expandedId === s.id;
            const preview = previews[s.id];
            const isRenaming = renamingId === s.id;
            return (
              <li key={s.id} className="app-glass-card overflow-hidden rounded-xl">
                <div className="flex items-center gap-2 p-3">
                  <button
                    type="button"
                    onClick={() => toggleExpand(s.id)}
                    aria-label={expanded ? "Collapse preview" : "Preview chat"}
                    aria-expanded={expanded}
                    className="glass-pill inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-glass"
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        expanded && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </button>

                  {isRenaming ? (
                    <form
                      className="flex min-w-0 flex-1 items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        commitRename(s.id);
                      }}
                    >
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        maxLength={80}
                        className="glass-input min-h-9 flex-1 px-3 py-1.5 text-sm text-atmospheric-grey outline-none"
                      />
                      <button
                        type="submit"
                        aria-label="Save name"
                        className="glass-pill inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-nexus-discovery transition-colors hover:bg-glass"
                      >
                        <Check className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        aria-label="Cancel rename"
                        className="glass-pill inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-glass"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onOpen(s.id)}
                        className="group min-w-0 flex-1 cursor-pointer text-left"
                      >
                        <span className="block truncate text-sm font-medium text-atmospheric-grey group-hover:text-foreground">
                          {s.title}
                        </span>
                        <span className="block text-xs text-muted">
                          {formatRelativeTime(s.updated_at)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => startRename(s)}
                        aria-label="Rename chat"
                        className="glass-pill inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-glass hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete "${s.title}"? This can't be undone.`,
                            )
                          ) {
                            onDelete(s.id);
                          }
                        }}
                        aria-label="Delete chat"
                        className="glass-pill inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-status-warning-surface hover:text-status-warning"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </>
                  )}
                </div>

                {expanded ? (
                  <div className="border-t border-glass-border/60 px-4 py-3 text-sm">
                    {preview?.loading ? (
                      <span className="inline-flex items-center gap-2 text-muted">
                        <Spinner className="h-4 w-4" label="Loading preview" />
                        Loading preview…
                      </span>
                    ) : preview?.error ? (
                      <span className="text-status-warning">{preview.error}</span>
                    ) : preview?.question || preview?.answer ? (
                      <div className="space-y-2">
                        {preview.question ? (
                          <p className="text-atmospheric-grey">
                            <span className="font-semibold text-muted">You: </span>
                            {preview.question}
                          </p>
                        ) : null}
                        {preview.answer ? (
                          <p className="text-muted">
                            <span className="font-semibold">Analyst: </span>
                            {preview.answer}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted">No messages in this chat yet.</span>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
