-- Task 4.3: AES-encrypted token storage for social_credentials (pattern: meta_credentials / gmail_credentials).
-- Legacy plaintext columns access_token / refresh_token remain for a follow-up drop migration.

ALTER TABLE public.social_credentials
  ADD COLUMN IF NOT EXISTS access_token_encrypted text,
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted text;

-- Writers stop populating legacy plaintext columns; allow NULL on access_token.
ALTER TABLE public.social_credentials
  ALTER COLUMN access_token DROP NOT NULL;
