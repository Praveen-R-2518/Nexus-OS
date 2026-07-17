"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle,
  Clock,
  DollarSign,
  Send,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExecutiveEmptyState } from "@/components/ui/ExecutiveEmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { Spinner } from "@/components/ui/Spinner";
import { useTenantScope } from "@/components/tenant/TenantScope";
import { useAppChromeSearch } from "@/components/layout/AppChromeSearch";
import {
  approveReply,
  rejectReply,
} from "@/lib/api";
import { conversationsQuery, replyDraftsQuery } from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";
import {
  cn,
  conversationMessageText,
  formatCurrency,
  formatRelativeTime,
  getRiskColor,
  getRiskHeatPinClass,
} from "@/lib/utils";
import type { Conversation, ReplyDraft, ReplyDraftWithConversation } from "@/types";

type ApprovalFilter = "all" | ReplyDraft["approval_status"];
type Toast = {
  kind: "success" | "error";
  message: string;
};
type DraftItem = Omit<ReplyDraftWithConversation, "conversation"> & {
  conversation: Conversation;
};

const FILTERS: { value: ApprovalFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const STATUS_LABELS: Record<ReplyDraft["approval_status"], string> = {
  pending: "PENDING APPROVAL",
  approved: "APPROVED",
  rejected: "REJECTED",
};

// TODO(durable-outbound UI): surface `outbound_jobs.status` (queued/claiming/sending/sent/failed)
// on approved drafts — requires joining outbound_jobs in GET /api/reply-drafts (or a dedicated
// field on the PATCH /api/approval response persisted client-side). Types: lib/outbound-jobs.ts.

const SORT_WEIGHT: Record<ReplyDraft["approval_status"], number> = {
  pending: 0,
  approved: 1,
  rejected: 2,
};

function intentLabel(intent: Conversation["intent"]): string {
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

function urgencyLabel(urgency: Conversation["urgency"]): string {
  if (!urgency) return "Unknown";
  return urgency.charAt(0).toUpperCase() + urgency.slice(1);
}

function toneLabel(tone: string): string {
  const normalized = tone.trim().toLowerCase();
  if (normalized.includes("urgent")) return "Urgent";
  if (normalized.includes("empathetic")) return "Empathetic";
  return "Professional";
}

function fallbackConversation(
  draft: ReplyDraftWithConversation,
): Conversation {
  return {
    id: draft.conversation_id,
    source: "email",
    customer_name: draft.conversation.customer_name,
    raw_message: "Original message unavailable.",
    intent: "unknown",
    urgency: "medium",
    estimated_value: draft.conversation.estimated_value,
    risk_score: draft.conversation.risk_score,
    confidence: 0,
    status:
      draft.approval_status === "pending"
        ? "draft_ready"
        : draft.approval_status,
    created_at: draft.created_at,
    updated_at: draft.created_at,
  };
}

function mergeDraftsWithConversations(
  drafts: ReplyDraftWithConversation[],
  conversations: Conversation[],
): DraftItem[] {
  const conversationById = new Map(conversations.map((c) => [c.id, c]));
  return drafts.map((draft) => ({
    ...draft,
    conversation:
      conversationById.get(draft.conversation_id) ?? fallbackConversation(draft),
  }));
}

function sortDrafts(drafts: DraftItem[]): DraftItem[] {
  return [...drafts].sort((a, b) => {
    const statusDelta =
      SORT_WEIGHT[a.approval_status] - SORT_WEIGHT[b.approval_status];
    if (statusDelta !== 0) return statusDelta;
    const riskDelta = b.conversation.risk_score - a.conversation.risk_score;
    if (riskDelta !== 0) return riskDelta;
    return (
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  });
}

function MiniCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="app-glass-card border border-glass-border p-5">
      <p className="text-xs font-bold uppercase tracking-brand text-muted">
        {label}
      </p>
      <p className={cn("mt-3 text-2xl font-bold tabular-nums sm:text-3xl", accent)}>
        {value}
      </p>
    </div>
  );
}

export default function ApprovalPage() {
  const queryClient = useQueryClient();
  const tenant = useTenantScope();
  const teamId = tenant.teamId;
  const queriesEnabled = tenant.ready && teamId !== null;

  const [draftOverride, setDraftOverride] = useState<DraftItem[] | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ApprovalFilter>("pending");
  const [editedDraftText, setEditedDraftText] = useState<Record<string, string>>(
    {},
  );
  const [actionDraftId, setActionDraftId] = useState<string | null>(null);
  const [rejectingDraft, setRejectingDraft] = useState<DraftItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const { query: searchQuery } = useAppChromeSearch();

  const {
    data: draftRows = [],
    isPending: draftsPending,
    error: draftsErr,
  } = useQuery({
    queryKey: queryKeys.replyDrafts(teamId),
    queryFn: () => replyDraftsQuery(),
    enabled: queriesEnabled,
    staleTime: 30_000,
  });

  const { data: convRows = [] } = useQuery({
    queryKey: queryKeys.conversations(teamId, 100),
    queryFn: () => conversationsQuery(100),
    enabled: queriesEnabled,
    staleTime: 30_000,
  });

  const mergedBase = useMemo(
    () => sortDrafts(mergeDraftsWithConversations(draftRows, convRows)),
    [draftRows, convRows],
  );

  const drafts = draftOverride ?? mergedBase;
  const loading = draftsPending && draftOverride === null;
  const error =
    draftsErr instanceof Error ? draftsErr.message : null;

  const showToast = useCallback((nextToast: Toast) => {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const counts = useMemo(() => {
    return {
      all: drafts.length,
      pending: drafts.filter((d) => d.approval_status === "pending").length,
      approved: drafts.filter((d) => d.approval_status === "approved").length,
      rejected: drafts.filter((d) => d.approval_status === "rejected").length,
    } satisfies Record<ApprovalFilter, number>;
  }, [drafts]);

  const filteredDrafts = useMemo(() => {
    const visible =
      activeFilter === "all"
        ? drafts
        : drafts.filter((d) => d.approval_status === activeFilter);
    const q = searchQuery.trim().toLowerCase();
    const searched = q
      ? visible.filter((draft) => {
          const name = draft.conversation.customer_name.toLowerCase();
          const message = conversationMessageText(draft.conversation).toLowerCase();
          const draftText = String(draft.draft_text ?? "").toLowerCase();
          return (
            name.includes(q) || message.includes(q) || draftText.includes(q)
          );
        })
      : visible;
    return sortDrafts(searched);
  }, [activeFilter, drafts, searchQuery]);

  useEffect(() => {
    if (loading) return;
    if (filteredDrafts.length === 0) {
      setSelectedDraftId(null);
      return;
    }
    const stillVisible = selectedDraftId
      ? filteredDrafts.some((d) => d.id === selectedDraftId)
      : false;
    if (!stillVisible) {
      setSelectedDraftId(filteredDrafts[0]!.id);
    }
  }, [filteredDrafts, loading, selectedDraftId]);

  const selectedDraft = useMemo(() => {
    if (!selectedDraftId) return null;
    return drafts.find((d) => d.id === selectedDraftId) ?? null;
  }, [drafts, selectedDraftId]);

  const selectedText = selectedDraft
    ? String(editedDraftText[selectedDraft.id] ?? selectedDraft.draft_text ?? "")
    : "";

  async function optimisticallyMoveDraft(
    draft: DraftItem,
    status: ReplyDraft["approval_status"],
    action: () => Promise<void>,
    successMessage: string,
  ) {
    const overrideBefore = draftOverride;
    const previousDrafts = drafts;
    const previousFilter = activeFilter;
    const previousSelectedDraftId = selectedDraftId;
    const nowIso = new Date().toISOString();
    const conversationStatus: Conversation["status"] =
      status === "pending" ? "draft_ready" : status;

    setActionDraftId(draft.id);
    setActiveFilter(status);
    setSelectedDraftId(draft.id);
    setDraftOverride(
      sortDrafts(
        previousDrafts.map((item) =>
          item.id === draft.id
            ? {
                ...item,
                draft_text: editedDraftText[item.id] ?? item.draft_text,
                approval_status: status,
                approved_at: status === "approved" ? nowIso : item.approved_at,
                rejected_at: status === "rejected" ? nowIso : item.rejected_at,
                conversation: {
                  ...item.conversation,
                  status: conversationStatus,
                  updated_at: nowIso,
                },
              }
            : item,
        ),
      ),
    );

    try {
      await action();
      showToast({ kind: "success", message: successMessage });
      void queryClient.invalidateQueries({ queryKey: queryKeys.replyDrafts(teamId) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversations(teamId, 100),
      });
      setDraftOverride(null);
    } catch (e) {
      setDraftOverride(overrideBefore);
      setActiveFilter(previousFilter);
      setSelectedDraftId(previousSelectedDraftId);
      showToast({
        kind: "error",
        message: e instanceof Error ? e.message : "Action failed",
      });
    } finally {
      setActionDraftId(null);
    }
  }

  async function handleApprove(draft: DraftItem) {
    const draftText = editedDraftText[draft.id] ?? draft.draft_text;
    await optimisticallyMoveDraft(
      draft,
      "approved",
      () => approveReply(draft.id, draftText),
      "Reply queued for sending",
    );
  }

  async function handleReject() {
    if (!rejectingDraft) return;
    const reason = rejectionReason.trim();
    if (!reason) {
      showToast({ kind: "error", message: "Rejection reason is required" });
      return;
    }
    const draft = rejectingDraft;
    setRejectingDraft(null);
    setRejectionReason("");
    await optimisticallyMoveDraft(
      draft,
      "rejected",
      () => rejectReply(draft.id, reason),
      "Draft rejected",
    );
  }

  if (tenant.loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 font-mono text-xs uppercase tracking-widest text-muted">
        <Spinner className="h-8 w-8" label="Loading approvals" />
        <p>Loading approval queue…</p>
      </div>
    );
  }

  if (!queriesEnabled && tenant.ready) {
    return (
      <ExecutiveEmptyState
        title="Workspace setup required"
        description="Complete onboarding to access the approval queue."
        icon={<CheckCircle />}
        className="min-h-[50vh] app-glass-card"
      />
    );
  }

  if (loading && drafts.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 font-mono text-xs uppercase tracking-widest text-muted">
        <Spinner className="h-8 w-8" label="Loading approvals" />
        <p>Loading approval queue…</p>
      </div>
    );
  }

  if (error && drafts.length === 0) {
    return (
      <EmptyState
        title="Could not load approvals"
        description={error}
        icon={<AlertTriangle />}
        className="min-h-[50vh]"
      />
    );
  }

  return (
    <>
      {toast ? (
        <div
          className={cn(
            "fixed right-6 top-6 z-50 app-glass-card rounded-xl px-5 py-4 text-sm font-medium",
            toast.kind === "success"
              ? "border-status-positive-border bg-status-positive-surface text-status-positive"
              : "border-status-critical-border bg-status-critical-surface text-status-critical",
          )}
        >
          {toast.message}
        </div>
      ) : null}

      <div className="flex min-h-[560px] flex-1 flex-col gap-4 lg:flex-row">
        <aside className="app-glass-card flex w-full shrink-0 flex-col overflow-hidden rounded-xl lg:w-[420px]">
          <div className="hairline-b p-5">
            <p className="nexus-meta text-nexus-approval dark:text-nexus-approval">
              Approval Queue
            </p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p className="font-sans text-3xl font-semibold tabular-nums text-atmospheric-grey">
                  {counts.pending} pending
                </p>
                <p className="mt-2 text-sm text-muted">
                  AI replies waiting on a founder decision
                </p>
              </div>
              <div className="rounded-xl border border-status-warning-border bg-status-warning-surface px-4 py-3 text-right">
                <p className="text-sm font-medium text-status-warning">
                  At stake
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-status-warning">
                  {formatCurrency(
                    drafts
                      .filter((d) => d.approval_status === "pending")
                      .reduce(
                        (sum, d) =>
                          sum + (Number(d.conversation.estimated_value) || 0),
                        0,
                      ),
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="hairline-b p-4">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((filter) => {
                const active = activeFilter === filter.value;
                return (
                  <FilterChip
                    key={filter.value}
                    active={active}
                    onClick={() => setActiveFilter(filter.value)}
                    className="text-sm"
                  >
                    {filter.label}
                    <span
                      className={cn(
                        "inline-flex min-w-[1.75rem] items-center justify-center rounded-lg border px-2 py-0.5 font-mono text-xs tabular-nums",
                        active
                          ? "border-nexus-approval-border bg-nexus-approval-soft font-semibold text-nexus-approval"
                          : "border-border-strong bg-surface-elevated font-medium text-atmospheric-grey/80",
                      )}
                    >
                      {counts[filter.value]}
                    </span>
                  </FilterChip>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {filteredDrafts.length === 0 ? (
              <ExecutiveEmptyState
                title={
                  activeFilter === "pending"
                    ? "Inbox Zero. Your workspace is optimized."
                    : "No drafts in this tab"
                }
                description={
                  activeFilter === "pending"
                    ? "No pending approvals. Approved and rejected drafts remain available in their tabs."
                    : "Try another approval status."
                }
                icon={<CheckCircle className="shrink-0" aria-hidden />}
                className="border border-dashed border-border/80 bg-transparent py-12 dark:border-border/50"
              />
            ) : (
              <ul className="space-y-2">
                {filteredDrafts.map((draft) => {
                  const selected = draft.id === selectedDraftId;
                  return (
                    <li key={draft.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedDraftId(draft.id)}
                        className={cn(
                          "w-full cursor-pointer rounded-xl border p-4 text-left transition-colors duration-interaction hover:bg-glass/60",
                          selected
                            ? "glass-pill border-glass-border bg-glass"
                            : "glass-pill border-glass-border bg-glass/50",
                          !selected && "hover:border-glass-border",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <p className="truncate text-base font-semibold text-atmospheric-grey">
                                {draft.conversation.customer_name}
                              </p>
                              <span
                                className={cn(
                                  "risk-heat-pin shrink-0 text-sm",
                                  getRiskHeatPinClass(draft.conversation.risk_score),
                                )}
                              >
                                {draft.conversation.risk_score}
                              </span>
                            </div>
                            <p className="mt-2 line-clamp-2 text-base leading-relaxed text-muted">
                              {conversationMessageText(draft.conversation)}
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Badge
                                variant="status"
                                value={draft.approval_status}
                                label={STATUS_LABELS[draft.approval_status]}
                              />
                              <span className="ml-auto text-base font-bold tabular-nums text-status-positive">
                                {formatCurrency(
                                  draft.conversation.estimated_value,
                                )}
                              </span>
                            </div>
                            <p className="mt-2 inline-flex items-center gap-2 text-sm text-muted">
                              <Clock className="h-4 w-4 shrink-0" aria-hidden />
                              {formatRelativeTime(draft.created_at)}
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

        <section className="app-glass-card flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl">
          {!selectedDraft ? (
            <ExecutiveEmptyState
              title={
                counts.pending === 0
                  ? "Inbox Zero. Your workspace is optimized."
                  : "Select a draft to review"
              }
              description={
                counts.pending === 0
                  ? "No pending approvals. Choose another tab to review history."
                  : "Choose a draft from the queue to inspect the customer message, classification, and AI reply."
              }
              icon={<CheckCircle className="shrink-0" aria-hidden />}
              className="m-4 min-h-[420px] flex-1 rounded-xl border border-dashed border-border/80 dark:border-border/50"
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6 pb-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="nexus-meta text-muted">
                      Review Draft
                    </p>
                    <h1 className="mt-2 nexus-app-title text-foreground">
                      {selectedDraft.conversation.customer_name}
                    </h1>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge
                      variant="status"
                      value={selectedDraft.approval_status}
                      label={STATUS_LABELS[selectedDraft.approval_status]}
                    />
                    <span
                      className={cn(
                        "risk-heat-pin text-base",
                        getRiskHeatPinClass(selectedDraft.conversation.risk_score),
                      )}
                    >
                      Risk {selectedDraft.conversation.risk_score}
                    </span>
                    <span className="rounded-lg border border-status-positive-border bg-status-positive-surface px-3 py-2 font-mono text-lg font-bold tabular-nums text-status-positive">
                      {formatCurrency(selectedDraft.conversation.estimated_value)}
                    </span>
                    <span className="rounded-lg border border-status-neutral-border bg-status-neutral-surface px-3 py-2 text-sm font-medium tabular-nums text-status-neutral">
                      Confidence:{" "}
                      {Math.round(
                        (selectedDraft.conversation.confidence > 1
                          ? selectedDraft.conversation.confidence
                          : (selectedDraft.conversation.confidence || 0.95) * 100),
                      )}
                      %
                    </span>
                  </div>
                </div>

                <section className="glass-pill rounded-xl p-5">
                  <h2 className="nexus-meta text-muted">
                    Original Message
                  </h2>
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-base text-muted">
                    <span className="font-semibold text-atmospheric-grey">
                      {selectedDraft.conversation.customer_name}
                    </span>
                    <span className="glass-pill rounded-lg px-2 py-1 font-mono text-xs capitalize text-muted">
                      {selectedDraft.conversation.source}
                    </span>
                  </div>
                  <div className="glass-pill mt-4 rounded-xl p-4 font-mono text-sm leading-relaxed text-atmospheric-grey">
                    {conversationMessageText(selectedDraft.conversation)}
                  </div>
                </section>

                <section className="glass-pill rounded-xl p-5">
                  <h2 className="nexus-meta text-muted">
                    AI Classification
                  </h2>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <MiniCard
                      label="Intent"
                      value={intentLabel(selectedDraft.conversation.intent)}
                      accent="text-status-positive"
                    />
                    <MiniCard
                      label="Urgency"
                      value={urgencyLabel(selectedDraft.conversation.urgency)}
                      accent={
                        selectedDraft.conversation.urgency === "critical"
                          ? "text-status-critical"
                          : selectedDraft.conversation.urgency === "high"
                            ? "text-status-warning"
                            : "text-status-caution"
                      }
                    />
                    <MiniCard
                      label="Risk Score"
                      value={selectedDraft.conversation.risk_score}
                      accent={getRiskColor(selectedDraft.conversation.risk_score)}
                    />
                    <MiniCard
                      label="Estimated Value"
                      value={formatCurrency(
                        selectedDraft.conversation.estimated_value,
                      )}
                      accent="text-status-positive"
                    />
                  </div>
                </section>

                <section className="glass-pill rounded-xl p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="inline-flex items-center gap-2 nexus-meta text-muted">
                      <Bot className="h-5 w-5 text-nexus-discovery" aria-hidden />
                      AI Draft Reply
                    </h2>
                    <span className="rounded-lg border border-status-neutral-border bg-status-neutral-surface px-2 py-1 font-mono text-xs font-semibold text-status-neutral">
                      {toneLabel(selectedDraft.tone)}
                    </span>
                  </div>
                  <textarea
                    value={selectedText}
                    onChange={(e) =>
                      setEditedDraftText((current) => ({
                        ...current,
                        [selectedDraft.id]: e.target.value,
                      }))
                    }
                    rows={10}
                    className="glass-input mt-5 w-full resize-none p-4 font-mono text-sm leading-relaxed text-atmospheric-grey outline-none transition-colors placeholder:text-muted"
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
                    <span>Tone: {toneLabel(selectedDraft.tone)}</span>
                    <span className="tabular-nums">
                      {selectedText.length} characters
                    </span>
                  </div>
                </section>
              </div>

              <div className="approval-action-bar flex flex-wrap items-center justify-between gap-4 px-6 py-4">
                <div className="flex min-w-0 items-center gap-3 text-base text-muted">
                  <DollarSign
                    className="h-5 w-5 shrink-0 text-status-positive"
                    aria-hidden
                  />
                  <span>
                    Decision impacts{" "}
                    <strong className="font-bold text-status-positive">
                      {formatCurrency(
                        selectedDraft.conversation.estimated_value,
                      )}
                    </strong>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setRejectingDraft(selectedDraft);
                      setRejectionReason("");
                    }}
                    disabled={
                      actionDraftId === selectedDraft.id ||
                      selectedDraft.approval_status === "rejected"
                    }
                  >
                    <XCircle className="h-5 w-5 shrink-0" aria-hidden />
                    Reject
                  </Button>
                  <Button
                    variant="primary"
                    className="px-6"
                    onClick={() => void handleApprove(selectedDraft)}
                    disabled={
                      actionDraftId === selectedDraft.id ||
                      selectedDraft.approval_status === "approved"
                    }
                  >
                    {actionDraftId === selectedDraft.id ? (
                      <Spinner className="h-5 w-5" label="Approving draft" />
                    ) : (
                      <Send className="h-5 w-5 shrink-0" aria-hidden />
                    )}
                    Approve & Send
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {rejectingDraft ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 p-4">
          <div className="app-glass-card w-full max-w-lg rounded-xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  Reject draft
                </h2>
                <p className="mt-2 text-base text-muted">
                  Add feedback so the team can improve the next AI reply.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRejectingDraft(null)}
                className="glass-pill inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-glass hover:text-atmospheric-grey"
                aria-label="Close rejection modal"
              >
                <XCircle className="h-6 w-6" aria-hidden />
              </button>
            </div>
            <label className="mt-6 block text-base font-semibold text-atmospheric-grey">
              Rejection reason
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={5}
                className="glass-input mt-3 w-full resize-none p-4 font-mono text-sm text-atmospheric-grey outline-none transition-colors placeholder:text-muted focus:border-status-critical-border focus:ring-1 focus:ring-status-critical-border/40"
                placeholder="What should change before this reply is sent?"
              />
            </label>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button variant="ghost" onClick={() => setRejectingDraft(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleReject()}
                disabled={
                  rejectionReason.trim() === "" ||
                  actionDraftId === rejectingDraft.id
                }
              >
                {actionDraftId === rejectingDraft.id ? (
                  <Spinner className="h-5 w-5" label="Rejecting draft" />
                ) : null}
                Submit Rejection
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
