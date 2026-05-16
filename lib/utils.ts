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
  if (score >= 80) return "text-[#8B1A1A] dark:text-red-400";
  if (score >= 60) return "text-[#7A4200] dark:text-orange-400";
  if (score >= 40) return "text-yellow-500 dark:text-yellow-400";
  return "text-[#1B6B3A] dark:text-green-400";
}

/** Full pill styles for urgency badges */
export function getUrgencyBadgeClass(urgency: string): string {
  switch (urgency.toLowerCase()) {
    case "critical":
      return "border-red-500/50 bg-red-500/15 text-[#8B1A1A]";
    case "high":
      return "border-orange-500/40 bg-orange-500/10 text-[#7A4200]";
    case "medium":
      return "border-yellow-500/40 bg-yellow-500/10 text-yellow-300";
    case "low":
      return "border-green-500/40 bg-green-500/10 text-[#1B6B3A]";
    default:
      return "border-gray-600 bg-gray-800 text-gray-400";
  }
}
