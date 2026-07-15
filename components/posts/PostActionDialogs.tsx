"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Send, X } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { PLATFORM_LABELS } from "@/lib/posts/types";
import type { Platform } from "@/lib/posts/types";
import { PlatformIcon, PRIMARY_BTN, SECONDARY_BTN } from "./shared";

function DialogShell({
  title,
  icon,
  onCancel,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-glass-border bg-glass p-6 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-atmospheric-grey">
            <span className="text-nexus-approval">{icon}</span>
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="text-muted transition-colors hover:text-atmospheric-grey"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Local datetime string (`YYYY-MM-DDTHH:mm`) a few minutes in the future. */
function defaultLocalDateTime(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleDialog({
  initialIso,
  busy,
  onConfirm,
  onCancel,
}: {
  initialIso?: string | null;
  busy?: boolean;
  onConfirm: (iso: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<string>(() => {
    if (initialIso) {
      const d = new Date(initialIso);
      if (!Number.isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    }
    return defaultLocalDateTime();
  });
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      setError("Pick a valid date and time.");
      return;
    }
    if (d.getTime() <= Date.now()) {
      setError("Choose a time in the future.");
      return;
    }
    onConfirm(d.toISOString());
  }

  return (
    <DialogShell title="Schedule post" icon={<CalendarClock className="h-5 w-5" />} onCancel={onCancel}>
      <label htmlFor="schedule-at" className="mb-2 block text-sm font-medium text-atmospheric-grey">
        Publish at
      </label>
      <input
        id="schedule-at"
        type="datetime-local"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        className="glass-input w-full px-3 py-2.5 text-sm text-atmospheric-grey outline-none"
      />
      {error ? (
        <p className="mt-2 text-xs text-status-critical">{error}</p>
      ) : (
        <p className="mt-2 text-xs text-muted">
          The scheduler publishes the post automatically at this time.
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={SECONDARY_BTN} disabled={busy}>
          Cancel
        </button>
        <button type="button" onClick={confirm} className={PRIMARY_BTN} disabled={busy}>
          {busy ? <Spinner className="h-4 w-4" label="Scheduling" /> : <CalendarClock className="h-4 w-4" aria-hidden />}
          Schedule
        </button>
      </div>
    </DialogShell>
  );
}

export function ConfirmPublishDialog({
  platforms,
  captionPreview,
  busy,
  onConfirm,
  onCancel,
}: {
  platforms: Platform[];
  captionPreview: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <DialogShell title="Publish now" icon={<Send className="h-5 w-5" />} onCancel={onCancel}>
      <p className="text-sm text-muted">This posts immediately to:</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {platforms.map((p) => (
          <span
            key={p}
            className="inline-flex items-center gap-1.5 rounded-lg border border-glass-border bg-surface-muted px-2.5 py-1 text-sm text-atmospheric-grey"
          >
            <PlatformIcon platform={p} />
            {PLATFORM_LABELS[p]}
          </span>
        ))}
      </div>
      {captionPreview ? (
        <p className="mt-4 line-clamp-3 rounded-lg border border-glass-border bg-surface-muted px-3 py-2 text-sm text-muted">
          {captionPreview}
        </p>
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={SECONDARY_BTN} disabled={busy}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} className={PRIMARY_BTN} disabled={busy}>
          {busy ? <Spinner className="h-4 w-4" label="Publishing" /> : <Send className="h-4 w-4" aria-hidden />}
          Publish now
        </button>
      </div>
    </DialogShell>
  );
}
