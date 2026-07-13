import type { SupabaseClient } from "@supabase/supabase-js";
import {
  encryptSecret,
  isEncryptionConfigured,
} from "@/lib/encryption/credential-secret";
import type { SocialCredentialUpsertInput } from "@/lib/social/types";

/**
 * Upsert a social platform credential with AES-encrypted tokens only.
 * Never writes to legacy plaintext access_token / refresh_token columns.
 */
export async function upsertSocialCredential(
  supabase: SupabaseClient,
  input: SocialCredentialUpsertInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isEncryptionConfigured()) {
    return { ok: false, error: "Encryption is not configured" };
  }

  const organizationId = input.organizationId.trim();
  const platform = input.platform.trim();
  const accessToken = input.accessToken.trim();

  if (!organizationId || !platform || !accessToken) {
    return { ok: false, error: "organizationId, platform, and accessToken are required" };
  }

  let accessTokenEncrypted: string;
  let refreshTokenEncrypted: string | null = null;

  try {
    accessTokenEncrypted = encryptSecret(accessToken);
    if (input.refreshToken?.trim()) {
      refreshTokenEncrypted = encryptSecret(input.refreshToken.trim());
    }
  } catch {
    return { ok: false, error: "Failed to encrypt credentials" };
  }

  const now = new Date().toISOString();
  const row = {
    organization_id: organizationId,
    platform,
    access_token_encrypted: accessTokenEncrypted,
    refresh_token_encrypted: refreshTokenEncrypted,
    token_expires_at: input.tokenExpiresAt ?? null,
    access_token: null,
    refresh_token: null,
    updated_at: now,
  };

  const { error } = await supabase
    .from("social_credentials")
    .upsert(row, { onConflict: "organization_id,platform" });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
