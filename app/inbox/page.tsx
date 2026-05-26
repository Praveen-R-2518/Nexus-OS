"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
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
import { conversationDraftsQuery, conversationsQuery } from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";
import type { Conversation } from "@/types";
import {
  cn,
  conversationMessageText,
  formatCurrency,
  formatRelativeTime,
  getRiskHeatPinClass,
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
  const common =
    "h-5 w-5 shrink-0 text-muted";
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

  const {
    data: conversations = [],
    isPending: listLoading,
    error: listErr,
  } = useQuery({
    queryKey: queryKeys.conversations(FETCH_LIMIT),
    queryFn: () => conversationsQuery(FETCH_LIMIT),
    staleTime: 30_000,
    refetchInterval: REFRESH_MS,
  });

  const listError = listErr instanceof Error ? listErr.message : null;

  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [activeUrgencyFilter, setActiveUrgencyFilter] =
    useState<UrgencyFilter>("");
  const [activeIntentFilter, setActiveIntentFilter] =
    useState<IntentFilter>("");
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data: detailDrafts = [],
    isFetching: detailLoading,
    error: detailErrObj,
  } = useQuery({
    queryKey: queryKeys.conversationDetail(
      selectedConversationId ?? "nil",
    ),
    queryFn: () => conversationDraftsQuery(selectedConversationId!),
    enabled: Boolean(selectedConversationId),
  });

  const detailError =
    detailErrObj instanceof Error ? detailErrObj.message : null;

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
    <div className="flex min-h-0 flex-1 flex-col">
      {listError && conversations.length > 0 ? (
        <p className="mb-3 shrink-0 border border-status-warning-border bg-status-warning-surface px-3 py-2 font-mono text-xs text-status-warning">
          Could not refresh inbox: {listError}
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
      <aside className="flex h-full min-h-0 w-[400px] shrink-0 flex-col overflow-hidden border border-black bg-white dark:border-white dark:bg-[#0a1018]">
        <div className="relative shrink-0 border-b border-black bg-ref-mint p-4 dark:border-white dark:bg-[#0c141f]">
          <div className="relative z-10">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              Revenue at Risk
            </p>
            <p className="mt-2 font-sans text-3xl font-black tabular-nums tracking-tight text-ref-cta sm:text-4xl dark:text-emerald-300/90">
              {formatCurrency(revenueAtRisk)}
            </p>
            <p className="mt-1.5 font-mono text-xs text-muted">
              Unresolved pipeline exposure
            </p>
          </div>
        </div>

        <div className="max-h-[min(38vh,320px)] shrink-0 space-y-4 overflow-y-auto overscroll-y-contain border-b border-black p-4 dark:border-white">
          <div>
            <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
              Urgency
            </p>
            <div className="flex flex-wrap gap-2">
              {URGENCY_OPTIONS.map((opt) => {
                const active = activeUrgencyFilter === opt.value;
                const count = urgencyCounts[opt.value] ?? 0;
                return (
                  <button
                    key={opt.label + opt.value}
                    type="button"
                    onClick={() => setActiveUrgencyFilter(opt.value)}
                    className={cn(
                      "inline-flex min-h-11 cursor-pointer items-center gap-2 border px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wide transition-colors duration-interaction",
                      active
                        ? "border-status-positive-border bg-status-positive-surface text-status-positive shadow-sm"
                        : "border-border bg-surface-card text-slate-600 hover:border-border-strong hover:bg-surface-muted dark:text-slate-300 dark:hover:border-border-strong",
                    )}
                  >
                    {opt.label}
                    <span
                      className={cn(
                        "inline-flex min-w-[1.75rem] items-center justify-center border border-black/10 px-2 py-0.5 font-mono text-xs tabular-nums dark:border-white/10",
                        active
                          ? "bg-status-positive-surface font-bold text-status-positive"
                          : "bg-surface-muted font-medium text-slate-700 dark:text-slate-200",
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
            <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
              Intent
            </p>
            <div className="flex flex-wrap gap-2">
              {INTENT_OPTIONS.map((opt) => {
                const active = activeIntentFilter === opt.value;
                const pillCount = intentCounts[opt.value] ?? 0;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setActiveIntentFilter(opt.value)}
                    className={cn(
                      "inline-flex min-h-11 cursor-pointer items-center gap-2 border px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wide transition-colors duration-interaction",
                      active
                        ? "border-status-positive-border bg-status-positive-surface text-status-positive shadow-sm"
                        : "border-border bg-surface-card text-slate-600 hover:border-border-strong hover:bg-surface-muted dark:text-slate-300 dark:hover:border-border-strong",
                    )}
                  >
                    {opt.label}
                    <span
                      className={cn(
                        "inline-flex min-w-[1.75rem] items-center justify-center border border-black/10 px-2 py-0.5 font-mono text-xs tabular-nums dark:border-white/10",
                        active
                          ? "bg-status-positive-surface font-bold text-status-positive"
                          : "bg-surface-muted font-medium text-slate-700 dark:text-slate-200",
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
            <label className="mb-2 block font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
              Search
            </label>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Name or message…"
              className="h-11 w-full border border-black bg-surface-input px-3 font-mono text-sm text-atmospheric-grey outline-none transition placeholder:text-muted focus:border-ref-cta focus:ring-1 focus:ring-ref-cta dark:border-white dark:focus:border-emerald-300/70 dark:focus:ring-emerald-300/50"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain border-t border-black p-2 dark:border-white">
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
                    ? "border-l-4 border-status-critical-border"
                    : selected
                      ? "border-l-4 border-status-positive bg-surface-elevated dark:bg-surface-card"
                      : "border-l-4 border-transparent";

                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedConversationId(c.id)}
                      className={cn(
                        "w-full cursor-pointer border border-black/15 bg-white p-3 text-left transition-colors duration-interaction hover:border-black hover:bg-ref-mint dark:border-white/15 dark:bg-[#0c141f] dark:hover:border-white/40 dark:hover:bg-[#0f1810]",
                        criticalBorder,
                        selected &&
                          "border-black bg-ref-ice ring-1 ring-ref-cta dark:border-white dark:bg-[#0f1810] dark:ring-emerald-300/70",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {sourceIcon(c.source)}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="truncate text-base font-semibold text-atmospheric-grey">
                              {c.customer_name}
                            </p>
                            <span
                              className={cn(
                                "risk-heat-pin shrink-0",
                                getRiskHeatPinClass(c.risk_score),
                              )}
                            >
                              {c.risk_score}
                            </span>
                          </div>
                          <p className="line-clamp-2 text-sm leading-relaxed text-muted">
                            {conversationMessageText(c)}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
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
                            <span className="ml-auto text-sm font-semibold tabular-nums text-status-positive">
                              {formatCurrency(c.estimated_value)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-muted">
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
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden border border-black bg-white dark:border-white dark:bg-[#0a1018]">
        {!selectedConversation ? (
          <EmptyState
            title="Select a message to view details"
            icon={<InboxIcon />}
              className="m-4 min-h-[320px] flex-1 border border-dashed border-black/30 dark:border-white/25"
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 sm:p-6">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="font-sans text-2xl font-black uppercase tracking-tight text-foreground sm:text-3xl">
                  {selectedConversation.customer_name}
                </h1>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-base text-muted">
                  <span className="inline-flex items-center gap-2 capitalize">
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
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center border border-status-positive-border bg-status-positive-surface px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-status-positive transition-colors duration-interaction hover:bg-status-positive-surface/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-positive-border focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0a1018]"
                >
                  View Draft Reply
                </Link>
              ) : null}
            </div>

            {detailError ? (
              <p className="mb-4 text-base text-status-critical">{detailError}</p>
            ) : null}
            {detailLoading ? (
              <div className="mb-4 flex items-center gap-2 text-base text-muted">
                <Spinner className="h-5 w-5" label="Loading details" />
                Loading draft info…
              </div>
            ) : null}

            <div className="mb-6 border border-black bg-surface-input p-4 font-mono text-sm leading-relaxed text-atmospheric-grey dark:border-white">
              {conversationMessageText(selectedConversation)}
            </div>

            <div className="mb-6 border border-black bg-white p-4 dark:border-white dark:bg-[#0c141f]">
              <h2 className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
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
              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-muted">Risk score</p>
                  <div className="mt-2 flex items-center gap-3">
                    <span
                      className={cn(
                        "risk-heat-pin text-lg",
                        getRiskHeatPinClass(selectedConversation.risk_score),
                      )}
                    >
                      {selectedConversation.risk_score}
                    </span>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden border border-black/10 bg-surface-muted dark:border-white/10">
                    <div
                      className="h-full bg-ref-cta transition-all dark:bg-emerald-400/80"
                      style={{
                        width: `${Math.min(100, Math.max(0, selectedConversation.risk_score))}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted">Estimated value</p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-status-positive sm:text-3xl">
                    {formatCurrency(selectedConversation.estimated_value)}
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    {confidencePercent(selectedConversation.confidence)}% confident
                  </p>
                </div>
              </div>
            </div>

            {stage ? (
              <div className="mt-auto border-t border-black pt-8 dark:border-white">
                <h2 className="mb-5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
                  Status
                </h2>
                <ol className="space-y-4">
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
                      className="flex items-center gap-4 text-base"
                    >
                      <span
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center border text-sm font-bold tabular-nums transition-colors duration-interaction",
                          done
                            ? "border-status-positive-border bg-status-positive-surface text-status-positive"
                            : "border-border bg-surface-muted text-muted",
                        )}
                      >
                        {done ? <Check className="h-5 w-5" strokeWidth={2.5} /> : i + 1}
                      </span>
                      <span
                        className={cn(
                          done
                            ? "font-semibold text-atmospheric-grey"
                            : "text-muted",
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
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 font-mono text-xs uppercase tracking-widest text-muted">
          <Spinner className="h-8 w-8" label="Loading inbox" />
          <p className="text-sm">Loading conversations…</p>
        </div>
      }
    >
      <InboxPageContent />
    </Suspense>
  );
}
