/**
 * Server-side Meta credential resolution for the Channel Sender
 * (docs/meta_outbound.md §3). Mirrors lib/gmail/credentials.ts: load the
 * connected `meta_credentials` row for a workspace + platform, decrypt the
 * long-lived page/user token server-side, and return the sender asset id
 * (WhatsApp phone_number_id, or the Facebook/Instagram page id). n8n never
 * sees a token — decryption happens only here in the Next.js executor.
 *
 * Meta long-lived tokens have no refresh grant; when one is expired the
 * founder must reconnect via OAuth, so this returns a typed error instead of
 * attempting a refresh.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetaPlatform } from "@/lib/meta/window";
import {
  decryptSecret,
  isEncryptionConfigured,
} from "@/lib/encryption/credential-secret";

export interface ResolvedMetaCredential {
  id: string;
  workspaceId: string;
  teamId: string | null;
  platform: MetaPlatform;
  accessToken: string;
  /** WhatsApp phone_number_id, or Facebook/Instagram page id — the Graph send path id. */
  senderId: string;
}

export type MetaCredentialError =
  | "encryption_not_configured"
  | "no_connected_credential"
  | "incomplete_credential"
  | "token_expired"
  | "decrypt_failed";

export interface MetaCredentialResult {
  ok: boolean;
  credential?: ResolvedMetaCredential;
  error?: MetaCredentialError;
}

type CredentialRow = {
  id: string;
  workspace_id: string;
  team_id: string | null;
  platform: string;
  page_id: string | null;
  wa_phone_number_id: string | null;
  access_token_encrypted: string | null;
  token_expiry: string | null;
};

export async function getWorkspaceMetaCredential(
  supabase: SupabaseClient,
  workspaceId: string,
  platform: MetaPlatform,
): Promise<MetaCredentialResult> {
  if (!isEncryptionConfigured()) {
    return { ok: false, error: "encryption_not_configured" };
  }

  const { data: row, error } = await supabase
    .from("meta_credentials")
    .select(
      "id, workspace_id, team_id, platform, page_id, wa_phone_number_id, access_token_encrypted, token_expiry",
    )
    .eq("workspace_id", workspaceId)
    .eq("platform", platform)
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !row) {
    return { ok: false, error: "no_connected_credential" };
  }

  const cred = row as CredentialRow;
  const senderId =
    platform === "whatsapp"
      ? (cred.wa_phone_number_id ?? "").trim()
      : (cred.page_id ?? "").trim();

  if (!cred.access_token_encrypted || !senderId) {
    return { ok: false, error: "incomplete_credential" };
  }

  if (cred.token_expiry) {
    const expiryMs = new Date(cred.token_expiry).getTime();
    if (Number.isFinite(expiryMs) && expiryMs <= Date.now()) {
      await supabase
        .from("meta_credentials")
        .update({ last_sync_error: "Token expired — reconnect required" })
        .eq("id", cred.id);
      return { ok: false, error: "token_expired" };
    }
  }

  let accessToken: string;
  try {
    accessToken = decryptSecret(cred.access_token_encrypted);
  } catch {
    return { ok: false, error: "decrypt_failed" };
  }

  return {
    ok: true,
    credential: {
      id: cred.id,
      workspaceId: cred.workspace_id,
      teamId: cred.team_id,
      platform,
      accessToken,
      senderId,
    },
  };
}
