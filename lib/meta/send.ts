/**
 * Meta outbound sender — GROUNDWORK ONLY (checklist 1.7). Live sending is intentionally DISABLED.
 *
 * This mirrors the shape of lib/gmail/send.ts so a future task can wire Meta into the same
 * approval-gated channel-sender path (lib/channel-sender.ts). It builds the exact Graph API
 * request we intend to make per platform + window strategy, but `sendMetaMessage` throws instead
 * of calling Graph — nothing is ever delivered from here yet.
 *
 * When we DO enable it (separate task): (1) load the workspace's `meta_credentials` row, decrypt
 * `access_token_encrypted` server-side (never in n8n), (2) call `chooseSendStrategy` from
 * lib/meta/window.ts, (3) POST `buildMetaSendRequest(...)`, (4) map the returned message id back
 * to `reply_drafts` and advance statuses exactly like the Gmail path. See docs/meta_outbound.md.
 */

import type { MetaPlatform, SendStrategy } from "@/lib/meta/window";

/** Keep in sync with META_GRAPH_VERSION in app/api/meta/helpers.ts. */
const GRAPH_VERSION = "v21.0";

export class MetaSendError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "MetaSendError";
    this.status = status;
  }
}

export interface MetaSendParams {
  platform: MetaPlatform;
  /** WhatsApp phone_number_id, or Facebook page id / Instagram-linked page id. */
  senderId: string;
  /** WhatsApp: customer E.164 number. Messenger/Instagram: recipient PSID / IGSID. */
  recipientId: string;
  /** The approved reply text (used for session_text and human_agent_tag strategies). */
  text: string;
  /** How we're allowed to send right now — from chooseSendStrategy(). */
  strategy: SendStrategy;
  /** Required when strategy.kind === "template" (WhatsApp outside the 24h window). */
  template?: {
    name: string;
    languageCode: string;
    /** Template components (body/button parameters). Left opaque here on purpose. */
    components?: unknown[];
  };
}

export interface MetaSendRequest {
  url: string;
  body: Record<string, unknown>;
}

function graphUrl(path: string): string {
  return `https://graph.facebook.com/${GRAPH_VERSION}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Build the Graph API request we WOULD POST for a given send. Pure + exported so it can be
 * unit-tested and reviewed before any live call exists. Does not send.
 */
export function buildMetaSendRequest(params: MetaSendParams): MetaSendRequest {
  const { platform, senderId, recipientId, text, strategy } = params;

  if (platform === "whatsapp") {
    const url = graphUrl(`/${senderId}/messages`);
    if (strategy.kind === "template") {
      if (!params.template) {
        throw new MetaSendError("WhatsApp template strategy requires a template", 400);
      }
      return {
        url,
        body: {
          messaging_product: "whatsapp",
          to: recipientId,
          type: "template",
          template: {
            name: params.template.name,
            language: { code: params.template.languageCode },
            ...(params.template.components ? { components: params.template.components } : {}),
          },
        },
      };
    }
    if (strategy.kind === "session_text") {
      return {
        url,
        body: {
          messaging_product: "whatsapp",
          to: recipientId,
          type: "text",
          text: { body: text },
        },
      };
    }
    throw new MetaSendError(`WhatsApp cannot use strategy '${strategy.kind}'`, 409);
  }

  // Messenger (facebook) / Instagram share the Send API shape (POST /{pageId}/messages).
  const url = graphUrl(`/${senderId}/messages`);
  if (strategy.kind === "session_text") {
    return {
      url,
      body: {
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message: { text },
      },
    };
  }
  if (strategy.kind === "human_agent_tag") {
    return {
      url,
      body: {
        recipient: { id: recipientId },
        messaging_type: "MESSAGE_TAG",
        tag: "HUMAN_AGENT",
        message: { text },
      },
    };
  }
  throw new MetaSendError(`${platform} cannot use strategy '${strategy.kind}'`, 409);
}

/**
 * DISABLED. Live Meta sending is not implemented (checklist 1.7 is groundwork only). This throws
 * so no code path can silently deliver a Meta message before the real, reviewed implementation +
 * approval-gating + credential handling land. The request the live version will POST is available
 * via `buildMetaSendRequest` for tests and review.
 */
export async function sendMetaMessage(params: MetaSendParams): Promise<{ messageId: string }> {
  throw new MetaSendError(
    `Meta outbound is not enabled for '${params.platform}' (checklist 1.7 groundwork only — see docs/meta_outbound.md)`,
    501,
  );
}
