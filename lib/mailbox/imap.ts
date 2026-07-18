import "server-only";

/**
 * Generic IMAP fetch + intake-payload builder for the mailbox poller.
 *
 * Sibling of `lib/gmail/backfill.ts`, but provider-agnostic: it pulls new INBOX messages over IMAP
 * (imapflow) and parses MIME with mailparser, then shapes each into the SAME canonical payload the
 * Gmail path emits — except `__source: "email"` so the normalizer tags the conversation as a
 * generic mailbox (`source: "email"`) rather than Gmail.
 *
 * `mailboxMessageToIntakePayload` is a pure function (no network) so the payload shape is unit
 * testable; `fetchMailboxMessages` is the injectable network boundary the poller stubs in tests.
 */

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { MailboxEndpoint } from "@/lib/mailbox/credentials";

/** Canonical inbound payload — mirrors GmailIntakePayload with a distinct `__source`. */
export interface EmailIntakePayload {
  __source: "email";
  subject: string;
  from: { text: string };
  to: string;
  textPlain: string;
  threadId: string;
  date: string;
  headers: {
    "message-id": string;
    subject: string;
    from: string;
    to: string;
  };
}

/** Provider-neutral intermediate produced by the IMAP fetch, consumed by the pure builder. */
export interface MailboxMessage {
  uid: number;
  messageId: string | null;
  subject: string;
  from: string;
  textPlain: string;
  references: string[];
  inReplyTo: string | null;
  date: string;
  host: string;
}

function stripAngle(value: string): string {
  return value.replace(/[<>]/g, "").trim();
}

/**
 * Build the canonical intake payload from a fetched IMAP message. `threadId` prefers the References
 * root (RFC-5322 thread root), then In-Reply-To, then the message's own Message-ID — exactly the
 * generic-email keys the n8n normalizer's `threadKey` already understands. Returns null only when a
 * message is unusable (no Message-ID and no synthesizable id).
 */
export function mailboxMessageToIntakePayload(
  message: MailboxMessage,
  destinationEmail: string,
): EmailIntakePayload | null {
  const subject = (message.subject || "").trim() || "(no subject)";
  const from = (message.from || "").trim() || "unknown@unknown";
  const messageId =
    (message.messageId && message.messageId.trim()) ||
    `<mailbox-${message.uid}@${message.host}>`;

  const threadRoot =
    (message.references[0] && stripAngle(message.references[0])) ||
    (message.inReplyTo && stripAngle(message.inReplyTo)) ||
    stripAngle(messageId) ||
    String(message.uid);

  const textPlain = (message.textPlain || "").trim() || subject;

  return {
    __source: "email",
    subject,
    from: { text: from },
    to: destinationEmail,
    textPlain,
    threadId: threadRoot,
    date: message.date,
    headers: {
      "message-id": messageId,
      subject,
      from,
      to: destinationEmail,
    },
  };
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

/**
 * Connect to a mailbox over IMAP, fetch INBOX messages received since `sinceIso` (capped at `max`,
 * newest first), and return provider-neutral `MailboxMessage`s. Always logs out. Throws on
 * connection/auth failure so the poller records `last_sync_error` and moves to the next mailbox.
 */
export async function fetchMailboxMessages(
  endpoint: MailboxEndpoint,
  opts: { sinceIso: string; max: number },
): Promise<MailboxMessage[]> {
  const client = new ImapFlow({
    host: endpoint.host,
    port: endpoint.port,
    secure: endpoint.tls,
    auth: { user: endpoint.user, pass: endpoint.pass },
    logger: false,
    // Fail fast: a slow mailbox must not eat the whole poller runtime budget.
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 30_000,
  });

  const since = new Date(opts.sinceIso);
  const results: MailboxMessage[] = [];

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const found = await client.search({ since }, { uid: true });
    const uids = (Array.isArray(found) ? found : [])
      .slice(-Math.max(1, opts.max)); // newest `max` uids

    if (uids.length > 0) {
      for await (const msg of client.fetch(
        uids,
        { source: true, envelope: true, internalDate: true },
        { uid: true },
      )) {
        const source = msg.source;
        if (!source) continue;
        const parsed = await simpleParser(source);

        const dateIso =
          (parsed.date instanceof Date && !Number.isNaN(parsed.date.getTime())
            ? parsed.date
            : msg.internalDate instanceof Date
              ? msg.internalDate
              : new Date()
          ).toISOString();

        const fromText =
          parsed.from?.text ??
          (msg.envelope?.from?.[0]
            ? `${msg.envelope.from[0].name ?? ""} <${msg.envelope.from[0].address ?? ""}>`.trim()
            : "");

        results.push({
          uid: typeof msg.uid === "number" ? msg.uid : 0,
          messageId: parsed.messageId ?? msg.envelope?.messageId ?? null,
          subject: parsed.subject ?? msg.envelope?.subject ?? "",
          from: fromText,
          textPlain: parsed.text ?? "",
          references: asStringArray(parsed.references),
          inReplyTo: parsed.inReplyTo ?? null,
          date: dateIso,
          host: endpoint.host,
        });
      }
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {
      /* best-effort close */
    });
  }

  return results;
}
