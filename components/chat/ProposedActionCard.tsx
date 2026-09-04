"use client";

import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import type { ChatProposedAction } from "@/types";

function statusCopy(status: ChatProposedAction["status"]): string {
  switch (status) {
    case "pending":
      return "Waiting for confirmation";
    case "confirmed":
      return "Confirmed";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    case "failed":
      return "Could not apply";
    default: {
      const _never: never = status;
      return String(_never);
    }
  }
}

export function ProposedActionCard({
  action,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  action: ChatProposedAction;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const pending = action.status === "pending";
  const confirmLabel = action.kind === "set_employment_status"
    ? "Confirm status"
    : "Confirm stage";
  const detail = action.job_title
    ? `${action.subject_name} · ${action.job_title}`
    : action.subject_name;

  return (
    <div className="glass-pill w-full rounded-xl border-glass-border bg-glass/70 p-4 text-sm text-atmospheric-grey">
      <p className="font-medium text-foreground">{action.summary}</p>
      <p className="mt-1 text-xs text-muted">
        {detail}: {action.from_label} → {action.to_label}
      </p>
      <p className="mt-2 text-xs text-muted">{statusCopy(action.status)}</p>
      {error || action.error ? (
        <p className="mt-2 font-mono text-xs text-status-warning" role="alert">
          {error || action.error}
        </p>
      ) : null}
      {pending ? (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={action.requires_destructive_confirm ? "destructive" : "primary"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? <Spinner className="h-4 w-4" label={confirmLabel} /> : null}
            {confirmLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
