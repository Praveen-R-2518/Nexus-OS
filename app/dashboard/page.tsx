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
  Inbox,
  TrendingDown,
} from "lucide-react";
import { useTenantScope } from "@/components/tenant/TenantScope";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExecutiveEmptyState } from "@/components/ui/ExecutiveEmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import {
  MetricsTrendChart,
  MetricsTrendChartSkeleton,
} from "@/components/dashboard/MetricsTrendChart";
import { conversationsQuery, metricsQuery, metricsTimeseriesQuery } from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";
import type { Conversation, Metrics, MetricsTimeseriesRange } from "@/types";
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

const TIMESERIES_RANGES: { value: MetricsTimeseriesRange; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "6m", label: "6 months" },
  { value: "year", label: "Year" },
  { value: "all", label: "All data" },
];

const ZERO_METRICS: Metrics = {
  revenue_at_risk: 0,
  hot_leads: 0,
  churn_risks: 0,
  hours_saved: 0,
};

function urgencyBadgeLabel(urgency: Conversation["urgency"] | null | undefined): string {
  if (urgency == null) return "n/a";
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
          className="glass-skeleton h-36 rounded-xl"
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
          className="glass-skeleton flex gap-3 rounded-xl p-3"
        >
          <div className="glass-skeleton h-6 w-14 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="glass-skeleton h-3 w-1/3 rounded-md" />
            <div className="glass-skeleton h-3 w-full rounded-md" />
          </div>
          <div className="glass-skeleton hidden h-8 w-12 shrink-0 rounded-md sm:block" />
        </div>
      ))}
    </div>
  );
}

