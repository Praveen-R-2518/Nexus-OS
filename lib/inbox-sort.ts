import type { Conversation } from "@/types";

export const INBOX_SORT_OPTIONS = [
  { value: "risk_score", label: "Highest risk" },
  { value: "estimated_value", label: "Highest value" },
  { value: "created_at", label: "Newest first" },
] as const;

export type InboxSort = (typeof INBOX_SORT_OPTIONS)[number]["value"];
type SortableConversation = Pick<Conversation, InboxSort>;

export function sortInbox<T extends SortableConversation>(
  rows: readonly T[],
  sort: InboxSort,
): T[] {
  return [...rows].sort((a, b) => {
    if (sort !== "created_at") {
      const difference = (b[sort] ?? 0) - (a[sort] ?? 0);
      if (difference) return difference;
    }
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });
}
