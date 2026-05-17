"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ClipboardList,
  Inbox as InboxIcon,
  Mail,
  MessagesSquare,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import type { Conversation, ReplyDraft } from "@/types";
import {
  cn,
  conversationMessageText,
  formatCurrency,
  formatRelativeTime,
  getRiskColor,
} from "@/lib/utils";

const REFRESH_MS = 30_000;
const FETCH_LIMIT = 100;

type UrgencyFilter = "" | NonNullable<Conversation["urgency"]>;
type IntentFilter = "" | Exclude<NonNullable<Conversation["intent"]>, "unknown">;

const URGENCY_OPTIONS: { value: UrgencyFilter; label: string }[] = [
  { value: "", label: "All" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const INTENT_OPTIONS: { value: IntentFilter; label: string }[] = [
  { value: "", label: "All" },
  { value: "purchase", label: "Purchase" },
  { value: "complaint", label: "Complaint" },
  { value: "churn_risk", label: "Churn Risk" },
  { value: "support", label: "Support" },
];

function sourceIcon(source: Conversation["source"]) {
  const common = "h-4 w-4 shrink-0 text-gray-500";
  switch (source) {
    case "email":
    case "gmail":
    case "imap":
      return <Mail className={common} aria-hidden />;
    case "chat":
      return <MessagesSquare className={common} aria-hidden />;
    case "form":
      return <ClipboardList className={common} aria-hidden />;
    default:
      return <InboxIcon className={common} aria-hidden />;
  }
}

function intentBadgeLabel(
  intent: Conversation["intent"] | null | undefined,
): string {
  if (intent == null) {
    return "Unknown";
  }
  switch (intent) {
    case "purchase":
      return "Purchase";
    case "complaint":
      return "Complaint";
    case "churn_risk":
      return "Churn Risk";
    case "support":
      return "Support";
    default:
      return "Unknown";
  }
}

function urgencyBadgeLabel(
  urgency: Conversation["urgency"] | null | undefined,
): string {
  if (urgency == null) return "—";
  return urgency.charAt(0).toUpperCase() + urgency.slice(1);
}

function timelineCompletion(status: Conversation["status"]): {
  received: boolean;
  classified: boolean;
  draftReady: boolean;
  approved: boolean;
  sent: boolean;
} {
  return {
    received: true,
    classified: status !== "new",
    draftReady:
      status === "draft_ready" ||
      status === "approved" ||
      status === "sent" ||
      status === "rejected",
    approved: status === "approved" || status === "sent",
    sent: status === "sent",
  };
}

function InboxPageContent() {
  const searchParams = useSearchParams();
  const prevQsRef = useRef<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [activeUrgencyFilter, setActiveUrgencyFilter] =
    useState<UrgencyFilter>("");
  const [activeIntentFilter, setActiveIntentFilter] =
    useState<IntentFilter>("");
  const [searchQuery, setSearchQuery] = useState("");

  const [detailDrafts, setDetailDrafts] = useState<ReplyDraft[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [usingMockData, setUsingMockData] = useState(false);

  const loadConversations = useCallback(async () => {
    setListError(null);
    try {
      const res = await fetch(`/api/conversations?limit=${FETCH_LIMIT}`);
      const json = (await res.json()) as {
        data?: Conversation[];
        error?: string;
        source?: string;
      };
      if (!res.ok) {
        throw new Error(
          typeof json.error === "string" ? json.error : res.statusText,
        );
      }
      if (!Array.isArray(json.data)) {
        throw new Error("Invalid conversations response");
      }
      setConversations(json.data);
      setUsingMockData(json.source === "mock");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load conversations";
      setListError(msg);
      setConversations([]);
      setUsingMockData(false);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
    const t = setInterval(() => {
      void loadConversations();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [loadConversations]);

  const revenueAtRisk = useMemo(() => {
    return conversations
      .filter((c) => c.status !== "sent")
      .reduce((sum, c) => sum + (Number(c.estimated_value) || 0), 0);
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return conversations.filter((c) => {
      if (activeUrgencyFilter && c.urgency !== activeUrgencyFilter) {
        return false;
      }
      if (activeIntentFilter && c.intent !== activeIntentFilter) {
        return false;
      }
      if (q) {
        const name = c.customer_name.toLowerCase();
        const msg = conversationMessageText(c).toLowerCase();
        if (!name.includes(q) && !msg.includes(q)) return false;
      }
      return true;
    });
  }, [conversations, activeUrgencyFilter, activeIntentFilter, searchQuery]);

  useEffect(() => {
    const intent = searchParams.get("intent");
    if (
      intent &&
      INTENT_OPTIONS.some((o) => o.value === intent && o.value !== "")
    ) {
      setActiveIntentFilter(intent as IntentFilter);
    }
  }, [searchParams]);

  useEffect(() => {
    if (listLoading) return;
    if (filteredConversations.length === 0) {
      setSelectedConversationId(null);
      return;
    }

    const qs = searchParams.toString();
    const isFirst = prevQsRef.current === null;
    const qsChanged = !isFirst && qs !== prevQsRef.current;
    prevQsRef.current = qs;

    const urlId = searchParams.get("id");
    if (
      (isFirst || qsChanged) &&
      urlId &&
      filteredConversations.some((c) => c.id === urlId)
    ) {
      setSelectedConversationId(urlId);
      return;
    }

    const stillValid = selectedConversationId
      ? filteredConversations.some((c) => c.id === selectedConversationId)
      : false;
    if (!stillValid) {
      setSelectedConversationId(filteredConversations[0]!.id);
    }
  }, [
    filteredConversations,
    listLoading,
    selectedConversationId,
    searchParams,
  ]);

  useEffect(() => {
    if (!selectedConversationId) return;
    if (!conversations.some((c) => c.id === selectedConversationId)) {
      setSelectedConversationId(null);
    }
  }, [conversations, selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) {
      setDetailDrafts([]);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }

    const ac = new AbortController();
    setDetailLoading(true);
    setDetailError(null);

    void (async () => {
      try {
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(selectedConversationId)}`,
          { signal: ac.signal },
        );
        const json = (await res.json()) as {
          drafts?: ReplyDraft[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(
            typeof json.error === "string" ? json.error : res.statusText,
          );
        }
        setDetailDrafts(Array.isArray(json.drafts) ? json.drafts : []);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        const msg =
          e instanceof Error ? e.message : "Failed to load conversation";
        setDetailError(msg);
        setDetailDrafts([]);
      } finally {
        if (!ac.signal.aborted) setDetailLoading(false);
      }
    })();

    return () => ac.abort();
  }, [selectedConversationId]);

  const selectedConversation = useMemo(() => {
    if (!selectedConversationId) return null;
    return (
      conversations.find((c) => c.id === selectedConversationId) ?? null
    );
  }, [conversations, selectedConversationId]);

  const urgencyCounts = useMemo(() => {
    const base = { "": conversations.length } as Record<string, number>;
    for (const { value } of URGENCY_OPTIONS) {
      if (value === "") continue;
      base[value] = conversations.filter((c) => c.urgency === value).length;
    }
    return base;
  }, [conversations]);

  const intentCounts = useMemo(() => {
    const base: Record<string, number> = { "": conversations.length };
    for (const { value } of INTENT_OPTIONS) {
      if (value === "") continue;
      base[value] = conversations.filter((c) => c.intent === value).length;
    }
    return base;
  }, [conversations]);

  function confidencePercent(confidence: number): number {
    if (confidence > 1) {
      return Math.round(Math.min(100, Math.max(0, confidence)));
    }
    return Math.round(Math.min(100, Math.max(0, confidence * 100)));
  }

  const stage = selectedConversation
    ? timelineCompletion(selectedConversation.status)
    : null;

  if (listLoading && conversations.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
        <Spinner className="h-8 w-8" label="Loading inbox" />
        <p className="text-sm">Loading conversations…</p>
      </div>
    );
  }

  if (listError && conversations.length === 0) {
    return (
      <EmptyState
        title="Could not load inbox"
        description={listError}
        icon={<InboxIcon />}
        className="min-h-[50vh]"
      />
    );
  }

  return (
    <>
      {usingMockData ? (
        <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-[#7A4200]">
          Demo data — add{" "}
          <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 text-[#7A4200]">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          and{" "}
          <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 text-[#7A4200]">
            SUPABASE_SERVICE_ROLE_KEY
          </code>{" "}
          in{" "}
          <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 text-[#7A4200]">
            .env.local
          </code>{" "}
          to load live conversations (or set{" "}
          <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 text-[#7A4200]">
            NEXUS_USE_MOCK_DATA=false
          </code>{" "}
          to disable auto-demo in development).
        </p>
      ) : null}
      {listError && conversations.length > 0 ? (
        <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-[#7A4200]">
          Could not refresh inbox: {listError}
        </p>
      ) : null}
      <div className="flex h-[calc(100vh-6rem)] min-h-[560px] gap-4">
      <aside className="flex w-[380px] shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 surface-muted">
        <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Revenue at Risk
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-trajectory-blue">
            {formatCurrency(revenueAtRisk)}
          </p>
        </div>

        <div className="shrink-0 space-y-3 border-b border-slate-200 dark:border-slate-800 p-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-atmospheric-grey/60">Urgency</p>
            <div className="flex flex-wrap gap-1.5">
              {URGENCY_OPTIONS.map((opt) => {
                const active = activeUrgencyFilter === opt.value;
                const count = urgencyCounts[opt.value] ?? 0;
                return (
                  <button
                    key={opt.label + opt.value}
                    type="button"
                    onClick={() => setActiveUrgencyFilter(opt.value)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/15 text-[#1B6B3A] dark:text-emerald-300"
                        : "border-slate-300 dark:border-slate-700 bg-surface-card dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600",
                    )}
                  >
                    {opt.label}
                    <span
                      className={cn(
                        "rounded-md px-1 py-0.5 text-[10px] tabular-nums",
                        active ? "bg-emerald-100 dark:bg-emerald-500/25" : "bg-slate-100 dark:bg-slate-900/80",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-atmospheric-grey/60">Intent</p>
            <div className="flex flex-wrap gap-1.5">
              {INTENT_OPTIONS.map((opt) => {
                const active = activeIntentFilter === opt.value;
                const pillCount = intentCounts[opt.value] ?? 0;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setActiveIntentFilter(opt.value)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/15 text-[#1B6B3A] dark:text-emerald-300"
                        : "border-slate-300 dark:border-slate-700 bg-surface-card dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600",
                    )}
                  >
                    {opt.label}
                    <span
                      className={cn(
                        "rounded-md px-1 py-0.5 text-[10px] tabular-nums",
                        active ? "bg-emerald-100 dark:bg-emerald-500/25" : "bg-slate-100 dark:bg-slate-900/80",
                      )}
                    >
                      {pillCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
          <label className="mb-1 block text-xs font-medium text-atmospheric-grey/60">
            Search
          </label>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Name or message…"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/80 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {filteredConversations.length === 0 ? (
            <EmptyState
              title="No messages match"
              description="Try adjusting filters or search."
              icon={<InboxIcon />}
              className="border-gray-200 dark:border-gray-800 bg-transparent py-10"
            />
          ) : (
            <ul className="space-y-2">
              {filteredConversations.map((c) => {
                const selected = c.id === selectedConversationId;
                const criticalBorder =
                  c.urgency === "critical" && !selected
                    ? "border-l-4 border-red-500/40"
                    : selected
                      ? "border-l-4 border-emerald-400 bg-gray-100 dark:bg-gray-800"
                      : "border-l-4 border-transparent";

                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedConversationId(c.id)}
                      className={cn(
                        "w-full rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-left transition-colors hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50",
                        criticalBorder,
                        selected && "bg-surface-elevated dark:bg-slate-800 ring-1 ring-emerald-500/30 shadow-sm",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {sourceIcon(c.source)}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate font-semibold text-gray-900 dark:text-gray-100">
                              {c.customer_name}
                            </p>
                            <span
                              className={cn(
                                "shrink-0 text-sm font-semibold tabular-nums",
                                getRiskColor(c.risk_score),
                              )}
                            >
                              {c.risk_score}
                            </span>
                          </div>
                          <p className="line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
                            {conversationMessageText(c)}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant="urgency"
                              value={c.urgency}
                              label={urgencyBadgeLabel(c.urgency)}
                            />
                            <Badge
                              variant="intent"
                              value={c.intent}
                              label={intentBadgeLabel(c.intent)}
                            />
                            <span className="ml-auto text-xs tabular-nums text-atmospheric-grey/40">
                              {formatCurrency(c.estimated_value)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-atmospheric-grey/40">
                            {formatRelativeTime(c.created_at)}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Right panel */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 surface-muted">
        {!selectedConversation ? (
          <EmptyState
            title="Select a message to view details"
            icon={<InboxIcon />}
            className="m-4 min-h-[320px] flex-1 border-gray-200 dark:border-gray-800"
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-foreground">
                  {selectedConversation.customer_name}
                </h1>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <span className="inline-flex items-center gap-1 capitalize">
                    {sourceIcon(selectedConversation.source)}
                    {selectedConversation.source}
                  </span>
                  <span aria-hidden>·</span>
                  <time dateTime={selectedConversation.created_at}>
                    {formatRelativeTime(selectedConversation.created_at)}
                  </time>
                </p>
              </div>
              {detailDrafts.length > 0 ? (
                <Link
                  href={`/approval?conversation_id=${encodeURIComponent(selectedConversation.id)}`}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-[#1B6B3A] transition-colors hover:bg-emerald-500/20"
                >
                  View Draft Reply
                </Link>
              ) : null}
            </div>

            {detailError ? (
              <p className="mb-4 text-sm text-[#8B1A1A]">{detailError}</p>
            ) : null}
            {detailLoading ? (
              <div className="mb-4 flex items-center gap-2 text-sm text-atmospheric-grey/60">
                <Spinner className="h-4 w-4" label="Loading details" />
                Loading draft info…
              </div>
            ) : null}

            <div className="mb-6 rounded-xl bg-surface-card dark:bg-slate-950 p-4 font-mono text-sm leading-relaxed text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 shadow-sm">
              {conversationMessageText(selectedConversation)}
            </div>

            <div className="mb-6 rounded-xl border border-slate-200 dark:border-slate-800 surface-card p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Classification
              </h2>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="intent"
                  value={selectedConversation.intent}
                  label={`Intent: ${intentBadgeLabel(selectedConversation.intent)}`}
                />
                <Badge
                  variant="urgency"
                  value={selectedConversation.urgency}
                  label={`Urgency: ${urgencyBadgeLabel(selectedConversation.urgency)}`}
                />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-atmospheric-grey/60">Risk score</p>
                  <p
                    className={cn(
                      "text-lg font-semibold tabular-nums",
                      getRiskColor(selectedConversation.risk_score),
                    )}
                  >
                    {selectedConversation.risk_score}
                  </p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    <div
                      className="h-full rounded-full bg-trajectory-blue/80 transition-all"
                      style={{
                        width: `${Math.min(100, Math.max(0, selectedConversation.risk_score))}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Estimated value</p>
                  <p className="text-lg font-semibold tabular-nums text-[#1B6B3A] dark:text-emerald-400">
                    {formatCurrency(selectedConversation.estimated_value)}
                  </p>
                  <p className="mt-2 text-xs text-atmospheric-grey/40">
                    {confidencePercent(selectedConversation.confidence)}% confident
                  </p>
                </div>
              </div>
            </div>

            {stage ? (
              <div className="mt-auto border-t border-gray-200 dark:border-gray-800 pt-6">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Status
                </h2>
                <ol className="space-y-3">
                  {(
                    [
                      ["Received", stage.received],
                      ["Classified", stage.classified],
                      ["Draft ready", stage.draftReady],
                      ["Approved", stage.approved],
                      ["Sent", stage.sent],
                    ] as const
                  ).map(([label, done], i) => (
                    <li
                      key={label}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums",
                          done
                            ? "border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/15 text-[#1B6B3A] dark:text-emerald-300"
                            : "border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
                        )}
                      >
                        {done ? <Check className="w-3 h-3" /> : i + 1}
                      </span>
                      <span
                        className={cn(
                          done ? "text-slate-700 dark:text-slate-200" : "text-slate-500",
                        )}
                      >
                        {label}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
    </>
  );
}

export default function InboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
          <Spinner className="h-8 w-8" label="Loading inbox" />
          <p className="text-sm">Loading conversations…</p>
        </div>
      }
    >
      <InboxPageContent />
    </Suspense>
  );
}
