import "server-only";

import type { InboundPlatform } from "@/lib/inbound-events";

/**
 * Shared n8n intake-forward helper (channel-agnostic).
 *
 * All inbound channels are forwarded to the SAME n8n webhook path
 * (`${N8N_WEBHOOK_BASE_URL}/webhook/gmail-inbound`), disambiguated by the `x-nexus-channel` header
 * (see docs/NEXUS_REBUILD_CONTEXT §5). Both the live Meta webhook and the ledger drain worker
 * (app/api/internal/n8n/inbound-replay) forward through here so the transport lives in one place.
 */

export type ForwardOutcome = "forwarded" | "skipped" | "failed";

export type IntakeChannel = "meta" | "gmail";

/** Map a ledger platform to the `x-nexus-channel` header value n8n branches on. */
export function channelForPlatform(platform: InboundPlatform): IntakeChannel {
  return platform === "gmail" ? "gmail" : "meta";
}

export function n8nIntakeWebhookUrl(): string | null {
  const base = process.env.N8N_WEBHOOK_BASE_URL?.trim()?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/webhook/gmail-inbound`;
}

/**
 * Forward a payload to the n8n intake webhook.
 *
 * Returns:
 *  - "skipped"  when N8N_WEBHOOK_BASE_URL is not configured (caller should leave the event for retry
 *               WITHOUT burning an attempt),
 *  - "failed"   when n8n returned non-2xx or the request threw (retriable),
 *  - "forwarded" on success.
 */
export async function forwardInboundToN8n(
  payload: unknown,
  channel: IntakeChannel,
): Promise<ForwardOutcome> {
  const url = n8nIntakeWebhookUrl();
  if (!url) {
    console.warn("[n8n-intake] N8N_WEBHOOK_BASE_URL not set; leaving events for later retry");
    return "skipped";
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-nexus-channel": channel,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("[n8n-intake] forward failed:", res.status, await res.text());
      return "failed";
    }
    return "forwarded";
  } catch (err) {
    console.error("[n8n-intake] forward error:", err);
    return "failed";
  }
}
