"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Flame,
  TrendingDown,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { conversationsQuery, metricsQuery } from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";
import type { Conversation } from "@/types";
import {
  cn,
  conversationMessagePreview,
  formatCurrency,
  formatRelativeTime,
  getRiskColor,
} from "@/lib/utils";

const GLOBAL_REFRESH_MS = 30_000;
const INBOX_REFRESH_MS = 15_000;
/** Shared list size for React Query cache (inbox, approval, report use same). */
const CONVERSATIONS_LIMIT = 100;
const FEED_PREVIEW = 10;

function urgencyBadgeLabel(urgency: Conversation["urgency"] | null | undefined): string {
  if (urgency == null) return "—";
  return urgency.charAt(0).toUpperCase() + urgency.slice(1);
}

function isDraftPipelineReady(status: Conversation["status"]): boolean {
  return (
    status === "draft_ready" ||
    status === "approved" ||
    status === "sent" ||
    status === "rejected"
  );
}

function hotLeadDraftTag(
  status: Conversation["status"],
): "Draft Ready" | "Needs Reply" {
  return isDraftPipelineReady(status) ? "Draft Ready" : "Needs Reply";
}

function churnDraftTag(
  status: Conversation["status"],
): "Draft Ready" | "Awaiting Draft" {
  return isDraftPipelineReady(status) ? "Draft Ready" : "Awaiting Draft";
}

function MetricsSkeletonRow() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-[132px] animate-pulse rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800/40"
        />
      ))}
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse gap-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-obsidian/40 p-3"
        >
          <div className="h-6 w-16 shrink-0 rounded-full bg-gray-100 dark:bg-gray-800" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-1/3 rounded bg-gray-100 dark:bg-gray-800" />
            <div className="h-3 w-full rounded bg-gray-100 dark:bg-gray-800/80" />
          </div>
          <div className="hidden h-8 w-14 shrink-0 rounded bg-gray-100 dark:bg-gray-800 sm:block" />
        </div>
      ))}
    </div>
  );
}

function SideCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 dark:border-gray-800 bg-obsidian/40 p-4">
      <div className="mb-4 h-5 w-40 rounded bg-gray-100 dark:bg-gray-800" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-gray-100 dark:bg-gray-800/50" />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());

  const prevConvIdsRef = useRef<Set<string>>(new Set());
  const firstConvFetchRef = useRef(true);
  const highlightClearRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const applyConversationHighlights = useCallback((next: Conversation[]) => {
    const nextIds = new Set(next.map((c) => c.id));

    if (firstConvFetchRef.current) {
      firstConvFetchRef.current = false;
      prevConvIdsRef.current = nextIds;
      return;
    }

    const prev = prevConvIdsRef.current;
    const appeared = new Set<string>();
    for (const id of Array.from(nextIds)) {
      if (!prev.has(id)) appeared.add(id);
    }
    prevConvIdsRef.current = nextIds;

    if (appeared.size === 0) return;

    if (highlightClearRef.current) clearTimeout(highlightClearRef.current);
    setHighlightIds(appeared);
    highlightClearRef.current = setTimeout(() => {
      setHighlightIds(new Set());
      highlightClearRef.current = null;
    }, 900);
  }, []);

  const {
    data: metrics,
    isPending: metricsPending,
    error: metricsError,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: queryKeys.metrics(),
    queryFn: metricsQuery,
    staleTime: 30_000,
    refetchInterval: GLOBAL_REFRESH_MS,
  });

  const {
    data: conversations = [],
    isPending: conversationsPending,
    error: conversationsError,
    refetch: refetchConversations,
  } = useQuery({
    queryKey: queryKeys.conversations(CONVERSATIONS_LIMIT),
    queryFn: () => conversationsQuery(CONVERSATIONS_LIMIT),
    staleTime: 30_000,
    refetchInterval: INBOX_REFRESH_MS,
  });

  useEffect(() => {
    if (conversations.length > 0) {
      applyConversationHighlights(conversations);
    }
  }, [conversations, applyConversationHighlights]);

  useEffect(() => {
    return () => {
      if (highlightClearRef.current) clearTimeout(highlightClearRef.current);
    };
  }, []);

  const metricsErrorMsg =
    metricsError instanceof Error ? metricsError.message : null;
  const conversationsErrorMsg =
    conversationsError instanceof Error
      ? conversationsError.message
      : null;

  const feedPreview = useMemo(
    () => conversations.slice(0, FEED_PREVIEW),
    [conversations],
  );

  const hotLeadsList = useMemo(() => {
    return conversations
      .filter(
        (c) =>
          c.intent === "purchase" &&
          (c.urgency === "critical" || c.urgency === "high"),
      )
      .slice(0, 5);
  }, [conversations]);

  const churnRisksList = useMemo(() => {
    return conversations.filter((c) => c.intent === "churn_risk").slice(0, 5);
  }, [conversations]);

  return (
    <div className="min-h-[calc(100vh-6rem)] space-y-8">
        <header className="border-b border-black/10 dark:border-white/10 pb-6">
          <div className="mb-2">
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
              Command Center
            </h1>
          </div>
          <p className="max-w-xl text-sm text-gray-500 dark:text-gray-400 mb-8">
            Live revenue rescue ops — prioritize revenue at risk, route hot
            leads, and intercept churn before it lands.
          </p>
        </header>

        {metricsErrorMsg ? (
          <div className="rounded-xl border border-red-200 dark:border-red-500/35 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-[#8B1A1A] dark:text-red-200">
            <span>Metrics: {metricsErrorMsg}</span>{" "}
            <button
              type="button"
              onClick={() => void refetchMetrics()}
              className="ml-2 font-medium text-[#1B6B3A] underline dark:text-emerald-400"
            >
              Retry
            </button>
          </div>
        ) : null}
        {conversationsErrorMsg ? (
          <div className="rounded-xl border border-red-200 dark:border-red-500/35 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-[#8B1A1A] dark:text-red-200">
            <span>Inbox feed: {conversationsErrorMsg}</span>{" "}
            <button
              type="button"
              onClick={() => void refetchConversations()}
              className="ml-2 font-medium text-[#1B6B3A] underline dark:text-emerald-400"
            >
              Retry
            </button>
          </div>
        ) : null}

        {/* Metrics */}
        <section aria-label="Key metrics">
          {metricsPending && !metrics ? (
            <MetricsSkeletonRow />
          ) : metricsErrorMsg && !metrics ? (
            <EmptyState
              title="Metrics unavailable"
              description={metricsErrorMsg}
              className="border-gray-200 dark:border-gray-800 bg-obsidian/40"
            />
          ) : metrics ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card
                title="Revenue at Risk"
                value={formatCurrency(metrics.revenue_at_risk)}
                subtitle="in unresolved conversations"
                icon={<TrendingDown />}
                variant="critical"
                className="animate-fade-up [animation-delay:0ms]"
              />
              <Card
                title="Hot Leads"
                value={metrics.hot_leads}
                subtitle="high-intent buyers right now"
                icon={<Flame />}
                variant="critical"
                className="animate-fade-up [animation-delay:75ms]"
              />
              <Card
                title="Churn Risks"
                value={metrics.churn_risks}
                subtitle="customers showing churn signals"
                icon={<AlertTriangle />}
                variant="support"
                className="animate-fade-up [animation-delay:150ms]"
              />
              <Card
                title="Hours Saved"
                value={`${metrics.hours_saved.toFixed(1)}h`}
                subtitle="saved by AI drafting"
                icon={<Clock />}
                variant="support"
                className="animate-fade-up [animation-delay:225ms]"
              />
            </div>
          ) : (
            <EmptyState
              title="No metrics yet"
              description="Connect Supabase or check API configuration."
              className="border-gray-200 dark:border-gray-800 bg-obsidian/40"
            />
          )}
        </section>

        {/* Two columns */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          {/* Inbox feed */}
          <section
            aria-label="Inbox feed preview"
            className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 surface-card shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
          >
            <div className="flex items-center justify-end border-b border-slate-200 dark:border-slate-800 px-4 py-3">
              <Link
                href="/inbox"
                className="text-xs font-medium text-[#1B6B3A] dark:text-emerald-400/90 hover:text-[#1B6B3A] dark:hover:text-[#1B6B3A]"
              >
                Open inbox →
              </Link>
            </div>

            {conversationsPending && feedPreview.length === 0 ? (
              <FeedSkeleton />
            ) : feedPreview.length === 0 ? (
              <EmptyState
                title="Inbox empty"
                description="New conversations will appear here."
                className="border-0 bg-transparent py-12"
              />
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-800/80">
                {feedPreview.map((c) => {
                  const highlighted = highlightIds.has(c.id);
                  return (
                    <li key={c.id}>
                      <div
                        className={cn(
                          "flex flex-col gap-3 px-4 py-3 transition-colors sm:flex-row sm:items-center sm:gap-4",
                          c.urgency === "critical" && "bg-red-50 dark:bg-red-950/30",
                          highlighted && "animate-slide-down-row",
                        )}
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <div className="shrink-0 pt-0.5">
                            <Badge
                              variant="urgency"
                              value={c.urgency}
                              label={urgencyBadgeLabel(c.urgency)}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-gray-900 dark:text-gray-100">
                              {c.customer_name}
                            </p>
                            <p className="line-clamp-1 text-xs text-atmospheric-grey/60">
                              {conversationMessagePreview(c)}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 sm:justify-end">
                          <span
                            className={cn(
                              "text-sm font-semibold tabular-nums sm:w-12 sm:text-right",
                              getRiskColor(c.risk_score),
                            )}
                          >
                            {c.risk_score}
                          </span>
                          <span className="text-sm font-medium tabular-nums text-[#1B6B3A] dark:text-emerald-400/90 sm:w-24 sm:text-right">
                            {formatCurrency(c.estimated_value)}
                          </span>
                          <time
                            className="text-xs tabular-nums text-slate-500 sm:w-28 sm:text-right"
                            dateTime={c.updated_at}
                          >
                            {formatRelativeTime(c.updated_at)}
                          </time>
                          <Link
                            href={`/inbox?id=${encodeURIComponent(c.id)}`}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 transition-colors hover:border-emerald-500/40 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-[#1B6B3A] dark:hover:text-[#1B6B3A]"
                            aria-label={`Open ${c.customer_name} in inbox`}
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Right column */}
          <div className="flex flex-col gap-6">
            {/* Hot Leads */}
            <section
              aria-label="Hot leads"
              className="overflow-hidden rounded-xl border border-orange-500/20 bg-gradient-to-b from-orange-50 dark:from-orange-500/5 to-transparent"
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <Flame className="h-4 w-4 text-[#7A4200] dark:text-orange-400" /> Hot Leads
                </h2>
                <Link
                  href="/inbox?intent=purchase"
                  className="text-xs font-medium text-[#7A4200] dark:text-orange-400 hover:text-[#7A4200] dark:hover:text-[#7A4200]"
                >
                  View all →
                </Link>
              </div>
              <div className="p-4">
                {conversationsPending && feedPreview.length === 0 ? (
                  <SideCardSkeleton />
                ) : hotLeadsList.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">
                    No hot leads in the current snapshot.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {hotLeadsList.map((c) => (
                      <li key={c.id}>
                        <div className="rounded-lg border border-slate-200 dark:border-slate-800 surface-card px-3 py-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                              {c.customer_name}
                            </p>
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-[#1B6B3A] dark:text-emerald-400">
                              {formatCurrency(c.estimated_value)}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge
                              variant="urgency"
                              value={c.urgency}
                              label={urgencyBadgeLabel(c.urgency)}
                            />
                            <span
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                isDraftPipelineReady(c.status)
                                  ? "border-emerald-500/35 bg-emerald-50 dark:bg-emerald-500/10 text-[#1B6B3A] dark:text-emerald-300"
                                  : "border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
                              )}
                            >
                              {hotLeadDraftTag(c.status)}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Churn Risks */}
            <section
              aria-label="Churn risks"
              className="overflow-hidden rounded-xl border border-yellow-500/20 bg-gradient-to-b from-yellow-50 dark:from-yellow-500/5 to-transparent"
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" /> Churn Risks
                </h2>
                <Link
                  href="/inbox?intent=churn_risk"
                  className="text-xs font-medium text-yellow-600 dark:text-yellow-400 hover:text-yellow-500 dark:hover:text-yellow-300"
                >
                  View all →
                </Link>
              </div>
              <div className="p-4">
                {conversationsPending && feedPreview.length === 0 ? (
                  <SideCardSkeleton />
                ) : churnRisksList.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">
                    No churn signals in the current snapshot.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {churnRisksList.map((c) => (
                      <li key={c.id}>
                        <div className="rounded-lg border border-slate-200 dark:border-slate-800 surface-card px-3 py-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate font-medium text-slate-900 dark:text-slate-100">
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
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                c.risk_score >= 80
                                  ? "bg-[#C0392B] opacity-70"
                                  : c.risk_score >= 60
                                    ? "bg-orange-500/80"
                                    : c.risk_score >= 40
                                      ? "bg-yellow-500/80"
                                      : "bg-trajectory-blue/70",
                              )}
                              style={{
                                width: `${Math.min(100, Math.max(0, c.risk_score))}%`,
                              }}
                            />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                isDraftPipelineReady(c.status)
                                  ? "border-emerald-500/35 bg-emerald-50 dark:bg-emerald-500/10 text-[#1B6B3A] dark:text-emerald-300"
                                  : "border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
                              )}
                            >
                              {churnDraftTag(c.status)}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </div>
    </div>
  );
}
