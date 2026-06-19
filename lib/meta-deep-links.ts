import type { Conversation } from "@/types";

type DeepLinkInput = Pick<
  Conversation,
  "source" | "external_permalink" | "external_thread_id" | "customer_email"
>;

/**
 * Resolve a platform-native inbox deep link for "open real inbox".
 * Prefers stored permalink; falls back to thread id patterns.
 */
export function resolveExternalInboxUrl(
  conversation: DeepLinkInput,
): string | null {
  const permalink = conversation.external_permalink?.trim();
  if (permalink && /^https?:\/\//i.test(permalink)) {
    return permalink;
  }

  const threadId = conversation.external_thread_id?.trim() ?? "";
  const customerRef = conversation.customer_email?.trim() ?? "";

  switch (conversation.source) {
    case "whatsapp": {
      const phone = customerRef.replace(/\D/g, "");
      if (phone) return `https://wa.me/${phone}`;
      return null;
    }
    case "instagram": {
      if (threadId.startsWith("ig:")) {
        const id = threadId.slice(3);
        if (id) return `https://www.instagram.com/direct/t/${encodeURIComponent(id)}`;
      }
      if (customerRef && !/^\d+$/.test(customerRef)) {
        const user = customerRef.replace(/^@/, "");
        return `https://ig.me/m/${encodeURIComponent(user)}`;
      }
      return null;
    }
    case "facebook": {
      if (threadId.startsWith("fb:")) {
        const id = threadId.slice(3);
        if (id) return `https://www.facebook.com/messages/t/${encodeURIComponent(id)}`;
      }
      if (customerRef) {
        return `https://m.me/${encodeURIComponent(customerRef)}`;
      }
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
