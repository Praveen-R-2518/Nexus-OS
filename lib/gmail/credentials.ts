/**
 * Server-side Gmail credential resolution for the Channel Sender (docs/channel_sender.md).
 *
 * Loads the connected OAuth credential for a workspace, decrypts the stored tokens, refreshes
 * the access token when it is near expiry (persisting the new value), and returns a usable
 * access token. Decryption and refresh MUST happen here on the server — n8n never sees a token
 * (CLAUDE.md secrets rule). This mirrors the read path in
 * `app/api/internal/n8n/gmail-credentials/route.ts`; that route may adopt this helper later.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptSecret,
  encryptSecret,
  isEncryptionConfigured,
} from "@/lib/encryption/credential-secret";

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export interface ResolvedGmailCredential {
  id: string;
  workspaceId: string;
  teamId: string | null;
  emailAddress: string;
  accessToken: string;
  tokenExpiry: string;
}

export type GmailCredentialError =
  | "encryption_not_configured"
  | "no_connected_credential"
  | "incomplete_credential"
  | "refresh_failed"
  | "decrypt_failed";

export interface GmailCredentialResult {
  ok: boolean;
  credential?: ResolvedGmailCredential;
  error?: GmailCredentialError;
}

type CredentialRow = {
  id: string;
  workspace_id: string;
  team_id: string | null;
  email_address: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expiry: string | null;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

function tokenNeedsRefresh(tokenExpiry: string | null): boolean {
  if (!tokenExpiry) return true;
  const expiryMs = new Date(tokenExpiry).getTime();
  if (Number.isNaN(expiryMs)) return true;
  return expiryMs <= Date.now() + TOKEN_REFRESH_BUFFER_MS;
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; tokenExpiry: string } | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as GoogleTokenResponse;
    if (typeof json.access_token !== "string" || !json.access_token) return null;
    const expiresIn =
      typeof json.expires_in === "number" && json.expires_in > 0
        ? json.expires_in
        : 3600;
    return {
      accessToken: json.access_token,
      tokenExpiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a send-ready Gmail credential for a workspace. Returns a decrypted, refreshed access
 * token, or a typed error the caller maps to an HTTP status. Never throws for expected failure
 * modes (missing/incomplete/expired credential) — only the returned `error` signals them.
 */
export async function getWorkspaceGmailCredential(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<GmailCredentialResult> {
  if (!isEncryptionConfigured()) {
    return { ok: false, error: "encryption_not_configured" };
  }

  const { data: row, error } = await supabase
    .from("gmail_credentials")
    .select(
      "id, workspace_id, team_id, email_address, access_token_encrypted, refresh_token_encrypted, token_expiry",
    )
    .eq("workspace_id", workspaceId)
    .eq("credential_type", "oauth")
    .eq("status", "connected")
    .eq("sync_enabled", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !row) {
    return { ok: false, error: "no_connected_credential" };
  }

  const cred = row as CredentialRow;
  if (!cred.access_token_encrypted || !cred.refresh_token_encrypted) {
    return { ok: false, error: "incomplete_credential" };
  }

  let accessToken: string;
  let refreshToken: string;
  try {
    accessToken = decryptSecret(cred.access_token_encrypted);
    refreshToken = decryptSecret(cred.refresh_token_encrypted);
  } catch {
    return { ok: false, error: "decrypt_failed" };
  }

  let tokenExpiry = cred.token_expiry ?? "";

  if (tokenNeedsRefresh(cred.token_expiry)) {
    const refreshed = await refreshAccessToken(refreshToken);
    if (!refreshed) {
      await supabase
        .from("gmail_credentials")
        .update({ last_sync_error: "Token refresh failed" })
        .eq("id", cred.id);
      return { ok: false, error: "refresh_failed" };
    }

    let encryptedAccessToken: string;
    try {
      encryptedAccessToken = encryptSecret(refreshed.accessToken);
    } catch {
      return { ok: false, error: "refresh_failed" };
    }

    await supabase
      .from("gmail_credentials")
      .update({
        access_token_encrypted: encryptedAccessToken,
        token_expiry: refreshed.tokenExpiry,
        last_sync_error: null,
      })
      .eq("id", cred.id);

    accessToken = refreshed.accessToken;
    tokenExpiry = refreshed.tokenExpiry;
  }

  return {
    ok: true,
    credential: {
      id: cred.id,
      workspaceId: cred.workspace_id,
      teamId: cred.team_id,
      emailAddress: cred.email_address,
      accessToken,
      tokenExpiry,
    },
  };
}
