import { clsx, type ClassValue } from "clsx";
import { formatDistanceToNow } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/** Prefer DB column `message`, then legacy/mock `raw_message` (non-empty wins). */
export function conversationMessageText(c: {
  raw_message?: string | null | undefined;
  message?: string | null | undefined;
}): string {
  const m = c.message;
  const r = c.raw_message;
  if (typeof m === "string" && m.trim() !== "") return m;
  if (typeof r === "string" && r.trim() !== "") return r;
  if (typeof m === "string") return m;
  if (typeof r === "string") return r;
  return "";
}

export function conversationMessagePreview(c: {
  raw_message?: string | null | undefined;
  message?: string | null | undefined;
}): string {
  const line = conversationMessageText(c).replace(/\s+/g, " ").trim();
  return line.length > 0 ? line : "—";
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return "unknown time";
  }
  return formatDistanceToNow(date, { addSuffix: true });
}

export function getRiskColor(score: number): string {
  if (score >= 80) return "text-status-critical";
  if (score >= 60) return "text-status-warning";
  if (score >= 40) return "text-status-caution";
  return "text-status-positive";
}

/** Heat-map style container for risk scores (inbox / lists). */
export function getRiskHeatPinClass(score: number): string {
  if (score >= 80) {
    return "border-status-critical-border bg-status-critical-surface text-status-critical shadow-glow-critical";
  }
  if (score >= 60) {
    return "border-status-warning-border bg-status-warning-surface text-status-warning";
  }
  if (score >= 40) {
    return "border-status-caution-border bg-status-caution-surface text-status-caution";
  }
  return "border-status-positive-border bg-status-positive-surface text-status-positive";
}

/** Full pill styles for urgency badges */
export function getUrgencyBadgeClass(urgency: string): string {
  switch (urgency.toLowerCase()) {
    case "critical":
      return "border-status-critical-border bg-status-critical-surface text-status-critical";
    case "high":
      return "border-status-warning-border bg-status-warning-surface text-status-warning";
    case "medium":
      return "border-status-caution-border bg-status-caution-surface text-status-caution";
    case "low":
      return "border-status-positive-border bg-status-positive-surface text-status-positive";
    default:
      return "border-border-strong bg-surface-muted text-slate-600 dark:text-slate-400";
  }
}
