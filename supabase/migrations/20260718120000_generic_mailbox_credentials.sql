-- Generic mailbox (any-provider IMAP/SMTP) credential storage (additive).
--
-- Extends the existing `gmail_credentials` table so a workspace can connect ANY mailbox
-- (Zoho, Outlook/Microsoft 365, cPanel/GoDaddy, custom) via IMAP intake + SMTP send, alongside
-- the existing Gmail OAuth path. These rows use `credential_type = 'imap'` (already a valid value
-- from migration 0006) and are read ONLY by the new mailbox poller / SMTP sender — the Gmail OAuth
-- path (`credential_type = 'oauth'`) is untouched.
--
-- RLS: no new table is created, so the existing Row Level Security on `gmail_credentials`
-- ("Owner manages gmail credentials" / "Team members read gmail credentials" from 0006) plus the
-- `trg_gmail_credentials_set_team_from_workspace` trigger already cover every column added here.
-- RLS is INHERITED, not re-declared.
--
-- Password storage: SMTP reuses `imap_password_encrypted` by default (Zoho/Outlook/cPanel all use
-- one account password for both protocols). `smtp_password_encrypted` is a NULLABLE override for
-- the rare provider that needs a distinct SMTP secret; the sender falls back to the IMAP password
-- when it is null. Both remain AES-256-GCM encrypted at rest (lib/encryption/credential-secret.ts).

alter table public.gmail_credentials
  add column if not exists imap_host text,
  add column if not exists imap_port integer,
  add column if not exists imap_tls boolean not null default true,
  add column if not exists smtp_host text,
  add column if not exists smtp_port integer,
  add column if not exists smtp_tls boolean not null default true,
  add column if not exists smtp_password_encrypted text;

-- The mailbox poller walks connected, sync-enabled generic mailboxes. This partial index keeps that
-- scan cheap and, by construction, never matches Gmail OAuth rows or the legacy Gmail-only IMAP
-- rows (which have a null imap_host).
create index if not exists gmail_credentials_imap_sync_idx
  on public.gmail_credentials (workspace_id, sync_enabled)
  where credential_type = 'imap' and imap_host is not null;