function SideCardSkeleton() {
  return (
    <div className="glass-skeleton rounded-xl p-4">
      <div className="glass-skeleton mb-4 h-4 w-36 rounded-md" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="glass-skeleton h-12 rounded-md"
          />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const tenant = useTenantScope();
  const teamId = tenant.teamId;
  const queriesEnabled = tenant.ready && teamId !== null;

  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const [timeseriesRange, setTimeseriesRange] =
    useState<MetricsTimeseriesRange>("month");

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
    queryKey: queryKeys.metrics(teamId),
    queryFn: metricsQuery,
    enabled: queriesEnabled,
    staleTime: 30_000,
    refetchInterval: queriesEnabled ? GLOBAL_REFRESH_MS : false,
  });

  const {
    data: timeseries,
    isPending: timeseriesPending,
    error: timeseriesError,
    refetch: refetchTimeseries,
  } = useQuery({
    queryKey: queryKeys.metricsTimeseries(teamId, timeseriesRange),
    queryFn: () => metricsTimeseriesQuery(timeseriesRange),
    enabled: queriesEnabled,
    staleTime: 30_000,
    refetchInterval: queriesEnabled ? GLOBAL_REFRESH_MS : false,
  });

  const {
    data: conversations = [],
    isPending: conversationsPending,
    error: conversationsError,
    refetch: refetchConversations,
  } = useQuery({
    queryKey: queryKeys.conversations(teamId, CONVERSATIONS_LIMIT),
    queryFn: () => conversationsQuery(CONVERSATIONS_LIMIT),
    enabled: queriesEnabled,
    staleTime: 30_000,
    refetchInterval: queriesEnabled ? INBOX_REFRESH_MS : false,
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
  const timeseriesErrorMsg =
    timeseriesError instanceof Error ? timeseriesError.message : null;
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
        <header className="hairline-b pb-8">
          <p className="nexus-meta text-nexus-approval dark:text-nexus-approval">
            Operations
          </p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <h1 className="nexus-app-title text-atmospheric-grey">
              Command Center
            </h1>
          </div>
          <p className="mb-2 mt-4 max-w-2xl text-base leading-relaxed text-muted">
            Live revenue rescue ops. Prioritize revenue at risk, route hot
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
          {!queriesEnabled && tenant.ready ? (
            <ExecutiveEmptyState
              title="Workspace setup required"
              description="Complete onboarding to bind your team and activate metrics."
              icon={<Inbox className="shrink-0" aria-hidden />}
              className="app-glass-card"
            />
          ) : metricsErrorMsg && queriesEnabled ? (
            <EmptyState
              title="Metrics unavailable"
              description={metricsErrorMsg}
              className="app-glass-card"
            />
          ) : metricsPending && queriesEnabled && !metrics ? (
            <MetricsSkeletonRow />
          ) : queriesEnabled ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <Card
                title="Revenue at Risk"
                value={formatCurrency((metrics ?? ZERO_METRICS).revenue_at_risk)}
                subtitle="in unresolved conversations"
                icon={<TrendingDown />}
                variant="critical"
                accent="text-status-critical"
              />
              <Card
                title="Hot Leads"
                value={(metrics ?? ZERO_METRICS).hot_leads}
                subtitle="high-intent buyers right now"
                icon={<Flame />}
                variant="critical"
                accent="text-nexus-intake"
              />
              <Card
                title="Churn Risks"
                value={(metrics ?? ZERO_METRICS).churn_risks}
                subtitle="customers showing churn signals"
                icon={<AlertTriangle />}
                variant="support"
                accent="text-nexus-rescue"
              />
              <Card
                title="Hours Saved"
                value={`${(metrics ?? ZERO_METRICS).hours_saved.toFixed(1)}h`}
                subtitle="saved by AI drafting"
                icon={<Clock />}
                variant="support"
                accent="text-nexus-execution"
              />
            </div>
          ) : (
            <MetricsSkeletonRow />
          )}
        </section>

        <section aria-label="Metrics trends" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-atmospheric-grey">
                Daily trends
              </h2>
              <p className="mt-1 text-xs text-muted">
                Revenue at risk, hot leads, and churn risks over time.
              </p>
            </div>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Chart time range"
            >
              {TIMESERIES_RANGES.map(({ value, label }) => (
                <FilterChip
                  key={value}
                  active={timeseriesRange === value}
                  onClick={() => setTimeseriesRange(value)}
                >
                  {label}
                </FilterChip>
              ))}
            </div>
          </div>

          {timeseriesErrorMsg ? (
            <div className="border border-status-critical-border bg-status-critical-surface px-4 py-3 font-mono text-sm text-status-critical">
              <span>Trends: {timeseriesErrorMsg}</span>{" "}
              <button
                type="button"
                onClick={() => void refetchTimeseries()}
                className="ml-2 inline-flex min-h-11 cursor-pointer items-center px-2 font-semibold uppercase tracking-wide text-status-positive underline-offset-4 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : null}

          {timeseriesPending && queriesEnabled && !timeseries ? (
            <MetricsTrendChartSkeleton />
          ) : queriesEnabled ? (
            <MetricsTrendChart points={timeseries?.points ?? []} />
          ) : null}
        </section>

        {/* Two columns */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          {/* Inbox feed */}
          <section
            aria-label="Inbox feed preview"
            className="app-glass-card overflow-hidden rounded-xl"
          >
            <div className="flex items-center justify-end hairline-b px-4 py-3">
              <Link
                href="/inbox"
                className="inline-flex min-h-11 cursor-pointer items-center text-[13px] font-medium tracking-normal text-nexus-intake transition-opacity hover:opacity-80"
              >
                Open inbox →
              </Link>
            </div>

            {conversationsPending && queriesEnabled && feedPreview.length === 0 ? (
              <FeedSkeleton />
            ) : !queriesEnabled && tenant.ready ? (
              <ExecutiveEmptyState
                title="Workspace setup required"
                description="Finish onboarding to stream live conversations into this feed."
                icon={<Inbox className="shrink-0" aria-hidden />}
                className="border-0 bg-transparent py-12"
              />
            ) : feedPreview.length === 0 ? (
              <ExecutiveEmptyState
                title="No conversations detected"
                description="Intake channels standing by."
                icon={<Inbox className="shrink-0" aria-hidden />}
                className="border-0 bg-transparent py-12"
              />
            ) : (
              <ul className="flex flex-col gap-px bg-black/[0.04] p-px dark:bg-white/[0.05]">
                {feedPreview.map((c) => {
                  const highlighted = highlightIds.has(c.id);
                  return (
                    <li
                      key={c.id}
                      className="bg-glass/80"
                    >
                      <div
                        className={cn(
                          "flex flex-col gap-4 px-5 py-4 transition-colors sm:flex-row sm:items-center sm:gap-5",
                          c.urgency === "critical" &&
                            "bg-status-critical-surface/60 dark:bg-status-critical-surface/40",
                          highlighted && "bg-nexus-approval-soft",
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
                            className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border-strong bg-surface-muted text-atmospheric-grey transition-colors duration-interaction hover:bg-surface-elevated hover:border-nexus-approval"
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
              className="app-glass-card overflow-hidden rounded-xl border-nexus-intake-border"
            >
              <div className="flex items-center justify-between hairline-b px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold tracking-normal text-atmospheric-grey">
                  <Flame className="h-4 w-4 text-nexus-intake" aria-hidden />{" "}
                  Hot Leads
                </h2>
                <Link
                  href="/inbox?intent=purchase"
                  className="inline-flex min-h-11 cursor-pointer items-center text-[13px] font-medium tracking-normal text-nexus-intake transition-opacity hover:opacity-80"
                >
                  View all →
                </Link>
              </div>
              <div className="p-5">
                {conversationsPending && queriesEnabled && feedPreview.length === 0 ? (
                  <SideCardSkeleton />
                ) : !queriesEnabled && tenant.ready ? (
                  <ExecutiveEmptyState
                    title="Workspace setup required"
                    description="Complete onboarding to surface hot leads."
                    icon={<Flame className="shrink-0" aria-hidden />}
                    className="border-0 bg-transparent py-8"
                  />
                ) : hotLeadsList.length === 0 ? (
                  <ExecutiveEmptyState
                    title="No high-intent leads"
                    description="No high-intent leads in this workspace."
                    icon={<Flame className="shrink-0" aria-hidden />}
                    className="border-0 bg-transparent py-8"
                  />
                ) : (
                  <ul className="space-y-3">
                    {hotLeadsList.map((c) => (
                      <li key={c.id}>
                        <div className="glass-pill rounded-xl px-3 py-3">
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
                                  ? "border-nexus-growth-border bg-nexus-growth-soft text-status-positive"
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
              className="app-glass-card overflow-hidden rounded-xl border-nexus-rescue-border"
            >
              <div className="flex items-center justify-between hairline-b px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold tracking-normal text-atmospheric-grey">
                  <AlertTriangle
                    className="h-4 w-4 text-nexus-rescue"
                    aria-hidden
                  />{" "}
                  Churn Risks
                </h2>
                <Link
                  href="/inbox?intent=churn_risk"
                  className="inline-flex min-h-11 cursor-pointer items-center text-[13px] font-medium tracking-normal text-nexus-rescue transition-opacity hover:opacity-80"
                >
                  View all →
                </Link>
              </div>
              <div className="p-5">
                {conversationsPending && queriesEnabled && feedPreview.length === 0 ? (
                  <SideCardSkeleton />
                ) : !queriesEnabled && tenant.ready ? (
                  <ExecutiveEmptyState
                    title="Workspace setup required"
                    description="Complete onboarding to surface churn signals."
                    icon={<AlertTriangle className="shrink-0" aria-hidden />}
                    className="border-0 bg-transparent py-8"
                  />
                ) : churnRisksList.length === 0 ? (
                  <ExecutiveEmptyState
                    title="No churn signals detected"
                    description="No churn signals detected."
                    icon={<AlertTriangle className="shrink-0" aria-hidden />}
                    className="border-0 bg-transparent py-8"
                  />
                ) : (
                  <ul className="space-y-3">
                    {churnRisksList.map((c) => (
                      <li key={c.id}>
                        <div className="glass-pill rounded-xl px-3 py-3">
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
                          <div className="mt-3 h-2 overflow-hidden rounded-full border border-border/40 bg-surface-muted dark:border-border/50">
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
