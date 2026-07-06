import type { Conversation } from "@/types";

type DeepLinkInput = Pick<
  Conversation,
  "source" | "external_permalink" | "external_thread_id" | "customer_email"
>;

/**
 * Resolve a platform-native inbox deep link for "open real inbox", or `null` when no trustworthy
 * link exists (the UI renders a graceful "native inbox link unavailable" state for `null`).
 *
 * Correctness rules (Task 2):
 * - WhatsApp: ALWAYS target the CUSTOMER number, derived from the stored customer phone — never the
 *   stored permalink (which could be the business number). `wa.me/<customer>` opens a chat with them.
 * - Instagram/Facebook: a message `mid` is NOT a thread id, so we never synthesize `.../t/<mid>`.
 *   Prefer a trustworthy stored permalink (e.g. `ig.me/m/<username>`); otherwise return `null`.
 */
export function resolveExternalInboxUrl(
  conversation: DeepLinkInput,
): string | null {
  const permalink = conversation.external_permalink?.trim() ?? "";
  const hasPermalink = /^https?:\/\//i.test(permalink);
  const customerRef = conversation.customer_email?.trim() ?? "";

  switch (conversation.source) {
    case "whatsapp": {
      // Derive from the customer number directly; ignore any stored permalink to avoid ever
      // linking to the business number.
      const phone = customerRef.replace(/\D/g, "");
      return phone ? `https://wa.me/${phone}` : null;
    }
    case "instagram": {
      if (hasPermalink) return permalink;
      // Best-effort: ig.me/m/<username> reliably opens a chat with the customer.
      if (customerRef && !/^\d+$/.test(customerRef)) {
        const user = customerRef.replace(/^@/, "");
        return `https://ig.me/m/${encodeURIComponent(user)}`;
      }
      return null;
    }
    case "facebook": {
      // Only a real, stored thread permalink is trustworthy; a PSID/mid is not. No link → null.
      if (hasPermalink) return permalink;
      return null;
    }
    default:
      return null;
  }
}

export function externalInboxLabel(source: Conversation["source"]): string {
  switch (source) {
    case "whatsapp":
      return "WhatsApp";
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook Messenger";
    default:
      return "native inbox";
  }
}

export function supportsExternalInbox(source: Conversation["source"]): boolean {
  return source === "whatsapp" || source === "instagram" || source === "facebook";
}
