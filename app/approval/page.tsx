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
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
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
    <div className="surface-card border border-border p-5 dark:border-border">
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

  const {
    data: draftRows = [],
    isPending: draftsPending,
    error: draftsErr,
  } = useQuery({
    queryKey: queryKeys.replyDrafts(),
    queryFn: () => replyDraftsQuery(),
    staleTime: 30_000,
  });

  const { data: convRows = [] } = useQuery({
    queryKey: queryKeys.conversations(100),
    queryFn: () => conversationsQuery(100),
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
    return sortDrafts(visible);
  }, [activeFilter, drafts]);

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
      void queryClient.invalidateQueries({ queryKey: queryKeys.replyDrafts() });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversations(100),
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
            "fixed right-6 top-6 z-50 rounded-xl border border-border bg-white px-5 py-4 font-mono text-sm dark:border-border/60 dark:bg-surface-card",
            toast.kind === "success"
              ? "border-status-positive-border bg-status-positive-surface text-status-positive"
              : "border-status-critical-border bg-status-critical-surface text-status-critical",
          )}
        >
          {toast.message}
        </div>
      ) : null}

      <div className="flex min-h-[560px] flex-1 flex-col gap-4 lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-selectable-edge bg-white dark:bg-surface-card lg:w-[420px]">
          <div className="hairline-b p-5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-muted">
              Approval Queue
            </p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p className="font-sans text-3xl font-black tabular-nums text-atmospheric-grey">
                  {counts.pending} pending
                </p>
                <p className="mt-2 font-mono text-xs text-muted">
                  AI replies waiting on a founder decision
                </p>
              </div>
              <div className="rounded-xl border border-status-warning-border bg-status-warning-surface px-4 py-3 text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-status-warning">
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
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setActiveFilter(filter.value)}
                    className={cn(
                      "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wide transition-colors duration-interaction",
                      active
                        ? "border-selectable-edge-selected bg-status-positive-surface text-status-positive"
                        : "border-selectable-edge bg-surface-card text-slate-600 hover:border-selectable-edge-hover hover:bg-surface-muted dark:text-slate-300",
                    )}
                  >
                    {filter.label}
                    <span
                      className={cn(
                        "inline-flex min-w-[1.75rem] items-center justify-center rounded-lg border px-2 py-0.5 font-mono text-xs tabular-nums",
                        active
                          ? "border-selectable-edge-selected bg-status-positive-surface font-bold text-status-positive"
                          : "border-selectable-edge bg-surface-muted font-medium text-slate-700 dark:text-slate-200",
                      )}
                    >
                      {counts[filter.value]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {filteredDrafts.length === 0 ? (
              <EmptyState
                title={
                  activeFilter === "pending"
                    ? "All caught up! No pending approvals."
                    : "No drafts in this tab"
                }
                description={
                  activeFilter === "pending"
                    ? "Approved and rejected drafts remain available in their tabs."
                    : "Try another approval status."
                }
                icon={<CheckCircle />}
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
                          "w-full cursor-pointer rounded-xl border bg-white p-4 text-left transition-colors duration-interaction hover:bg-ref-mint dark:bg-surface-elevated dark:hover:bg-surface-muted",
                          selected
                            ? "border-selectable-edge-selected bg-ref-ice dark:bg-surface-muted"
                            : "border-selectable-edge",
                          !selected && "hover:border-selectable-edge-hover",
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

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-selectable-edge bg-white dark:bg-surface-card">
          {!selectedDraft ? (
            <EmptyState
              title={
                counts.pending === 0
                  ? "All caught up! No pending approvals."
                  : "Select a draft to review"
              }
              description="Choose a draft from the queue to inspect the customer message, classification, and AI reply."
              icon={<CheckCircle />}
              className="m-4 min-h-[420px] flex-1 rounded-xl border border-dashed border-border/80 dark:border-border/50"
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6 pb-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-brand text-muted">
                      Review Draft
                    </p>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
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
                    <span className="rounded-lg border border-status-neutral-border bg-status-neutral-surface px-3 py-2 font-mono text-xs font-semibold uppercase tracking-wide tabular-nums text-status-neutral">
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

                <section className="rounded-xl border border-border bg-white p-5 dark:border-border/70 dark:bg-surface-card">
                  <h2 className="text-xs font-bold uppercase tracking-brand text-muted">
                    Original Message
                  </h2>
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-base text-muted">
                    <span className="font-semibold text-atmospheric-grey">
                      {selectedDraft.conversation.customer_name}
                    </span>
                    <span className="rounded-lg border border-border bg-surface-muted px-2 py-1 font-mono text-xs capitalize text-muted">
                      {selectedDraft.conversation.source}
                    </span>
                  </div>
                  <div className="mt-4 rounded-xl border border-border bg-surface-input p-4 font-mono text-sm leading-relaxed text-atmospheric-grey dark:border-border/60">
                    {conversationMessageText(selectedDraft.conversation)}
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-white p-5 dark:border-border/70 dark:bg-surface-card">
                  <h2 className="text-xs font-bold uppercase tracking-brand text-muted">
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

                <section className="rounded-xl border border-border bg-white p-5 dark:border-border/70 dark:bg-surface-card">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-brand text-muted">
                      <Bot className="h-5 w-5 text-status-positive" aria-hidden />
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
                    className="mt-5 w-full resize-none rounded-xl border border-border bg-surface-input p-4 font-mono text-sm leading-relaxed text-atmospheric-grey outline-none transition-colors placeholder:text-muted focus:border-ref-cta focus:ring-1 focus:ring-ref-cta dark:border-border/60 dark:focus:border-border-strong"
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
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingDraft(selectedDraft);
                      setRejectionReason("");
                    }}
                    disabled={
                      actionDraftId === selectedDraft.id ||
                      selectedDraft.approval_status === "rejected"
                    }
                    className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 border-status-critical-border bg-transparent px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-wide text-status-critical transition-colors duration-interaction hover:bg-status-critical-surface disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <XCircle className="h-5 w-5 shrink-0" aria-hidden />
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleApprove(selectedDraft)}
                    disabled={
                      actionDraftId === selectedDraft.id ||
                      selectedDraft.approval_status === "approved"
                    }
                    className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-ref-cta px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-[#f3f6f1] transition-opacity duration-interaction hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:border-border/60 dark:bg-[#153d5c]"
                  >
                    {actionDraftId === selectedDraft.id ? (
                      <Spinner className="h-5 w-5" label="Approving draft" />
                    ) : (
                      <Send className="h-5 w-5 shrink-0" aria-hidden />
                    )}
                    Approve & Send
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {rejectingDraft ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface-elevated p-6 dark:border-border/60">
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
                className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-border text-muted transition-colors hover:bg-ref-mint hover:text-atmospheric-grey dark:border-border/60 dark:hover:bg-surface-elevated"
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
                className="mt-3 w-full resize-none border border-border bg-surface-input p-4 font-mono text-sm text-atmospheric-grey outline-none transition-colors placeholder:text-muted focus:border-status-critical-border focus:ring-1 focus:ring-status-critical-border/40 dark:border-border"
                placeholder="What should change before this reply is sent?"
              />
            </label>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setRejectingDraft(null)}
                className="inline-flex min-h-11 cursor-pointer items-center border border-border bg-surface-muted px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-wide text-muted transition-colors hover:border-ref-cta hover:bg-white dark:border-border dark:hover:bg-surface-elevated"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleReject()}
                disabled={
                  rejectionReason.trim() === "" ||
                  actionDraftId === rejectingDraft.id
                }
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-status-critical-border bg-status-critical-surface px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-wide text-status-critical transition-colors hover:bg-status-critical-surface/80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionDraftId === rejectingDraft.id ? (
                  <Spinner className="h-5 w-5" label="Rejecting draft" />
                ) : null}
                Submit Rejection
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
