/**
 * Meta outbound sender — implemented but gated OFF by default.
 *
 * `sendMetaMessage` performs the real Graph API POST ONLY when the
 * `META_SEND_ENABLED=true` env kill-switch is set (it is NOT set anywhere by
 * default); otherwise it throws 501 exactly like the original groundwork so no
 * code path can deliver a Meta message before Meta App Review grants the
 * messaging permissions. The full path (credential decrypt → window strategy →
 * request build → POST → provider message id) is wired through
 * lib/channel-sender.ts; see docs/meta_outbound.md §6 for the enable checklist.
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

/** Kill-switch: live Graph sends happen ONLY when this env var is exactly "true". */
export function isMetaSendEnabled(): boolean {
  return process.env.META_SEND_ENABLED?.trim() === "true";
}

type GraphSendResponse = {
  // WhatsApp Cloud API shape
  messages?: Array<{ id?: string }>;
  // Messenger / Instagram Send API shape
  message_id?: string;
  error?: { message?: string; code?: number };
};

/** Access token param for the send call. Never log or persist the token. */
export interface MetaSendAuth {
  accessToken: string;
}

/**
 * Send one approved reply via the Graph API. Gated by META_SEND_ENABLED: when the
 * kill-switch is off this throws the same 501 the groundwork version threw, so
 * flipping one env var (after Meta App Review) is the only enable step.
 * Throws MetaSendError on any Graph failure — the channel sender maps that to a
 * 502 with NO draft state change, so a replay can retry safely.
 */
export async function sendMetaMessage(
  params: MetaSendParams,
  auth?: MetaSendAuth,
): Promise<{ messageId: string }> {
  if (!isMetaSendEnabled() || !auth?.accessToken) {
    throw new MetaSendError(
      `Meta outbound is not enabled for '${params.platform}' (set META_SEND_ENABLED=true after Meta App Review — see docs/meta_outbound.md §6)`,
      501,
    );
  }

  const request = buildMetaSendRequest(params);

  let res: Response;
  let raw: string;
  try {
    res = await fetch(request.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request.body),
    });
    raw = await res.text();
  } catch (e) {
    throw new MetaSendError(
      `Graph API request failed: ${e instanceof Error ? e.message : "network error"}`,
      502,
    );
  }

  let data: GraphSendResponse = {};
  try {
    data = raw ? (JSON.parse(raw) as GraphSendResponse) : {};
  } catch {
    /* non-JSON error body — handled below */
  }

  if (!res.ok) {
    const detail = data.error?.message ?? raw.slice(0, 300);
    throw new MetaSendError(`Graph API error ${res.status}: ${detail}`, res.status);
  }

  // WhatsApp returns messages[0].id (wamid); Messenger/Instagram return message_id.
  const messageId = data.messages?.[0]?.id ?? data.message_id ?? "";
  if (!messageId) {
    throw new MetaSendError("Graph API response did not include a message id", 502);
  }
  return { messageId };
}
