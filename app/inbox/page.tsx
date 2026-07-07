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
  Camera,
  MessageCircle,
  ExternalLink,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExecutiveEmptyState } from "@/components/ui/ExecutiveEmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { useTenantScope } from "@/components/tenant/TenantScope";
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
import {
  externalInboxLabel,
  resolveExternalInboxUrl,
  supportsExternalInbox,
} from "@/lib/meta-deep-links";

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
    case "whatsapp":
      return <MessagesSquare className={cn(common, "text-emerald-600")} aria-hidden />;
    case "instagram":
      return <Camera className={cn(common, "text-pink-500")} aria-hidden />;
    case "facebook":
      return <MessageCircle className={cn(common, "text-blue-600")} aria-hidden />;
    case "chat":
      return <MessagesSquare className={common} aria-hidden />;
    case "form":
      return <ClipboardList className={common} aria-hidden />;
    default:
      return <InboxIcon className={common} aria-hidden />;
  }
}

function sourceLabel(source: Conversation["source"]): string {
  switch (source) {
    case "gmail":
      return "Gmail";
    case "email":
      return "Email";
    case "imap":
      return "IMAP";
    case "whatsapp":
      return "WhatsApp";
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    case "webhook":
      return "Webhook";
    case "manual":
      return "Manual";
    case "demo":
      return "Demo";
    case "chat":
      return "Chat";
    case "form":
      return "Form";
    default:
      return source;
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
  const tenant = useTenantScope();
  const teamId = tenant.teamId;
  const queriesEnabled = tenant.ready && teamId !== null;

  const {
    data: conversations = [],
    isPending: listLoading,
    error: listErr,
  } = useQuery({
    queryKey: queryKeys.conversations(teamId, FETCH_LIMIT),
    queryFn: () => conversationsQuery(FETCH_LIMIT),
    enabled: queriesEnabled,
    staleTime: 30_000,
    refetchInterval: queriesEnabled ? REFRESH_MS : false,
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
  const [openInboxConfirm, setOpenInboxConfirm] = useState(false);

  const {
    data: detailDrafts = [],
    isFetching: detailLoading,
    error: detailErrObj,
  } = useQuery({
    queryKey: queryKeys.conversationDetail(teamId, selectedConversationId ?? "nil"),
    queryFn: () => conversationDraftsQuery(selectedConversationId!),
    enabled: Boolean(selectedConversationId) && queriesEnabled,
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
    if (listLoading || !queriesEnabled) return;
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
    queriesEnabled,
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

  const externalInboxUrl = useMemo(() => {
    if (!selectedConversation) return null;
    return resolveExternalInboxUrl(selectedConversation);
  }, [selectedConversation]);

  useEffect(() => {
    setOpenInboxConfirm(false);
  }, [selectedConversationId]);

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

  if (tenant.loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
        <Spinner className="h-8 w-8" label="Loading inbox" />
        <p className="text-sm">Loading conversations…</p>
      </div>
    );
  }

  if (queriesEnabled && listLoading && conversations.length === 0) {
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
        <p className="mb-3 shrink-0 rounded-xl border border-status-warning-border bg-status-warning-surface px-3 py-2 font-mono text-xs text-status-warning">
          Could not refresh inbox: {listError}
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
      <aside className="flex h-full min-h-0 w-[400px] shrink-0 flex-col overflow-hidden rounded-xl border border-selectable-edge bg-white dark:bg-surface-card">
        <div className="shrink-0 px-3 pt-3 pb-2">
          <div className="rounded-xl border border-selectable-edge bg-surface-muted p-4 dark:bg-surface-muted">
            <p className="nexus-meta text-muted">
              Revenue at Risk
            </p>
            <p className="mt-2 font-sans text-3xl font-semibold tabular-nums tracking-normal text-nexus-rescue sm:text-4xl">
              {formatCurrency(revenueAtRisk)}
            </p>
            <p className="mt-1.5 text-sm text-muted">
              Unresolved pipeline exposure
            </p>
          </div>
        </div>

        <div className="max-h-[min(38vh,320px)] shrink-0 space-y-4 overflow-y-auto overscroll-y-contain hairline-b p-4">
          <div>
            <p className="mb-2 nexus-meta text-muted">
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
                      "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-medium tracking-normal transition-colors duration-interaction",
                      active
                        ? "border-nexus-intake-border bg-nexus-intake-soft text-nexus-intake"
                        : "border-selectable-edge bg-surface-card text-slate-600 hover:border-selectable-edge-hover hover:bg-surface-muted dark:text-slate-300",
                    )}
                  >
                    {opt.label}
                    <span
                      className={cn(
                        "inline-flex min-w-[1.75rem] items-center justify-center rounded-lg border px-2 py-0.5 font-mono text-xs tabular-nums",
                        active
                          ? "border-nexus-intake-border bg-nexus-intake-soft font-bold text-nexus-intake"
                          : "border-selectable-edge bg-surface-muted font-medium text-slate-700 dark:text-slate-200",
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
            <p className="mb-2 nexus-meta text-muted">
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
                      "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-medium tracking-normal transition-colors duration-interaction",
                      active
                        ? "border-nexus-intake-border bg-nexus-intake-soft text-nexus-intake"
                        : "border-selectable-edge bg-surface-card text-slate-600 hover:border-selectable-edge-hover hover:bg-surface-muted dark:text-slate-300",
                    )}
                  >
                    {opt.label}
                    <span
                      className={cn(
                        "inline-flex min-w-[1.75rem] items-center justify-center rounded-lg border px-2 py-0.5 font-mono text-xs tabular-nums",
                        active
                          ? "border-nexus-intake-border bg-nexus-intake-soft font-bold text-nexus-intake"
                          : "border-selectable-edge bg-surface-muted font-medium text-slate-700 dark:text-slate-200",
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
              className="h-11 w-full rounded-xl border border-border bg-surface-input px-3 font-mono text-sm text-atmospheric-grey outline-none transition placeholder:text-muted focus:border-ref-cta focus:ring-1 focus:ring-ref-cta dark:border-border dark:focus:border-border-strong dark:focus:ring-border-strong"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain hairline-t p-2">
          {!queriesEnabled && tenant.ready ? (
            <ExecutiveEmptyState
              title="Workspace setup required"
              description="Complete onboarding to load your tenant inbox."
              icon={<InboxIcon className="shrink-0" aria-hidden />}
              className="border-0 bg-transparent py-10"
            />
          ) : filteredConversations.length === 0 &&
            conversations.length === 0 &&
            queriesEnabled &&
            !listLoading ? (
            <ExecutiveEmptyState
              title="No conversations detected"
              description="Intake channels standing by."
              icon={<InboxIcon className="shrink-0" aria-hidden />}
              className="border-gray-200 dark:border-gray-800 bg-transparent py-10"
            />
          ) : filteredConversations.length === 0 ? (
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
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedConversationId(c.id)}
                      className={cn(
                        "w-full cursor-pointer rounded-xl p-3 text-left transition-colors duration-interaction",
                        selected
                          ? "border border-selectable-edge-selected bg-ref-ice dark:bg-surface-muted"
                          : "border border-selectable-edge bg-white dark:bg-surface-elevated",
                        !selected &&
                          "hover:bg-ref-mint dark:hover:bg-surface-muted hover:border-selectable-edge-hover",
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
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-selectable-edge bg-white dark:bg-surface-card">
        {!selectedConversation ? (
          !queriesEnabled && tenant.ready ? (
            <ExecutiveEmptyState
              title="Workspace setup required"
              description="Finish onboarding to open message details."
              icon={<InboxIcon />}
              className="m-4 min-h-[320px] flex-1 rounded-xl border border-dashed border-border/80 dark:border-border/50"
            />
          ) : conversations.length === 0 && queriesEnabled && !listLoading ? (
            <ExecutiveEmptyState
              title="No conversations detected"
              description="Intake channels standing by."
              icon={<InboxIcon />}
              className="m-4 min-h-[320px] flex-1 rounded-xl border border-dashed border-border/80 dark:border-border/50"
            />
          ) : (
            <EmptyState
              title="Select a message to view details"
              icon={<InboxIcon />}
              className="m-4 min-h-[320px] flex-1 rounded-xl border border-dashed border-border/80 dark:border-border/50"
            />
          )
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 sm:p-6">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="nexus-app-title text-foreground">
                  {selectedConversation.customer_name}
                </h1>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-base text-muted">
                  <span className="inline-flex items-center gap-2">
                    {sourceIcon(selectedConversation.source)}
                    {sourceLabel(selectedConversation.source)}
                  </span>
                  <span aria-hidden>·</span>
                  <time dateTime={selectedConversation.created_at}>
                    {formatRelativeTime(selectedConversation.created_at)}
                  </time>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {supportsExternalInbox(selectedConversation.source) ? (
                  externalInboxUrl ? (
                    <button
                      type="button"
                      onClick={() => setOpenInboxConfirm(true)}
                      className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-selectable-edge bg-surface-input px-4 py-2 text-[13px] font-medium text-foreground transition-colors duration-interaction hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-approval"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden />
                      Open in {externalInboxLabel(selectedConversation.source)}
                    </button>
                  ) : (
                    <span
                      className="inline-flex min-h-11 items-center rounded-xl border border-dashed border-border px-4 py-2 text-[13px] text-muted"
                      title="No deep link stored for this message"
                    >
                      Native inbox link unavailable
                    </span>
                  )
                ) : null}
                {detailDrafts.length > 0 ? (
                <Link
                  href={`/approval?conversation_id=${encodeURIComponent(selectedConversation.id)}`}
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-nexus-approval-border bg-nexus-approval-soft px-4 py-2 text-[13px] font-medium tracking-normal text-nexus-approval transition-colors duration-interaction hover:bg-nexus-approval-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-approval focus-visible:ring-offset-0 focus-visible:ring-offset-white dark:focus-visible:ring-offset-0"
                >
                  View Draft Reply
                </Link>
              ) : null}
              </div>
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

            <div className="mb-6 rounded-xl border border-selectable-edge bg-surface-input p-4 font-mono text-sm leading-relaxed text-atmospheric-grey">
              {conversationMessageText(selectedConversation)}
            </div>

            <div className="mb-6 rounded-xl border border-selectable-edge bg-white p-4 dark:bg-surface-elevated">
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
              <div className="mt-6 rounded-lg border border-selectable-edge bg-surface-muted/90 p-4 dark:bg-surface-muted/60">
                <div className="grid gap-6 sm:grid-cols-2">
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
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full border border-border/50 bg-surface-input dark:border-border/50 dark:bg-surface-card">
                    <div
                      className="h-full bg-nexus-rescue transition-all"
                      style={{
                        width: `${Math.min(100, Math.max(0, selectedConversation.risk_score))}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted">Estimated value</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-nexus-growth sm:text-3xl">
                    {formatCurrency(selectedConversation.estimated_value)}
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    {confidencePercent(selectedConversation.confidence)}% confident
                  </p>
                </div>
                </div>
              </div>
            </div>

            {stage ? (
              <div className="mt-auto hairline-t pt-8">
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
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm font-bold tabular-nums transition-colors duration-interaction",
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

        {openInboxConfirm && selectedConversation && externalInboxUrl ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 p-4">
            <div className="w-full max-w-lg rounded-xl border border-border bg-surface-elevated p-6 dark:border-border/60">
              <h2 className="text-lg font-semibold text-foreground">
                Open in {externalInboxLabel(selectedConversation.source)}?
              </h2>
              <p className="mt-3 text-sm text-muted">
                You will leave Nexus OS and open this conversation in the
                native {externalInboxLabel(selectedConversation.source)} inbox
                in a new browser tab.
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOpenInboxConfirm(false)}
                  className="inline-flex min-h-11 items-center rounded-xl border border-selectable-edge px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.open(externalInboxUrl, "_blank", "noopener,noreferrer");
                    setOpenInboxConfirm(false);
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-nexus-approval-border bg-nexus-approval-soft px-4 py-2 text-sm font-medium text-nexus-approval hover:bg-nexus-approval-soft"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Continue
                </button>
              </div>
            </div>
          </div>
        ) : null}
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
