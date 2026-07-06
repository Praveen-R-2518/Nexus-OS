import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pure, dependency-free webhook parsing helpers — kept separate from route.ts so they can be
 * unit-tested without pulling in Next route plumbing or the Supabase client.
 */

export type WebhookPlatform = "whatsapp" | "instagram" | "facebook";

export interface ExtractedMessage {
  platform: WebhookPlatform;
  id: string;
}

/**
 * Constant-time verification of Meta's `X-Hub-Signature-256` header against the raw request body.
 * Behaviour is intentionally unchanged from the original webhook implementation.
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  if (expected.length !== received.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
}

/**
 * Extract inbound message ids and their platform from a Meta webhook payload.
 *
 * - WhatsApp Cloud API: `entry[].changes[].value.messages[].id`  → platform `whatsapp`.
 * - Messenger / Instagram messaging: `entry[].messaging[].message.mid`. The owning platform is
 *   derived from the top-level `object`: `instagram` → `instagram`, otherwise `facebook` (page).
 *
 * Status/read receipts and other events with no message id yield nothing (caller ignores them).
 */
export function extractMessages(payload: unknown): ExtractedMessage[] {
  const out: ExtractedMessage[] = [];
  if (!payload || typeof payload !== "object") return out;
  const root = payload as Record<string, unknown>;

  const object = typeof root.object === "string" ? root.object : "";
  const messagingPlatform: WebhookPlatform =
    object === "instagram" ? "instagram" : "facebook";

  const entries = Array.isArray(root.entry) ? root.entry : [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    const changes = Array.isArray(e.changes) ? e.changes : [];
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as Record<string, unknown>).value;
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;
      const messages = Array.isArray(v.messages) ? v.messages : [];
      for (const msg of messages) {
        if (msg && typeof msg === "object" && (msg as Record<string, unknown>).id) {
          out.push({ platform: "whatsapp", id: String((msg as Record<string, unknown>).id) });
        }
      }
    }

    const messaging = Array.isArray(e.messaging) ? e.messaging : [];
    for (const evt of messaging) {
      if (!evt || typeof evt !== "object") continue;
      const m = evt as Record<string, unknown>;
      const message = m.message;
      if (message && typeof message === "object" && (message as Record<string, unknown>).mid) {
        out.push({
          platform: messagingPlatform,
          id: String((message as Record<string, unknown>).mid),
        });
      }
    }
  }

  return out;
}
