import "server-only";

/**
 * Server-side generic-mailbox credential resolution (any-provider IMAP/SMTP).
 *
 * Sibling of `lib/gmail/credentials.ts`, but for `credential_type='imap'` rows that carry
 * host/port/tls columns (migration 20260718120000). Loads the connected mailbox for a workspace and
 * decrypts the stored password(s) so the inbound poller (IMAP) and the outbound SMTP transport can
 * use them. Decryption happens ONLY here on the server — n8n never sees a secret (CLAUDE.md rule).
 *
 * SMTP reuses the IMAP password unless a distinct `smtp_password_encrypted` override is stored.
 * Requires a service-role Supabase client for the poller path; the settings UI reads via RLS.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, isEncryptionConfigured } from "@/lib/encryption/credential-secret";

export interface MailboxEndpoint {
  host: string;
  port: number;
  tls: boolean;
  user: string;
  pass: string;
}

export interface ResolvedMailboxCredential {
  id: string;
  workspaceId: string;
  teamId: string | null;
  emailAddress: string;
  /** Present only when imap_host is configured. */
  imap: MailboxEndpoint | null;
  /** Present only when smtp_host is configured. */
  smtp: MailboxEndpoint | null;
}

export type MailboxCredentialError =
  | "encryption_not_configured"
  | "no_connected_credential"
  | "incomplete_credential"
  | "decrypt_failed";

export interface MailboxCredentialResult {
  ok: boolean;
  credential?: ResolvedMailboxCredential;
  error?: MailboxCredentialError;
}

type MailboxRow = {
  id: string;
  workspace_id: string;
  team_id: string | null;
  email_address: string;
  imap_username: string | null;
  imap_password_encrypted: string | null;
  smtp_password_encrypted: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_tls: boolean | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_tls: boolean | null;
};

const MAILBOX_SELECT =
  "id, workspace_id, team_id, email_address, imap_username, imap_password_encrypted, smtp_password_encrypted, imap_host, imap_port, imap_tls, smtp_host, smtp_port, smtp_tls";

/**
 * Resolve the connected generic mailbox for a workspace. Returns decrypted IMAP/SMTP endpoints, or a
 * typed error the caller maps to an HTTP status / skip. Never throws for expected failure modes
 * (missing / incomplete / undecryptable) — only the returned `error` signals them.
 *
 * IMPORTANT: this only matches `credential_type='imap'` rows, so it NEVER resolves a Gmail OAuth
 * credential. A workspace with only Gmail OAuth returns `no_connected_credential` here.
 */
export async function getWorkspaceMailboxCredential(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<MailboxCredentialResult> {
  if (!isEncryptionConfigured()) {
    return { ok: false, error: "encryption_not_configured" };
  }

  const { data: row, error } = await supabase
    .from("gmail_credentials")
    .select(MAILBOX_SELECT)
    .eq("workspace_id", workspaceId)
    .eq("credential_type", "imap")
    .eq("status", "connected")
    .not("imap_host", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !row) {
    return { ok: false, error: "no_connected_credential" };
  }

  const cred = row as MailboxRow;
  const user = (cred.imap_username || cred.email_address || "").trim();
  if (!user || !cred.imap_password_encrypted) {
    return { ok: false, error: "incomplete_credential" };
  }

  let imapPass: string;
  let smtpPass: string;
  try {
    imapPass = decryptSecret(cred.imap_password_encrypted);
    smtpPass = cred.smtp_password_encrypted
      ? decryptSecret(cred.smtp_password_encrypted)
      : imapPass;
  } catch {
    return { ok: false, error: "decrypt_failed" };
  }

  const imap: MailboxEndpoint | null = cred.imap_host
    ? {
        host: cred.imap_host,
        port: cred.imap_port ?? 993,
        tls: cred.imap_tls ?? true,
        user,
        pass: imapPass,
      }
    : null;

  const smtp: MailboxEndpoint | null = cred.smtp_host
    ? {
        host: cred.smtp_host,
        port: cred.smtp_port ?? 587,
        tls: cred.smtp_tls ?? false,
        user,
        pass: smtpPass,
      }
    : null;

  return {
    ok: true,
    credential: {
      id: cred.id,
      workspaceId: cred.workspace_id,
      teamId: cred.team_id,
      emailAddress: cred.email_address,
      imap,
      smtp,
    },
  };
}
