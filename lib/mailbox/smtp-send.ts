import "server-only";

/**
 * Generic SMTP send transport for the Channel Sender — the any-provider sibling of
 * `lib/gmail/send.ts`. `sendSmtpMessage` is the injection point the non-Gmail send path calls when a
 * workspace has a generic mailbox connected instead of Gmail OAuth.
 *
 * This transport does NOT bypass the approval gate: `lib/channel-sender.ts` only reaches it AFTER the
 * draft is `approved` (or auto-approved by policy), exactly like the Gmail path. It just replaces the
 * Gmail-API call with an authenticated SMTP submission.
 */

import nodemailer from "nodemailer";
import type { MailboxEndpoint } from "@/lib/mailbox/credentials";

export interface SmtpSendParams {
  smtp: MailboxEndpoint;
  /** Sender address (the connected mailbox). */
  from: string;
  /** Recipient address. */
  to: string;
  subject: string;
  /** Plain-text body. */
  body: string;
}

export interface SmtpSendResult {
  messageId: string;
}

export class SmtpSendError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SmtpSendError";
    this.status = status;
  }
}

/** Strip CR/LF from header values to prevent header injection (mirrors lib/gmail/send.ts). */
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * Send one plain-text email over SMTP. Throws `SmtpSendError` on any failure so the executor returns
 * 502 without mutating draft/conversation state.
 */
export async function sendSmtpMessage(params: SmtpSendParams): Promise<SmtpSendResult> {
  const from = headerSafe(params.from);
  const to = headerSafe(params.to);
  const subject = headerSafe(params.subject);

  // Sandbox transport (parity with the Gmail sandbox, docs/channel_sender.md task 1.6): when
  // CHANNEL_SENDER_TRANSPORT=sandbox, validate but DO NOT open an SMTP connection. Off by default;
  // MUST NOT be enabled in real production.
  if (process.env.CHANNEL_SENDER_TRANSPORT === "sandbox") {
    if (!to || !params.smtp.host) {
      throw new SmtpSendError("Sandbox transport: missing recipient/host", 400);
    }
    console.log(
      `[smtp:sandbox] pretend-sent to=${to} via ${params.smtp.host} (SMTP NOT called)`,
    );
    return { messageId: `sandbox-${Date.now()}` };
  }

  const transport = nodemailer.createTransport({
    host: params.smtp.host,
    port: params.smtp.port,
    secure: params.smtp.tls,
    auth: { user: params.smtp.user, pass: params.smtp.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });

  try {
    const info = await transport.sendMail({
      from,
      to,
      subject,
      text: params.body,
    });
    return { messageId: info.messageId ?? "" };
  } catch (e) {
    throw new SmtpSendError(
      `SMTP send failed: ${e instanceof Error ? e.message : String(e)}`,
      502,
    );
  } finally {
    transport.close();
  }
}
