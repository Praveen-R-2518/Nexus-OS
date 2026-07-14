/**
 * Meta messaging-window policy (WhatsApp / Messenger / Instagram) — pure, no DB/network.
 *
 * Meta forbids arbitrary outbound messages. What you may send depends on how long ago the
 * customer last messaged you (the "customer service" / 24-hour window) and the channel:
 *
 *   - WhatsApp Cloud API: free-form ("session") messages only within 24h of the customer's last
 *     inbound message. Outside 24h you MUST use a pre-approved message **template** (HSM). A
 *     template can be sent at any time (it re-opens a conversation).
 *   - Messenger / Instagram: free-form messages only within the 24h standard messaging window.
 *     Outside 24h a message is allowed ONLY with a message tag — we support `HUMAN_AGENT`, which
 *     (with the Human Agent permission) extends the window to 7 days for a human follow-up. There
 *     is no template mechanism on these channels, so past 7 days we are blocked.
 *
 * This module decides the *strategy*; it never sends. See lib/meta/send.ts (disabled skeleton)
 * and docs/meta_outbound.md. Keep this the single source of truth for window math so the sender,
 * the approval UI, and any future scheduler all agree.
 */

export type MetaPlatform = "whatsapp" | "instagram" | "facebook";

/**
 * What the sender is permitted to do right now for this conversation.
 *   - session_text     free-form text is allowed (inside the 24h window)
 *   - template         WhatsApp only: outside 24h → must send an approved template (HSM)
 *   - human_agent_tag  Messenger/IG: outside 24h but within 7d → send tagged HUMAN_AGENT
 *   - blocked          nothing may be sent now (reason explains why)
 */
export type SendStrategy =
  | { kind: "session_text" }
  | { kind: "template" }
  | { kind: "human_agent_tag" }
  | { kind: "blocked"; reason: string };

export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h — free-form window (all channels)
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7d — Messenger/IG Human Agent tag

/**
 * Milliseconds since the customer's last inbound message, or `null` when it is unknown/invalid.
 * `null` means "we cannot prove we are inside any window" and callers must treat it as outside.
 */
export function msSinceLastInbound(
  lastInboundAt: string | number | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (lastInboundAt === null || lastInboundAt === undefined) return null;
  const t = new Date(lastInboundAt).getTime();
  if (Number.isNaN(t)) return null;
  const delta = now.getTime() - t;
  // A future timestamp is treated as "just now" (delta 0), never negative.
  return delta < 0 ? 0 : delta;
}

/** True only when we can prove the customer messaged within the last 24h. */
export function withinServiceWindow(
  lastInboundAt: string | number | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  const ms = msSinceLastInbound(lastInboundAt, now);
  return ms !== null && ms < SERVICE_WINDOW_MS;
}

export interface StrategyInput {
  platform: MetaPlatform;
  /** Timestamp of the customer's most recent inbound message (ISO string / epoch / Date). */
  lastInboundAt: string | number | Date | null | undefined;
  now?: Date;
  /**
   * Whether the app holds the Human Agent permission for Messenger/Instagram. Only then may we
   * use the HUMAN_AGENT tag to reach a customer between 24h and 7d after their last message.
   */
  humanAgentEnabled?: boolean;
}

/**
 * Decide how (or whether) we may message the customer right now. Deterministic and side-effect
 * free so it can gate the approval UI and be unit-tested without infrastructure.
 */
export function chooseSendStrategy(input: StrategyInput): SendStrategy {
  const { platform, lastInboundAt, now = new Date(), humanAgentEnabled = false } = input;
  const ms = msSinceLastInbound(lastInboundAt, now);
  const insideServiceWindow = ms !== null && ms < SERVICE_WINDOW_MS;

  if (insideServiceWindow) return { kind: "session_text" };

  if (platform === "whatsapp") {
    // Outside 24h (or unknown) → a template is the only compliant option, and it always works.
    return { kind: "template" };
  }

  // Messenger / Instagram: no templates. HUMAN_AGENT tag extends to 7d if we hold the permission.
  if (ms === null) {
    return { kind: "blocked", reason: "no known inbound message; cannot verify messaging window" };
  }
  if (humanAgentEnabled && ms < HUMAN_AGENT_WINDOW_MS) {
    return { kind: "human_agent_tag" };
  }
  return {
    kind: "blocked",
    reason:
      ms < HUMAN_AGENT_WINDOW_MS
        ? "outside 24h window and Human Agent permission not enabled"
        : "outside the 7-day Human Agent window",
  };
}
