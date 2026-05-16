"use client";

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
  fetchConversations,
  fetchReplyDrafts,
  rejectReply,
} from "@/lib/api";
import {
  cn,
  conversationMessageText,
  formatCurrency,
  formatRelativeTime,
  getRiskColor,
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
    <div className="rounded-xl border border-white/10 glass-panel p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-atmospheric-grey/60">
        {label}
      </p>
      <p className={cn("mt-2 text-xl font-semibold tabular-nums", accent)}>
        {value}
      </p>
    </div>
  );
}

export default function ApprovalPage() {
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ApprovalFilter>("pending");
  const [editedDraftText, setEditedDraftText] = useState<Record<string, string>>(
    {},
  );
  const [actionDraftId, setActionDraftId] = useState<string | null>(null);
  const [rejectingDraft, setRejectingDraft] = useState<DraftItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((nextToast: Toast) => {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const loadDrafts = useCallback(async () => {
    setError(null);
    try {
      let draftRows: ReplyDraftWithConversation[];
      try {
        draftRows = await fetchReplyDrafts();
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to load reply drafts";
        setError(msg);
        setDrafts([]);
        return;
      }

      let conversations: Conversation[] = [];
      try {
        conversations = await fetchConversations();
      } catch {
        conversations = [];
      }

      const merged = sortDrafts(
        mergeDraftsWithConversations(draftRows, conversations),
      );
      setDrafts(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load approvals");
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

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
    ? editedDraftText[selectedDraft.id] ?? selectedDraft.draft_text
    : "";

  async function optimisticallyMoveDraft(
    draft: DraftItem,
    status: ReplyDraft["approval_status"],
    action: () => Promise<void>,
    successMessage: string,
  ) {
    const previousDrafts = drafts;
    const previousFilter = activeFilter;
    const previousSelectedDraftId = selectedDraftId;
    const nowIso = new Date().toISOString();
    const conversationStatus: Conversation["status"] =
      status === "pending" ? "draft_ready" : status;

    setActionDraftId(draft.id);
    setActiveFilter(status);
    setSelectedDraftId(draft.id);
    setDrafts((current) =>
      sortDrafts(
        current.map((item) =>
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
    } catch (e) {
      setDrafts(previousDrafts);
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
      "Reply queued for sending ✓",
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
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-atmospheric-grey/60">
        <Spinner className="h-8 w-8" label="Loading approvals" />
        <p className="text-sm">Loading approval queue...</p>
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
            "fixed right-6 top-6 z-50 rounded-xl border px-4 py-3 text-sm shadow-2xl glass-panel",
            toast.kind === "success"
              ? "border-trajectory-blue/40 bg-trajectory-blue/10 text-trajectory-blue"
              : "border-red-500/40 bg-red-500/10 text-red-200",
          )}
        >
          {toast.message}
        </div>
      ) : null}

      <div className="flex h-[calc(100vh-6rem)] min-h-[620px] gap-4">
        <aside className="flex w-[400px] shrink-0 flex-col overflow-hidden rounded-xl border border-white/10 glass-panel">
          <div className="border-b border-white/10 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-atmospheric-grey/60">
              Approval Queue
            </p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <p className="text-2xl font-semibold text-atmospheric-grey">
                  {counts.pending} pending
                </p>
                <p className="mt-1 text-sm text-atmospheric-grey/60">
                  AI replies waiting on a founder decision
                </p>
              </div>
              <div className="rounded-lg border border-trajectory-blue/30 bg-trajectory-blue/10 px-3 py-2 text-right">
                <p className="text-xs text-trajectory-blue">At stake</p>
                <p className="text-sm font-semibold tabular-nums text-trajectory-blue">
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

          <div className="border-b border-white/10 p-3">
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((filter) => {
                const active = activeFilter === filter.value;
                return (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setActiveFilter(filter.value)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-trajectory-blue/50 bg-trajectory-blue/15 text-trajectory-blue"
                        : "border-white/10 bg-white/5 text-atmospheric-grey/80 hover:border-white/20",
                    )}
                  >
                    {filter.label}
                    <span
                      className={cn(
                        "rounded-md px-1 py-0.5 text-[10px] tabular-nums",
                        active ? "bg-trajectory-blue/25" : "bg-black/40",
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
                className="border-white/10 bg-transparent py-12"
              />
            ) : (
              <ul className="space-y-2">
                {filteredDrafts.map((draft) => {
                  const selected = draft.id === selectedDraftId;
                  const highRisk = draft.conversation.risk_score >= 80;
                  return (
                    <li key={draft.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedDraftId(draft.id)}
                        className={cn(
                          "w-full rounded-lg border border-white/10 p-3 text-left transition-colors hover:border-white/20 hover:bg-white/5",
                          selected &&
                            "border-trajectory-blue/40 bg-white/10 ring-1 ring-trajectory-blue/30",
                          highRisk &&
                            !selected &&
                            "border-l-4 border-l-red-500/50",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate font-semibold text-atmospheric-grey">
                                {draft.conversation.customer_name}
                              </p>
                              <span
                                className={cn(
                                  "shrink-0 text-base font-bold tabular-nums",
                                  getRiskColor(draft.conversation.risk_score),
                                )}
                              >
                                {draft.conversation.risk_score}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm text-atmospheric-grey/60">
                              {conversationMessageText(draft.conversation)}
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                              <Badge
                                variant="status"
                                value={draft.approval_status}
                                label={STATUS_LABELS[draft.approval_status]}
                              />
                              <span className="ml-auto text-sm font-semibold tabular-nums text-trajectory-blue">
                                {formatCurrency(
                                  draft.conversation.estimated_value,
                                )}
                              </span>
                            </div>
                            <p className="mt-2 inline-flex items-center gap-1 text-xs text-atmospheric-grey/40">
                              <Clock className="h-3 w-3" aria-hidden />
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

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 glass-panel">
          {!selectedDraft ? (
            <EmptyState
              title={
                counts.pending === 0
                  ? "All caught up! No pending approvals."
                  : "Select a draft to review"
              }
              description="Choose a draft from the queue to inspect the customer message, classification, and AI reply."
              icon={<CheckCircle />}
              className="m-4 min-h-[420px] flex-1 border-white/10"
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 pb-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-atmospheric-grey/60">
                      Review Draft
                    </p>
                    <h1 className="mt-1 text-2xl font-semibold text-atmospheric-grey">
                      {selectedDraft.conversation.customer_name}
                    </h1>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="status"
                      value={selectedDraft.approval_status}
                      label={STATUS_LABELS[selectedDraft.approval_status]}
                    />
                    <span
                      className={cn(
                        "rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-lg font-bold tabular-nums",
                        getRiskColor(selectedDraft.conversation.risk_score),
                      )}
                    >
                      Risk {selectedDraft.conversation.risk_score}
                    </span>
                    <span className="rounded-lg border border-trajectory-blue/30 bg-trajectory-blue/10 px-3 py-1.5 text-lg font-bold tabular-nums text-trajectory-blue">
                      {formatCurrency(selectedDraft.conversation.estimated_value)}
                    </span>
                    <span className="rounded-full border border-trajectory-blue/30 bg-trajectory-blue/10 px-3 py-1.5 text-sm font-medium tabular-nums text-trajectory-blue">
                      Confidence: {Math.round((selectedDraft.conversation.confidence || 0.95) * 100)}%
                    </span>
                  </div>
                </div>

                <section className="rounded-xl border border-white/10 glass-panel p-4">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-atmospheric-grey/60">
                    Original Message
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-atmospheric-grey/80">
                    <span className="font-medium text-atmospheric-grey">
                      {selectedDraft.conversation.customer_name}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs capitalize text-atmospheric-grey/60">
                      {selectedDraft.conversation.source}
                    </span>
                  </div>
                  <div className="mt-4 rounded-xl bg-white/5 p-4 font-mono text-sm leading-relaxed text-atmospheric-grey">
                    {conversationMessageText(selectedDraft.conversation)}
                  </div>
                </section>

                <section className="rounded-xl border border-white/10 glass-panel p-4">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-atmospheric-grey/60">
                    AI Classification
                  </h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <MiniCard
                      label="Intent"
                      value={intentLabel(selectedDraft.conversation.intent)}
                      accent="text-trajectory-blue"
                    />
                    <MiniCard
                      label="Urgency"
                      value={urgencyLabel(selectedDraft.conversation.urgency)}
                      accent={
                        selectedDraft.conversation.urgency === "critical"
                          ? "text-red-300"
                          : selectedDraft.conversation.urgency === "high"
                            ? "text-orange-300"
                            : "text-yellow-300"
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
                      accent="text-trajectory-blue"
                    />
                  </div>
                </section>

                <section className="rounded-xl border border-white/10 glass-panel p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-atmospheric-grey/60">
                      <Bot className="h-4 w-4 text-trajectory-blue" aria-hidden />
                      AI Draft Reply
                    </h2>
                    <span className="rounded-full border border-trajectory-blue/30 bg-trajectory-blue/10 px-2 py-0.5 text-xs font-medium text-trajectory-blue">
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
                    className="glass-input mt-4 w-full resize-none rounded-xl p-4 text-sm leading-relaxed"
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-atmospheric-grey/60">
                    <span>Tone: {toneLabel(selectedDraft.tone)}</span>
                    <span className="tabular-nums">
                      {selectedText.length} characters
                    </span>
                  </div>
                </section>
              </div>

              <div className="sticky bottom-0 border-t border-white/10 glass-panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-atmospheric-grey/60">
                    <DollarSign className="h-4 w-4 text-trajectory-blue" aria-hidden />
                    <span>
                      Decision impacts{" "}
                      <strong className="text-trajectory-blue">
                        {formatCurrency(
                          selectedDraft.conversation.estimated_value,
                        )}
                      </strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
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
                      className="glass-button inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-red-300 transition-all duration-150 hover:text-red-200 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                    >
                      <XCircle className="h-4 w-4" aria-hidden />
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleApprove(selectedDraft)}
                      disabled={
                        actionDraftId === selectedDraft.id ||
                        selectedDraft.approval_status === "approved"
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-trajectory-blue px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-blue-600 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                    >
                      {actionDraftId === selectedDraft.id ? (
                        <Spinner className="h-4 w-4" label="Approving draft" />
                      ) : (
                        <Send className="h-4 w-4" aria-hidden />
                      )}
                      Approve & Send
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {rejectingDraft ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 glass-panel p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-atmospheric-grey">
                  Reject draft
                </h2>
                <p className="mt-1 text-sm text-atmospheric-grey/60">
                  Add feedback so the team can improve the next AI reply.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRejectingDraft(null)}
                className="rounded-lg p-1 text-atmospheric-grey/60 transition-colors hover:bg-white/10 hover:text-atmospheric-grey"
                aria-label="Close rejection modal"
              >
                <XCircle className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <label className="mt-5 block text-sm font-medium text-atmospheric-grey">
              Rejection reason
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={5}
                className="glass-input mt-2 w-full resize-none rounded-xl p-3 text-sm"
                placeholder="What should change before this reply is sent?"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectingDraft(null)}
                className="glass-button rounded-lg px-4 py-2 text-sm font-medium text-atmospheric-grey/80 hover:text-atmospheric-grey"
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
                className="inline-flex items-center gap-2 rounded-lg bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionDraftId === rejectingDraft.id ? (
                  <Spinner className="h-4 w-4" label="Rejecting draft" />
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
