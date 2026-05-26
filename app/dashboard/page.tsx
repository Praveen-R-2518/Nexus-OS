"use client";

import DemoButton from "@/app/components/DemoButton";
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
  getRiskHeatPinClass,
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
          className="h-36 animate-pulse border border-black/15 bg-surface-muted dark:border-white/15"
        />
      ))}
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse gap-3 border border-black/10 bg-surface-muted/80 p-3 dark:border-white/10"
        >
          <div className="h-6 w-14 shrink-0 border border-black/10 bg-white/50 dark:border-white/10 dark:bg-[#0a1018]/80" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-1/3 border border-black/10 bg-white/50 dark:border-white/10 dark:bg-[#0a1018]/80" />
            <div className="h-3 w-full border border-black/10 bg-white/40 dark:border-white/10 dark:bg-[#0a1018]/60" />
          </div>
          <div className="hidden h-8 w-12 shrink-0 border border-black/10 bg-white/50 dark:border-white/10 dark:bg-[#0a1018]/80 sm:block" />
        </div>
      ))}
    </div>
  );
}

function SideCardSkeleton() {
  return (
    <div className="animate-pulse border border-black/15 bg-surface-muted p-4 dark:border-white/15">
      <div className="mb-4 h-4 w-36 border border-black/10 bg-white/40 dark:border-white/10 dark:bg-[#0a1018]/60" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-12 border border-black/10 bg-white/40 dark:border-white/10 dark:bg-[#0a1018]/50"
          />
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
    <div className="min-h-0 space-y-10">
        <header className="border-b border-black pb-8 dark:border-white">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-ref-cta dark:text-emerald-300/90">
            Operations
          </p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <h1 className="font-sans text-3xl font-black uppercase tracking-tighter text-atmospheric-grey sm:text-4xl md:text-5xl">
              Command Center
            </h1>
            <DemoButton
              onSent={() => {
                void refetchMetrics();
                void refetchConversations();
              }}
            />
          </div>
          <p className="mb-2 mt-4 max-w-2xl font-mono text-sm leading-relaxed text-muted">
            Live revenue rescue ops — prioritize revenue at risk, route hot
            leads, and intercept churn before it lands.
          </p>
        </header>

        {metricsErrorMsg ? (
          <div className="border border-status-critical-border bg-status-critical-surface px-4 py-3 font-mono text-sm text-status-critical">
            <span>Metrics: {metricsErrorMsg}</span>{" "}
            <button
              type="button"
              onClick={() => void refetchMetrics()}
              className="ml-2 inline-flex min-h-11 cursor-pointer items-center px-2 font-semibold uppercase tracking-wide text-status-positive underline-offset-4 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : null}
        {conversationsErrorMsg ? (
          <div className="border border-status-critical-border bg-status-critical-surface px-4 py-3 font-mono text-sm text-status-critical">
            <span>Inbox feed: {conversationsErrorMsg}</span>{" "}
            <button
              type="button"
              onClick={() => void refetchConversations()}
              className="ml-2 inline-flex min-h-11 cursor-pointer items-center px-2 font-semibold uppercase tracking-wide text-status-positive underline-offset-4 hover:underline"
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
              className="border-border bg-surface-muted/50"
            />
          ) : metrics ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
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
                accent="text-status-warning"
                className="animate-fade-up [animation-delay:150ms]"
              />
              <Card
                title="Hours Saved"
                value={`${metrics.hours_saved.toFixed(1)}h`}
                subtitle="saved by AI drafting"
                icon={<Clock />}
                variant="support"
                accent="text-status-neutral"
                className="animate-fade-up [animation-delay:225ms]"
              />
            </div>
          ) : (
            <EmptyState
              title="No metrics yet"
              description="Connect Supabase or check API configuration."
              className="border-border bg-surface-muted/50"
            />
          )}
        </section>

        {/* Two columns */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          {/* Inbox feed */}
          <section
            aria-label="Inbox feed preview"
            className="overflow-hidden border border-black bg-white dark:border-white dark:bg-[#0a1018]"
          >
            <div className="flex items-center justify-end border-b border-black px-4 py-3 dark:border-white">
              <Link
                href="/inbox"
                className="inline-flex min-h-11 cursor-pointer items-center font-mono text-[11px] font-semibold uppercase tracking-widest text-ref-cta transition-opacity hover:opacity-80 dark:text-emerald-300/90"
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
              <ul className="divide-y divide-black/10 dark:divide-white/10">
                {feedPreview.map((c) => {
                  const highlighted = highlightIds.has(c.id);
                  return (
                    <li key={c.id}>
                      <div
                        className={cn(
                          "flex flex-col gap-4 px-5 py-4 transition-colors sm:flex-row sm:items-center sm:gap-5",
                          c.urgency === "critical" &&
                            "bg-status-critical-surface/60 dark:bg-status-critical-surface/40",
                          highlighted && "animate-slide-down-row",
                        )}
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-4">
                          <div className="shrink-0 pt-0.5">
                            <Badge
                              variant="urgency"
                              value={c.urgency}
                              label={urgencyBadgeLabel(c.urgency)}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-base font-semibold text-atmospheric-grey">
                              {c.customer_name}
                            </p>
                            <p className="line-clamp-1 text-sm text-muted">
                              {conversationMessagePreview(c)}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 sm:justify-end">
                          <span
                            className={cn(
                              "risk-heat-pin text-sm sm:w-14",
                              getRiskHeatPinClass(c.risk_score),
                            )}
                          >
                            {c.risk_score}
                          </span>
                          <span className="text-base font-bold tabular-nums text-status-positive sm:w-28 sm:text-right">
                            {formatCurrency(c.estimated_value)}
                          </span>
                          <time
                            className="text-sm tabular-nums text-muted sm:w-32 sm:text-right"
                            dateTime={c.updated_at}
                          >
                            {formatRelativeTime(c.updated_at)}
                          </time>
                          <Link
                            href={`/inbox?id=${encodeURIComponent(c.id)}`}
                            className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border border-black bg-ref-mint text-atmospheric-grey transition-colors duration-interaction hover:border-ref-cta hover:bg-white dark:border-white dark:bg-[#0c141f] dark:hover:border-emerald-300/60"
                            aria-label={`Open ${c.customer_name} in inbox`}
                          >
                            <ArrowRight className="h-5 w-5" />
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
              className="overflow-hidden border border-status-warning-border bg-status-warning-surface/30 dark:bg-[#0a1018]"
            >
              <div className="flex items-center justify-between border-b border-black px-4 py-3 dark:border-white">
                <h2 className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-atmospheric-grey">
                  <Flame className="h-4 w-4 text-status-warning" aria-hidden />{" "}
                  Hot Leads
                </h2>
                <Link
                  href="/inbox?intent=purchase"
                  className="inline-flex min-h-11 cursor-pointer items-center font-mono text-[10px] font-semibold uppercase tracking-widest text-status-warning transition-opacity hover:opacity-80"
                >
                  View all →
                </Link>
              </div>
              <div className="p-5">
                {conversationsPending && feedPreview.length === 0 ? (
                  <SideCardSkeleton />
                ) : hotLeadsList.length === 0 ? (
                  <p className="py-6 text-center font-mono text-xs text-muted">
                    No hot leads in the current snapshot.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {hotLeadsList.map((c) => (
                      <li key={c.id}>
                        <div className="border border-black/15 bg-white px-3 py-3 dark:border-white/15 dark:bg-[#0c141f]">
                          <div className="flex items-start justify-between gap-3">
                            <p className="truncate text-base font-semibold text-atmospheric-grey">
                              {c.customer_name}
                            </p>
                            <span className="shrink-0 text-base font-bold tabular-nums text-status-positive">
                              {formatCurrency(c.estimated_value)}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Badge
                              variant="urgency"
                              value={c.urgency}
                              label={urgencyBadgeLabel(c.urgency)}
                            />
                            <span
                              className={cn(
                                "border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide",
                                isDraftPipelineReady(c.status)
                                  ? "border-status-positive-border bg-status-positive-surface text-status-positive"
                                  : "border-border bg-surface-muted text-muted",
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
              className="overflow-hidden border border-status-caution-border bg-status-caution-surface/25 dark:bg-[#0a1018]"
            >
              <div className="flex items-center justify-between border-b border-black px-4 py-3 dark:border-white">
                <h2 className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-atmospheric-grey">
                  <AlertTriangle
                    className="h-4 w-4 text-status-caution"
                    aria-hidden
                  />{" "}
                  Churn Risks
                </h2>
                <Link
                  href="/inbox?intent=churn_risk"
                  className="inline-flex min-h-11 cursor-pointer items-center font-mono text-[10px] font-semibold uppercase tracking-widest text-status-caution transition-opacity hover:opacity-80"
                >
                  View all →
                </Link>
              </div>
              <div className="p-5">
                {conversationsPending && feedPreview.length === 0 ? (
                  <SideCardSkeleton />
                ) : churnRisksList.length === 0 ? (
                  <p className="py-6 text-center font-mono text-xs text-muted">
                    No churn signals in the current snapshot.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {churnRisksList.map((c) => (
                      <li key={c.id}>
                        <div className="border border-black/15 bg-white px-3 py-3 dark:border-white/15 dark:bg-[#0c141f]">
                          <div className="flex items-start justify-between gap-3">
                            <p className="truncate text-base font-semibold text-atmospheric-grey">
                              {c.customer_name}
                            </p>
                            <span
                              className={cn(
                                "risk-heat-pin shrink-0 text-sm",
                                getRiskHeatPinClass(c.risk_score),
                              )}
                            >
                              {c.risk_score}
                            </span>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden border border-black/10 bg-surface-muted dark:border-white/10">
                            <div
                              className={cn(
                                "h-full transition-all",
                                c.risk_score >= 80
                                  ? "bg-status-critical"
                                  : c.risk_score >= 60
                                    ? "bg-status-warning"
                                    : c.risk_score >= 40
                                      ? "bg-status-caution"
                                      : "bg-trajectory-blue",
                              )}
                              style={{
                                width: `${Math.min(100, Math.max(0, c.risk_score))}%`,
                              }}
                            />
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide",
                                isDraftPipelineReady(c.status)
                                  ? "border-status-positive-border bg-status-positive-surface text-status-positive"
                                  : "border-border bg-surface-muted text-muted",
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
