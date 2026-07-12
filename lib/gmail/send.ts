/**
 * Gmail send transport for the Channel Sender (docs/channel_sender.md).
 *
 * `sendGmailMessage` is the injection point: the send-reply executor calls it, tests replace
 * this module with a mock (no network). The default implementation calls the Gmail API
 * `users.messages.send`.
 *
 * ⚠️ Read-only-scope limitation: Gmail OAuth currently requests only `gmail.readonly`
 * (app/api/gmail/helpers.ts). `users.messages.send` needs the `gmail.send` scope, which the
 * human is re-provisioning on the production domain. Until then the default transport receives
 * a 403 from Google — expected. No code change is needed once the scope is granted.
 */

const GMAIL_SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export interface SendEmailParams {
  /** Decrypted, fresh OAuth access token (resolved server-side). */
  accessToken: string;
  /** Sender address (the connected Gmail account). */
  from: string;
  /** Recipient address. */
  to: string;
  subject: string;
  /** Plain-text body. */
  body: string;
}

export interface SendEmailResult {
  messageId: string;
}

export class GmailSendError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GmailSendError";
    this.status = status;
  }
}

/** Encode headers over-cautiously: strip CR/LF to prevent header injection. */
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** Build a base64url-encoded RFC-822 message for the Gmail API. */
export function buildRawMessage(params: Omit<SendEmailParams, "accessToken">): string {
  const headers = [
    `From: ${headerSafe(params.from)}`,
    `To: ${headerSafe(params.to)}`,
    `Subject: ${headerSafe(params.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
  ];
  const raw = `${headers.join("\r\n")}\r\n\r\n${params.body}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}

/**
 * Default transport: send one plain-text email via the Gmail API. Throws `GmailSendError` on
 * any non-2xx response so the executor can return 502 without mutating draft/conversation state.
 */
export async function sendGmailMessage(
  params: SendEmailParams,
): Promise<SendEmailResult> {
  const raw = buildRawMessage(params);

  // Sandbox transport (docs/channel_sender.md, task 1.6): when
  // CHANNEL_SENDER_TRANSPORT=sandbox, build+validate the message but DO NOT call Gmail — used to
  // prove the full send path (status transitions + idempotency) while Gmail is read-only. This is
  // env-gated and OFF by default; it MUST NOT be enabled in real production.
  if (process.env.CHANNEL_SENDER_TRANSPORT === "sandbox") {
    if (!params.accessToken || !params.to) {
      throw new GmailSendError("Sandbox transport: missing accessToken/recipient", 400);
    }
    console.log(
      `[gmail:sandbox] pretend-sent to=${params.to} bytes=${raw.length} (Gmail NOT called)`,
    );
    return { messageId: `sandbox-${Date.now()}` };
  }

  let res: Response;
  try {
    res = await fetch(GMAIL_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
  } catch (e) {
    throw new GmailSendError(
      `Gmail transport network error: ${e instanceof Error ? e.message : String(e)}`,
      502,
    );
  }

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new GmailSendError(
      `Gmail send failed (${res.status}): ${text.slice(0, 500)}`,
      res.status,
    );
  }

  let messageId = "";
  try {
    const json = text ? (JSON.parse(text) as { id?: string }) : {};
    messageId = typeof json.id === "string" ? json.id : "";
  } catch {
    messageId = "";
  }

  return { messageId };
}
