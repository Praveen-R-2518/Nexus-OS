/**
 * Types for social platform OAuth credentials (social_credentials table).
 * Tokens are stored AES-encrypted in access_token_encrypted / refresh_token_encrypted.
 */

export interface SocialCredentialRow {
  id: string;
  organization_id: string;
  platform: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialCredentialUpsertInput {
  organizationId: string;
  platform: string;
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null;
}
