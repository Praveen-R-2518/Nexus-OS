import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getWorkspaceGmailCredential } from "@/lib/gmail/credentials";
import { sendGmailMessage } from "@/lib/gmail/send";
import { getWorkspaceMailboxCredential } from "@/lib/mailbox/credentials";
import { sendSmtpMessage } from "@/lib/mailbox/smtp-send";
import type { PeopleEmailTransport } from "@/types";

export type PeopleSendParams = {
  to: string;
  subject: string;
  body: string;
};

export type PeopleSendOk = {
  ok: true;
  messageId: string;
  transport: PeopleEmailTransport;
};

export type PeopleSendErr = {
  ok: false;
  status: number;
  error: string;
};

function usedTransport(kind: "gmail" | "smtp"): PeopleEmailTransport {
  if (process.env.CHANNEL_SENDER_TRANSPORT === "sandbox") return "sandbox";
  return kind;
}

function fail(status: number, error: string): PeopleSendErr {
  return { ok: false, status, error };
}

/**
 * Send one People composer letter. Gmail OAuth first, then IMAP mailbox SMTP.
 * Does not mutate People roster rows. Does not go through channel-sender / reply_drafts.
 */
export async function sendPeopleEmail(
  supabase: SupabaseClient,
  workspaceId: string | null,
  params: PeopleSendParams,
): Promise<PeopleSendOk | PeopleSendErr> {
  if (!workspaceId) {
    return fail(409, "No connected mailbox for this workspace");
  }

  const gmail = await getWorkspaceGmailCredential(supabase, workspaceId);
  if (gmail.ok && gmail.credential) {
    try {
      const result = await sendGmailMessage({
        accessToken: gmail.credential.accessToken,
        from: gmail.credential.emailAddress,
        to: params.to,
        subject: params.subject,
        body: params.body,
      });
      return {
        ok: true,
        messageId: result.messageId,
        transport: usedTransport("gmail"),
      };
    } catch {
      return fail(502, "Failed to send email");
    }
  }

  const gmailError = gmail.error;
  switch (gmailError) {
    case "no_connected_credential":
    case "incomplete_credential":
    case undefined:
      break;
    case "encryption_not_configured":
      return fail(503, "Server configuration error");
    case "refresh_failed":
    case "decrypt_failed":
      return fail(502, "Gmail credential could not be used to send");
    default: {
      const unexpected: never = gmailError;
      return fail(409, `No connected mailbox (${String(unexpected)})`);
    }
  }

  const mailbox = await getWorkspaceMailboxCredential(supabase, workspaceId);
  if (mailbox.ok && mailbox.credential?.smtp) {
    try {
      const result = await sendSmtpMessage({
        smtp: mailbox.credential.smtp,
        from: mailbox.credential.emailAddress,
        to: params.to,
        subject: params.subject,
        body: params.body,
      });
      return {
        ok: true,
        messageId: result.messageId,
        transport: usedTransport("smtp"),
      };
    } catch {
      return fail(502, "Failed to send email");
    }
  }

  const mailboxError = mailbox.error;
  switch (mailboxError) {
    case "decrypt_failed":
      return fail(502, "Mailbox credential could not be used to send");
    case "encryption_not_configured":
      return fail(503, "Server configuration error");
    case "no_connected_credential":
    case "incomplete_credential":
    case undefined:
      return fail(409, "No connected mailbox for this workspace");
    default: {
      const unexpected: never = mailboxError;
      return fail(409, `No connected mailbox (${String(unexpected)})`);
    }
  }
}
